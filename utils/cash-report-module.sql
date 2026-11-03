/*
  Module rapports de caisse - SQL Server.
  Prerequis: tblCashReport, tblCashSession, tblCashRegister, tblSale,
             tblSalePayment, tblDebtPayment, tblExpense, tblRefCashReportStatus,
             tblRefCashSessionStatus, tblRefPaymentMethod, tblRefPaymentStatus.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Rapport enrichi du statut, de la session, de la caisse et de la boutique. */
CREATE OR ALTER VIEW dbo.vw_CashReportDetails
AS
	SELECT
		cr.*,
		rs.vcCode AS statusCode,
		rs.vcCashReportStatus,
		cs.userId AS sessionUserId,
		cs.mOpeningCaisse,
		r.storeId,
		r.vcRegisterCode,
		r.vcRegisterName
	FROM dbo.tblCashReport AS cr
	INNER JOIN dbo.tblRefCashReportStatus AS rs ON rs.cashReportStatusId = cr.cashReportStatusId
	INNER JOIN dbo.tblCashSession AS cs ON cs.cashSessionId = cr.cashSessionId
	INNER JOIN dbo.tblCashRegister AS r ON r.cashRegisterId = cs.cashRegisterId;
GO

/* Totaux de session; paiements reussis agreges par vente avant jointure. */
CREATE OR ALTER VIEW dbo.vw_CashSessionReportTotals
AS
	WITH PaidBySale AS (
		SELECT
			sp.saleId,
			SUM(CASE WHEN pm.vcCode = 'CASH' THEN sp.mAmount ELSE 0 END) AS cashPaid,
			SUM(CASE WHEN pm.vcCode IN ('ORANGE_MONEY','MTN_MOMO') THEN sp.mAmount ELSE 0 END) AS mobilePaid
		FROM dbo.tblSalePayment AS sp
		INNER JOIN dbo.tblRefPaymentMethod AS pm ON pm.paymentMethodId = sp.paymentMethodId
		INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = sp.paymentStatusId
		WHERE ps.vcCode = 'SUCCESS'
		GROUP BY sp.saleId
	), SalesBySession AS (
		SELECT
			s.cashSessionId,
			SUM(s.mNetAmount) AS mTotalSales,
			SUM(COALESCE(p.cashPaid,0)) AS mTotalCash,
			SUM(COALESCE(p.mobilePaid,0)) AS mTotalMobileMoney,
			SUM(s.mDebtAmount) AS mTotalCredit
		FROM dbo.tblSale AS s
		LEFT JOIN PaidBySale AS p ON p.saleId = s.saleId
		WHERE s.IsCancelled = 0
		GROUP BY s.cashSessionId
	), RecoveriesBySession AS (
		SELECT dp.cashSessionId, SUM(dp.mAmount) AS mTotalRecoveries
		FROM dbo.tblDebtPayment AS dp
		INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = dp.paymentStatusId
		WHERE ps.vcCode = 'SUCCESS'
		GROUP BY dp.cashSessionId
	), ApprovedExpensesBySession AS (
		SELECT e.cashSessionId, SUM(e.mAmount) AS mTotalApprovedExpenses
		FROM dbo.tblExpense AS e
		WHERE e.vcStatusCode = 'APPROVED'
		GROUP BY e.cashSessionId
	)
	SELECT
		cs.cashSessionId,
		cs.mOpeningCaisse,
		COALESCE(s.mTotalSales,0) AS mTotalSales,
		COALESCE(s.mTotalCash,0) AS mTotalCash,
		COALESCE(s.mTotalMobileMoney,0) AS mTotalMobileMoney,
		COALESCE(s.mTotalCredit,0) AS mTotalCredit,
		COALESCE(r.mTotalRecoveries,0) AS mTotalRecoveries,
		COALESCE(e.mTotalApprovedExpenses,0) AS mTotalApprovedExpenses,
		cs.mOpeningCaisse + COALESCE(s.mTotalCash,0) - COALESCE(e.mTotalApprovedExpenses,0) AS mTheoreticalBalance
	FROM dbo.tblCashSession AS cs
	LEFT JOIN SalesBySession AS s ON s.cashSessionId = cs.cashSessionId
	LEFT JOIN RecoveriesBySession AS r ON r.cashSessionId = cs.cashSessionId
	LEFT JOIN ApprovedExpensesBySession AS e ON e.cashSessionId = cs.cashSessionId;
GO

/* Cree le rapport et marque la session dans la meme transaction. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateCashReport
	@cashSessionId int,
	@cashReportStatusId int,
	@mClosingAmount money,
	@mTotalRecoveriesOverride money = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0
			THROW 53200, 'cashSessionId invalide.', 1;
		IF @mClosingAmount IS NULL
			THROW 53201, 'mClosingAmount est obligatoire.', 1;
		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblRefCashReportStatus
			WHERE cashReportStatusId = @cashReportStatusId AND vcCode = 'PENDING_MANAGER'
		)
			THROW 53202, 'Le statut initial doit etre PENDING_MANAGER.', 1;

		BEGIN TRANSACTION;
		DECLARE @sessionStatus varchar(50), @opening money;
		SELECT @sessionStatus = rs.vcCode, @opening = cs.mOpeningCaisse
		FROM dbo.tblCashSession AS cs WITH (UPDLOCK,HOLDLOCK)
		INNER JOIN dbo.tblRefCashSessionStatus AS rs ON rs.cashSessionStatusId=cs.cashSessionStatusId
		WHERE cs.cashSessionId=@cashSessionId;
		IF @opening IS NULL THROW 53203, 'Session de caisse introuvable.', 1;
		IF @sessionStatus <> 'CLOSED' THROW 53204, 'La session doit etre fermee avant la generation du rapport.', 1;
		IF EXISTS(SELECT 1 FROM dbo.tblCashReport WHERE cashSessionId=@cashSessionId AND btEnabled=1)
			THROW 53205, 'Un rapport actif existe deja pour cette session.', 1;

		DECLARE @totals table(
			mTotalSales money,mTotalCash money,mTotalMobileMoney money,mTotalCredit money,
			mTotalRecoveries money,mTotalApprovedExpenses money,mTheoreticalBalance money
		);
		INSERT INTO @totals
		SELECT mTotalSales,mTotalCash,mTotalMobileMoney,mTotalCredit,
			mTotalRecoveries,mTotalApprovedExpenses,mTheoreticalBalance
		FROM dbo.vw_CashSessionReportTotals WHERE cashSessionId=@cashSessionId;
		IF NOT EXISTS(SELECT 1 FROM @totals)
			INSERT INTO @totals VALUES(0,0,0,0,0,0,@opening);

		DECLARE @sales money,@cash money,@mobile money,@credit money,@recoveries money,@expenses money,@theoretical money;
		SELECT @sales=mTotalSales,@cash=mTotalCash,@mobile=mTotalMobileMoney,@credit=mTotalCredit,
			@recoveries=COALESCE(@mTotalRecoveriesOverride,mTotalRecoveries),
			@expenses=mTotalApprovedExpenses,@theoretical=mTheoreticalBalance FROM @totals;
		DECLARE @inserted table(cashReportId int,cashSessionId int,mTheoreticalBalance money,mClosingAmount money,mDifferenceAmount money);
		INSERT INTO dbo.tblCashReport(
			cashSessionId,cashReportStatusId,mOpeningCashReport,mTotalSales,mTotalCash,
			mTotalMobileMoney,mTotalCredit,mTotalRecoveries,mTotalApprovedExpenses,
			mTheoreticalBalance,mClosingAmount,mDifferenceAmount,btEnabled,dtCreatedAt,dtLastUpdated
		)
		OUTPUT INSERTED.cashReportId,INSERTED.cashSessionId,INSERTED.mTheoreticalBalance,
			INSERTED.mClosingAmount,INSERTED.mDifferenceAmount
		INTO @inserted
		VALUES(@cashSessionId,@cashReportStatusId,@opening,@sales,@cash,@mobile,@credit,
			@recoveries,@expenses,@theoretical,@mClosingAmount,@mClosingAmount-@theoretical,
			1,SYSUTCDATETIME(),SYSUTCDATETIME());
		UPDATE dbo.tblCashSession
		SET IsReportGenerated=1,dtLastUpdated=SYSUTCDATETIME()
		WHERE cashSessionId=@cashSessionId;
		COMMIT TRANSACTION;
		SELECT * FROM @inserted;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

/* Approbation manager/admin suivant le workflow a deux etapes du DAL. */
CREATE OR ALTER PROCEDURE dbo.sp_ApproveCashReport
	@cashReportId int,
	@level varchar(10),
	@userId int,
	@isApproved bit,
	@comment varchar(250)=NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @level NOT IN ('MANAGER','ADMIN') THROW 53206, 'Niveau attendu: MANAGER ou ADMIN.', 1;
		IF @cashReportId IS NULL OR @cashReportId<=0 OR @userId IS NULL OR @userId<=0
			THROW 53207, 'cashReportId et userId doivent etre positifs.', 1;
		DECLARE @currentCode varchar(50),@targetCode varchar(50),@targetStatusId int;
		SELECT @currentCode=rs.vcCode
		FROM dbo.tblCashReport AS cr WITH(UPDLOCK,HOLDLOCK)
		INNER JOIN dbo.tblRefCashReportStatus AS rs ON rs.cashReportStatusId=cr.cashReportStatusId
		WHERE cr.cashReportId=@cashReportId;
		IF @currentCode IS NULL THROW 53208, 'Rapport de caisse introuvable.', 1;
		IF @level='MANAGER'
		BEGIN
			IF @currentCode<>'PENDING_MANAGER' THROW 53209, 'Le rapport n attend pas la decision du manager.', 1;
			SET @targetCode=CASE WHEN @isApproved=1 THEN 'PENDING_ADMIN' ELSE 'REJECTED' END;
		END
		ELSE
		BEGIN
			IF @currentCode<>'PENDING_ADMIN' THROW 53210, 'Le rapport n attend pas la decision de l administrateur.', 1;
			SET @targetCode=CASE WHEN @isApproved=1 THEN 'APPROVED' ELSE 'REJECTED' END;
		END;
		SELECT @targetStatusId=cashReportStatusId FROM dbo.tblRefCashReportStatus WHERE vcCode=@targetCode;
		IF @targetStatusId IS NULL THROW 53211, 'Statut cible de rapport introuvable.', 1;

		IF @level='MANAGER'
			UPDATE dbo.tblCashReport
			SET cashReportStatusId=@targetStatusId,managerApprovedByUserId=@userId,
				dtManagerApprovedAt=SYSUTCDATETIME(),vcManagerComment=@comment,dtLastUpdated=SYSUTCDATETIME()
			OUTPUT INSERTED.cashReportId,INSERTED.cashReportStatusId
			WHERE cashReportId=@cashReportId;
		ELSE
			UPDATE dbo.tblCashReport
			SET cashReportStatusId=@targetStatusId,adminApprovedByUserId=@userId,
				dtAdminApprovedAt=SYSUTCDATETIME(),vcAdminComment=@comment,dtLastUpdated=SYSUTCDATETIME()
			OUTPUT INSERTED.cashReportId,INSERTED.cashReportStatusId
			WHERE cashReportId=@cashReportId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCashReportsBySession
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId<=0 THROW 53200, 'cashSessionId invalide.', 1;
		SELECT * FROM dbo.vw_CashReportDetails
		WHERE cashSessionId=@cashSessionId
		ORDER BY dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCashReportById
	@cashReportId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashReportId IS NULL OR @cashReportId<=0 THROW 53212, 'cashReportId invalide.', 1;
		SELECT * FROM dbo.vw_CashReportDetails WHERE cashReportId=@cashReportId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Liste filtree des rapports (boutique / gerant / dates) pour l'administration. */
CREATE OR ALTER PROCEDURE dbo.sp_GetCashReportsFiltered
	@storeId int = NULL,
	@gerantId int = NULL,
	@startDate datetime = NULL,
	@endDate datetime = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT cr.*, st.vcCode AS statusCode, st.vcCashReportStatus,
			cs.userId AS sessionUserId,
			RTRIM(LTRIM(u.vcLastName + ' ' + ISNULL(u.vcFirstName, ''))) AS sessionUserName
		FROM dbo.tblCashReport cr
		INNER JOIN dbo.tblRefCashReportStatus st ON cr.cashReportStatusId = st.cashReportStatusId
		INNER JOIN dbo.tblCashSession cs ON cr.cashSessionId = cs.cashSessionId
		INNER JOIN dbo.tblCashRegister r ON cs.cashRegisterId = r.cashRegisterId
		LEFT JOIN dbo.tblUser u ON cs.userId = u.userId
		WHERE (@storeId IS NULL OR r.storeId = @storeId)
		  AND (@gerantId IS NULL OR cs.userId = @gerantId)
		  AND (@startDate IS NULL OR cr.dtCreatedAt >= @startDate)
		  AND (@endDate IS NULL OR cr.dtCreatedAt <= @endDate)
		ORDER BY cr.dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
