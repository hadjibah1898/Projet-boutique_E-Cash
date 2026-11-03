/*
  Module paiements de dettes - SQL Server.
  Prerequis: dbo.tblDebtPayment, dbo.tblThirdPartyAccount,
             dbo.tblThirdPartyAccountMovement, dbo.tblRefPaymentMethod,
             dbo.tblRefPaymentStatus, dbo.tblRefThirdPartyMovementType,
             dbo.tblUser.
  sp_CreateDebtPayment peut etre appelee dans la transaction ouverte par le DAL.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Historique des paiements avec methode, statut et nom de l'operateur. */
CREATE OR ALTER VIEW dbo.vw_DebtPaymentDetails
AS
	SELECT
		dp.*,
		pm.vcCode AS methodCode,
		pm.vcPaymentMethod,
		ps.vcCode AS statusCode,
		ps.vcPaymentStatus,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS operatedByName
	FROM dbo.tblDebtPayment AS dp
	INNER JOIN dbo.tblRefPaymentMethod AS pm ON pm.paymentMethodId = dp.paymentMethodId
	INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = dp.paymentStatusId
	INNER JOIN dbo.tblUser AS u ON u.userId = dp.OperatedByUserId;
GO

/* Cree le paiement et le mouvement tiers, puis met a jour le solde atomiquement. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateDebtPayment
	@thirdPartyAccountId int,
	@storeId int = NULL,
	@cashSessionId int = NULL,
	@paymentMethodId int,
	@paymentStatusId int,
	@mAmount money,
	@vcTransactionId varchar(150) = NULL,
	@vcOperatorReference varchar(150) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@operatedByUserId int,
	@vcNote varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @thirdPartyAccountId IS NULL OR @thirdPartyAccountId <= 0
			THROW 52900, 'thirdPartyAccountId est obligatoire et doit etre positif.', 1;
		IF @paymentMethodId IS NULL OR @paymentMethodId <= 0
			THROW 52901, 'paymentMethodId est obligatoire.', 1;
		IF @paymentStatusId IS NULL OR @paymentStatusId <= 0
			THROW 52902, 'paymentStatusId est obligatoire.', 1;
		IF @mAmount IS NULL OR @mAmount <= 0
			THROW 52903, 'mAmount doit etre strictement superieur a zero.', 1;
		IF @operatedByUserId IS NULL OR @operatedByUserId <= 0
			THROW 52904, 'operatedByUserId est obligatoire.', 1;

		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefPaymentMethod WHERE paymentMethodId = @paymentMethodId)
			THROW 52901, 'Methode de paiement introuvable.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefPaymentStatus WHERE paymentStatusId = @paymentStatusId)
			THROW 52902, 'Statut de paiement introuvable.', 1;

		DECLARE @startedTransaction bit = 0;
		IF @@TRANCOUNT = 0
		BEGIN
			BEGIN TRANSACTION;
			SET @startedTransaction = 1;
		END
		ELSE
			SAVE TRANSACTION DebtPaymentSave;

		DECLARE @customerId int, @supplierId int, @balanceBefore money;
		SELECT @customerId = customerId, @supplierId = supplierId,
			@balanceBefore = dcCurrentBalance
		FROM dbo.tblThirdPartyAccount WITH (UPDLOCK, HOLDLOCK)
		WHERE thirdPartyAccountId = @thirdPartyAccountId;
		IF @balanceBefore IS NULL
			THROW 52905, 'Compte tiers introuvable.', 1;
		IF (@customerId IS NULL AND @supplierId IS NULL)
			OR (@customerId IS NOT NULL AND @supplierId IS NOT NULL)
			THROW 52906, 'Le compte tiers doit etre rattache a exactement un client ou fournisseur.', 1;

		DECLARE @movementCode varchar(50) = CASE
			WHEN @customerId IS NOT NULL THEN 'CUSTOMER_PAYMENT'
			ELSE 'SUPPLIER_PAYMENT' END;
		DECLARE @movementTypeId int, @direction smallint;
		SELECT @movementTypeId = thirdPartyMovementTypeId, @direction = direction
		FROM dbo.tblRefThirdPartyMovementType
		WHERE vcCode = @movementCode;
		IF @movementTypeId IS NULL OR @direction IS NULL OR @direction NOT IN (-1, 1)
			THROW 52907, 'Type de mouvement de paiement tiers absent ou direction invalide.', 1;

		DECLARE @payment table (debtPaymentId int);
		INSERT INTO dbo.tblDebtPayment (
			thirdPartyAccountId, storeId, cashSessionId, paymentMethodId, paymentStatusId,
			mAmount, vcTransactionId, vcOperatorReference, vcPhoneNumber, vcCallbackPayload,
			OperatedByUserId, vcNote, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.debtPaymentId INTO @payment(debtPaymentId)
		VALUES (
			@thirdPartyAccountId, @storeId, @cashSessionId, @paymentMethodId, @paymentStatusId,
			@mAmount, @vcTransactionId, @vcOperatorReference, @vcPhoneNumber, NULL,
			@operatedByUserId, @vcNote, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		DECLARE @debtPaymentId int = (SELECT debtPaymentId FROM @payment);
		DECLARE @balanceAfter money = @balanceBefore + (@direction * @mAmount);
		INSERT INTO dbo.tblThirdPartyAccountMovement (
			thirdPartyAccountId, thirdPartyMovementTypeId, saleId, purchaseId, debtPaymentId,
			storeId, mAmount, mBalanceBefore, mBalanceAfter, operatedByUserId,
			Note, dtCreatedAt, dtLastUpdated
		)
		VALUES (
			@thirdPartyAccountId, @movementTypeId, NULL, NULL, @debtPaymentId,
			@storeId, @mAmount, @balanceBefore, @balanceAfter, @operatedByUserId,
			@vcNote, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		UPDATE dbo.tblThirdPartyAccount
		SET dcCurrentBalance = @balanceAfter,
			dtLastMovementAt = SYSUTCDATETIME(),
			dtLastUpdated = SYSUTCDATETIME()
		WHERE thirdPartyAccountId = @thirdPartyAccountId;

		IF @startedTransaction = 1 COMMIT TRANSACTION;
		SELECT @debtPaymentId AS debtPaymentId, @balanceAfter AS nouveauSolde;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0
		BEGIN
			IF @startedTransaction = 1 ROLLBACK TRANSACTION;
			ELSE IF XACT_STATE() = 1 ROLLBACK TRANSACTION DebtPaymentSave;
		END;
		THROW;
	END CATCH;
END;
GO

/* Historique des paiements d'un compte tiers, du plus recent au plus ancien. */
CREATE OR ALTER PROCEDURE dbo.sp_GetDebtPaymentsByAccount
	@thirdPartyAccountId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @thirdPartyAccountId IS NULL OR @thirdPartyAccountId <= 0
			THROW 52900, 'thirdPartyAccountId invalide.', 1;
		SELECT *
		FROM dbo.vw_DebtPaymentDetails
		WHERE thirdPartyAccountId = @thirdPartyAccountId
		ORDER BY dtCreatedAt DESC, debtPaymentId DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Lignes de recouvrement SUCCESS d'une session (detail des rapports de caisse). */
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionRecoveryLines
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0
			THROW 52900, 'cashSessionId invalide.', 1;
		SELECT dp.debtPaymentId, dp.thirdPartyAccountId, dp.storeId, dp.mAmount,
			m.vcCode AS methodCode, ps.vcCode AS statusCode,
			a.customerId, a.supplierId, dp.dtCreatedAt
		FROM dbo.tblDebtPayment dp
		INNER JOIN dbo.tblRefPaymentMethod m ON dp.paymentMethodId = m.paymentMethodId
		INNER JOIN dbo.tblRefPaymentStatus ps ON dp.paymentStatusId = ps.paymentStatusId
		INNER JOIN dbo.tblThirdPartyAccount a ON dp.thirdPartyAccountId = a.thirdPartyAccountId
		WHERE dp.cashSessionId = @cashSessionId AND ps.vcCode = 'SUCCESS'
		ORDER BY dp.dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Agregats des recouvrements d'une session (bilan de caisse). */
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionRecoveryTotals
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0
			THROW 52900, 'cashSessionId invalide.', 1;
		SELECT
			COALESCE(SUM(CASE WHEN ps.vcCode = 'SUCCESS' THEN dp.mAmount ELSE 0 END), 0) AS mTotalRecoveries,
			COALESCE(SUM(CASE WHEN ps.vcCode = 'SUCCESS' AND m.vcCode IN ('ORANGE_MONEY','MTN_MOMO') THEN dp.mAmount ELSE 0 END), 0) AS mMobileRecoveries,
			COUNT(CASE WHEN ps.vcCode = 'SUCCESS' THEN 1 END) AS nbRecoveries
		FROM dbo.tblDebtPayment dp
		INNER JOIN dbo.tblRefPaymentMethod m ON dp.paymentMethodId = m.paymentMethodId
		INNER JOIN dbo.tblRefPaymentStatus ps ON dp.paymentStatusId = ps.paymentStatusId
		WHERE dp.cashSessionId = @cashSessionId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Clients avec une dette (solde < 0) — remplace le SQL inline de customerDAL.getDebts. */
CREATE OR ALTER PROCEDURE dbo.sp_GetCustomerDebts
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			c.customerId AS _id,
			c.customerId,
			c.vcCustomerCode AS code,
			c.vcLastName,
			c.vcFirstName,
			c.vcPhoneNumber,
			c.vcEmail,
			ISNULL(acc.dcCurrentBalance, 0) AS solde,
			ABS(ISNULL(acc.dcCurrentBalance, 0)) AS montantDette
		FROM dbo.tblCustomer c
		LEFT JOIN dbo.tblThirdPartyAccount acc ON acc.customerId = c.customerId
		WHERE c.companyId = @companyId
		  AND c.btEnabled = 1
		  AND acc.dcCurrentBalance < 0
		ORDER BY ABS(acc.dcCurrentBalance) DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Historique des mouvements de dettes d'un client — remplace le SQL inline de customerDAL.getDebtHistory. */
CREATE OR ALTER PROCEDURE dbo.sp_GetCustomerDebtHistory
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			m.thirdPartyAccountMovementId AS _id,
			c.customerId,
			c.vcLastName,
			c.vcFirstName,
			m.mAmount AS montant,
			m.mBalanceBefore AS soldeAvant,
			m.mBalanceAfter AS soldeApres,
			m.dtCreatedAt AS date,
			m.Note AS note
		FROM dbo.tblThirdPartyAccountMovement m
		INNER JOIN dbo.tblThirdPartyAccount acc ON acc.thirdPartyAccountId = m.thirdPartyAccountId
		INNER JOIN dbo.tblCustomer c ON c.customerId = acc.customerId
		WHERE acc.companyId = @companyId
		ORDER BY m.dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Évolution de la dette par date et boutique — remplace le SQL inline de customerDAL.getDebtEvolution. */
CREATE OR ALTER PROCEDURE dbo.sp_GetCustomerDebtEvolution
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			CAST(m.dtCreatedAt AS DATE) AS date,
			ISNULL(s.vcStoreName, 'Boutique inconnue') AS boutiqueName,
			CASE WHEN t.direction = 1 THEN m.mAmount ELSE -m.mAmount END AS netChange
		FROM dbo.tblThirdPartyAccountMovement m
		INNER JOIN dbo.tblThirdPartyAccount acc ON acc.thirdPartyAccountId = m.thirdPartyAccountId
		LEFT JOIN dbo.tblStore s ON s.storeId = m.storeId
		INNER JOIN dbo.tblRefThirdPartyMovementType t ON t.thirdPartyMovementTypeId = m.thirdPartyMovementTypeId
		WHERE acc.companyId = @companyId
		  AND t.vcCode IN ('CUSTOMER_DEBT', 'CUSTOMER_PAYMENT')
		ORDER BY m.dtCreatedAt ASC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
