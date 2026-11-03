/*
  Module caisses et sessions - SQL Server.
  Prerequis: dbo.tblCashRegister, dbo.tblCashSession, dbo.tblStore,
             dbo.tblUser, dbo.tblRefCashSessionStatus.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Caisses avec boutique et entreprise. */
CREATE OR ALTER VIEW dbo.vw_CashRegisterDetails
AS
	SELECT
		r.cashRegisterId,
		r.storeId,
		s.companyId,
		s.vcStoreName,
		r.vcRegisterCode,
		r.vcRegisterName,
		r.btEnabled
	FROM dbo.tblCashRegister AS r
	INNER JOIN dbo.tblStore AS s ON s.storeId = r.storeId;
GO

/* Sessions enrichies du statut, de la caisse et de l'operateur. */
CREATE OR ALTER VIEW dbo.vw_CashSessionDetails
AS
	SELECT
		cs.cashSessionId,
		cs.cashRegisterId,
		r.storeId,
		s.companyId,
		r.vcRegisterCode,
		r.vcRegisterName,
		cs.userId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS userName,
		cs.cashSessionStatusId,
		st.vcCode AS statusCode,
		st.vcCashSessionStatus,
		cs.mOpeningCaisse,
		cs.dtOpenedAt,
		cs.dtClosedAt,
		cs.mDeclaredClosingAmount,
		cs.IsReportGenerated
	FROM dbo.tblCashSession AS cs
	INNER JOIN dbo.tblRefCashSessionStatus AS st ON st.cashSessionStatusId = cs.cashSessionStatusId
	INNER JOIN dbo.tblCashRegister AS r ON r.cashRegisterId = cs.cashRegisterId
	INNER JOIN dbo.tblStore AS s ON s.storeId = r.storeId
	INNER JOIN dbo.tblUser AS u ON u.userId = cs.userId;
GO

/* Cree une caisse active. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateCashRegister
	@storeId int,
	@vcRegisterCode varchar(20),
	@vcRegisterName varchar(50)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0 THROW 53100, 'storeId invalide.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcRegisterCode)), '') IS NULL THROW 53101, 'vcRegisterCode est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcRegisterName)), '') IS NULL THROW 53102, 'vcRegisterName est obligatoire.', 1;
		INSERT INTO dbo.tblCashRegister(storeId,vcRegisterCode,vcRegisterName,btEnabled)
		OUTPUT INSERTED.cashRegisterId,INSERTED.storeId,INSERTED.vcRegisterCode,INSERTED.vcRegisterName
		VALUES(@storeId,LTRIM(RTRIM(@vcRegisterCode)),LTRIM(RTRIM(@vcRegisterName)),1);
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCashRegistersByStore
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0 THROW 53100, 'storeId invalide.', 1;
		SELECT cashRegisterId,storeId,vcRegisterCode,vcRegisterName,btEnabled
		FROM dbo.vw_CashRegisterDetails
		WHERE storeId=@storeId AND btEnabled=1
		ORDER BY vcRegisterCode;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Ouvre une session si aucune session ouverte n'existe pour la caisse ni l'utilisateur. */
CREATE OR ALTER PROCEDURE dbo.sp_OpenCashSession
	@cashRegisterId int,
	@userId int,
	@cashSessionStatusId int,
	@mOpeningCaisse money=0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashRegisterId IS NULL OR @cashRegisterId<=0 THROW 53103, 'cashRegisterId invalide.', 1;
		IF @userId IS NULL OR @userId<=0 THROW 53104, 'userId invalide.', 1;
		IF @mOpeningCaisse IS NULL OR @mOpeningCaisse<0 THROW 53105, 'mOpeningCaisse doit etre >= 0.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefCashSessionStatus WHERE cashSessionStatusId=@cashSessionStatusId AND vcCode='OPEN')
			THROW 53106, 'Le statut fourni doit etre OPEN.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblCashRegister WHERE cashRegisterId=@cashRegisterId AND btEnabled=1)
			THROW 53103, 'Caisse absente ou inactive.', 1;

		BEGIN TRANSACTION;
		IF EXISTS(
			SELECT 1 FROM dbo.tblCashSession WITH(UPDLOCK,HOLDLOCK)
			WHERE cashRegisterId=@cashRegisterId AND cashSessionStatusId=@cashSessionStatusId
		)
			THROW 53107, 'La caisse possede deja une session ouverte.', 1;
		IF EXISTS(
			SELECT 1 FROM dbo.tblCashSession WITH(UPDLOCK,HOLDLOCK)
			WHERE userId=@userId AND cashSessionStatusId=@cashSessionStatusId
		)
			THROW 53108, 'L utilisateur possede deja une session ouverte.', 1;

		INSERT INTO dbo.tblCashSession(
			cashRegisterId,userId,cashSessionStatusId,mOpeningCaisse,
			dtOpenedAt,dtClosedAt,mDeclaredClosingAmount,IsReportGenerated
		)
		OUTPUT INSERTED.cashSessionId,INSERTED.cashRegisterId,INSERTED.userId,INSERTED.mOpeningCaisse,INSERTED.dtOpenedAt
		VALUES(@cashRegisterId,@userId,@cashSessionStatusId,@mOpeningCaisse,SYSUTCDATETIME(),NULL,NULL,0);
		COMMIT TRANSACTION;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetOpenCashSessionByRegister
	@cashRegisterId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT TOP (1) * FROM dbo.vw_CashSessionDetails
		WHERE cashRegisterId=@cashRegisterId AND statusCode='OPEN'
		ORDER BY dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetOpenCashSessionByUser
	@userId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT TOP (1) * FROM dbo.vw_CashSessionDetails
		WHERE userId=@userId AND statusCode='OPEN'
		ORDER BY dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCashSessionById
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT * FROM dbo.vw_CashSessionDetails WHERE cashSessionId=@cashSessionId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCashSessionHistoryByUser
	@userId int,
	@limit int=50
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @limit IS NULL OR @limit<1 OR @limit>1000 SET @limit=50;
		SELECT TOP (@limit)
			cashSessionId,cashRegisterId,vcRegisterCode,vcRegisterName,
			cashSessionStatusId,statusCode,vcCashSessionStatus,mOpeningCaisse,
			dtOpenedAt,dtClosedAt,mDeclaredClosingAmount,IsReportGenerated
		FROM dbo.vw_CashSessionDetails
		WHERE userId=@userId
		ORDER BY dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Cloture uniquement une session ouverte et renvoie l'etat mis a jour. */
CREATE OR ALTER PROCEDURE dbo.sp_CloseCashSession
	@cashSessionId int,
	@cashSessionStatusId int,
	@mDeclaredClosingAmount money
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @mDeclaredClosingAmount IS NULL OR @mDeclaredClosingAmount<0
			THROW 53105, 'mDeclaredClosingAmount doit etre >= 0.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefCashSessionStatus WHERE cashSessionStatusId=@cashSessionStatusId AND vcCode='CLOSED')
			THROW 53109, 'Le statut fourni doit etre CLOSED.', 1;
		UPDATE dbo.tblCashSession
		SET cashSessionStatusId=@cashSessionStatusId,dtClosedAt=SYSUTCDATETIME(),mDeclaredClosingAmount=@mDeclaredClosingAmount
		OUTPUT INSERTED.cashSessionId,INSERTED.cashSessionStatusId,INSERTED.dtClosedAt,INSERTED.mDeclaredClosingAmount
		WHERE cashSessionId=@cashSessionId
		  AND cashSessionStatusId=(SELECT cashSessionStatusId FROM dbo.tblRefCashSessionStatus WHERE vcCode='OPEN');
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCashSessionsByRegister
	@cashRegisterId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT cs.*,rs.vcCode AS statusCode,rs.vcCashSessionStatus,
			LTRIM(RTRIM(COALESCE(u.vcLastName,'')+' '+COALESCE(u.vcFirstName,''))) AS userName
		FROM dbo.tblCashSession AS cs
		INNER JOIN dbo.tblRefCashSessionStatus AS rs ON rs.cashSessionStatusId=cs.cashSessionStatusId
		INNER JOIN dbo.tblUser AS u ON u.userId=cs.userId
		WHERE cs.cashRegisterId=@cashRegisterId
		ORDER BY cs.dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Session ouverte d'un utilisateur pour une boutique donnee (garde caisse ouverte). */
CREATE OR ALTER PROCEDURE dbo.sp_GetOpenCashSessionByUserAndStore
	@userId int,
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @userId IS NULL OR @userId <= 0
			THROW 53104, 'userId invalide.', 1;
		IF @storeId IS NULL OR @storeId <= 0
			THROW 53100, 'storeId invalide.', 1;
		SELECT TOP (1) *
		FROM dbo.vw_CashSessionDetails
		WHERE userId = @userId AND storeId = @storeId AND statusCode = 'OPEN'
		ORDER BY dtOpenedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
