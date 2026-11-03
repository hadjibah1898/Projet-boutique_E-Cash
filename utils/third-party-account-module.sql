/*
  Module comptes tiers - SQL Server.
  Prerequis: dbo.tblThirdPartyAccount, dbo.tblThirdPartyAccountMovement,
             dbo.tblCustomer, dbo.tblSupplier, dbo.tblRefThirdPartyMovementType.
  Le DAL Node n'est pas modifie par ce script; les procedures remplacent ses
  requetes inline lorsqu'il sera raccorde a execute().
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Comptes tiers avec les informations d'identite du client ou fournisseur. */
CREATE OR ALTER VIEW dbo.vw_ThirdPartyAccountDetails
AS
	SELECT
		a.thirdPartyAccountId,
		a.companyId,
		a.customerId,
		c.vcCustomerCode,
		c.vcLastName AS customerLastName,
		c.vcFirstName AS customerFirstName,
		a.supplierId,
		s.vcSupplierCode,
		s.vcBusinessName AS supplierBusinessName,
		s.vcLastName AS supplierLastName,
		s.vcFirstName AS supplierFirstName,
		a.dcCurrentBalance,
		a.dtLastMovementAt,
		a.btEnabled,
		a.dtCreatedAt,
		a.dtLastUpdated
	FROM dbo.tblThirdPartyAccount AS a
	LEFT JOIN dbo.tblCustomer AS c ON c.customerId = a.customerId
	LEFT JOIN dbo.tblSupplier AS s ON s.supplierId = a.supplierId;
GO

/* Vue de mouvements enrichie du type et de l'operateur. */
CREATE OR ALTER VIEW dbo.vw_ThirdPartyAccountMovementDetails
AS
	SELECT
		m.thirdPartyAccountMovementId,
		m.thirdPartyAccountId,
		a.companyId,
		a.customerId,
		a.supplierId,
		m.thirdPartyMovementTypeId,
		t.vcCode AS typeCode,
		t.vcThirdPartyMovementType,
		t.direction,
		m.saleId,
		m.purchaseId,
		m.debtPaymentId,
		m.storeId,
		m.mAmount,
		m.mBalanceBefore,
		m.mBalanceAfter,
		m.operatedByUserId,
		m.Note,
		m.dtCreatedAt,
		m.dtLastUpdated
	FROM dbo.tblThirdPartyAccountMovement AS m
	INNER JOIN dbo.tblThirdPartyAccount AS a
		ON a.thirdPartyAccountId = m.thirdPartyAccountId
	INNER JOIN dbo.tblRefThirdPartyMovementType AS t
		ON t.thirdPartyMovementTypeId = m.thirdPartyMovementTypeId;
GO

/* Obtient le compte existant ou le cree, avec verrouillage contre les doublons concurrents. */
CREATE OR ALTER PROCEDURE dbo.usp_GetOrCreateThirdPartyAccount
	@companyId int,
	@customerId int = NULL,
	@supplierId int = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51400, 'companyId est obligatoire et doit etre positif.', 1;
		IF (@customerId IS NULL AND @supplierId IS NULL)
			OR (@customerId IS NOT NULL AND @supplierId IS NOT NULL)
			THROW 51401, 'Fournir exactement un customerId ou un supplierId.', 1;

		IF @customerId IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM dbo.tblCustomer
			WHERE customerId = @customerId AND companyId = @companyId
		)
			THROW 51402, 'Client absent ou rattache a une autre entreprise.', 1;
		IF @supplierId IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM dbo.tblSupplier
			WHERE supplierId = @supplierId AND companyId = @companyId
		)
			THROW 51403, 'Fournisseur absent ou rattache a une autre entreprise.', 1;

		DECLARE @accountId int;
		DECLARE @created table (
			thirdPartyAccountId int,
			companyId int,
			customerId int NULL,
			supplierId int NULL,
			dcCurrentBalance money
		);

		BEGIN TRANSACTION;
		IF @customerId IS NOT NULL
		BEGIN
			SELECT TOP (1) @accountId = thirdPartyAccountId
			FROM dbo.tblThirdPartyAccount WITH (UPDLOCK, HOLDLOCK)
			WHERE companyId = @companyId AND customerId = @customerId;
		END
		ELSE
		BEGIN
			SELECT TOP (1) @accountId = thirdPartyAccountId
			FROM dbo.tblThirdPartyAccount WITH (UPDLOCK, HOLDLOCK)
			WHERE companyId = @companyId AND supplierId = @supplierId;
		END;

		IF @accountId IS NULL
		BEGIN
			INSERT INTO dbo.tblThirdPartyAccount (
				companyId, customerId, supplierId, dcCurrentBalance,
				dtLastMovementAt, btEnabled, dtCreatedAt, dtLastUpdated
			)
			OUTPUT INSERTED.thirdPartyAccountId, INSERTED.companyId,
			       INSERTED.customerId, INSERTED.supplierId, INSERTED.dcCurrentBalance
				INTO @created (thirdPartyAccountId, companyId, customerId, supplierId, dcCurrentBalance)
			VALUES (
				@companyId, @customerId, @supplierId, 0,
				NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
			);
		END;
		COMMIT TRANSACTION;

		IF EXISTS (SELECT 1 FROM @created)
			SELECT thirdPartyAccountId, companyId, customerId, supplierId, dcCurrentBalance FROM @created;
		ELSE
			SELECT TOP (1) thirdPartyAccountId, companyId, customerId, supplierId, dcCurrentBalance
			FROM dbo.tblThirdPartyAccount
			WHERE thirdPartyAccountId = @accountId;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

/* Compte d'un client dans une entreprise. */
CREATE OR ALTER PROCEDURE dbo.usp_GetThirdPartyAccountByCustomer
	@companyId int,
	@customerId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51400, 'companyId est obligatoire et doit etre positif.', 1;
		IF @customerId IS NULL OR @customerId <= 0
			THROW 51404, 'customerId est obligatoire et doit etre positif.', 1;

		SELECT TOP (1)
			thirdPartyAccountId, companyId, customerId, supplierId,
			dcCurrentBalance, dtLastMovementAt, btEnabled, dtCreatedAt
		FROM dbo.tblThirdPartyAccount
		WHERE companyId = @companyId AND customerId = @customerId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Enregistre un mouvement et actualise le solde; participe a une transaction appelante. */
CREATE OR ALTER PROCEDURE dbo.usp_RecordThirdPartyAccountMovement
	@thirdPartyAccountId int,
	@thirdPartyMovementTypeId int,
	@mAmount money,
	@operatedByUserId int,
	@saleId bigint = NULL,
	@purchaseId int = NULL,
	@debtPaymentId int = NULL,
	@storeId int = NULL,
	@note nvarchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @thirdPartyAccountId IS NULL OR @thirdPartyAccountId <= 0
			THROW 51405, 'thirdPartyAccountId est obligatoire et doit etre positif.', 1;
		IF @thirdPartyMovementTypeId IS NULL OR @thirdPartyMovementTypeId <= 0
			THROW 51406, 'thirdPartyMovementTypeId est obligatoire.', 1;
		IF @mAmount IS NULL OR @mAmount <= 0
			THROW 51407, 'mAmount doit etre strictement superieur a zero.', 1;
		IF @operatedByUserId IS NULL OR @operatedByUserId <= 0
			THROW 51408, 'operatedByUserId est obligatoire.', 1;

		DECLARE @direction smallint;
		SELECT @direction = direction
		FROM dbo.tblRefThirdPartyMovementType
		WHERE thirdPartyMovementTypeId = @thirdPartyMovementTypeId;
		IF @direction IS NULL OR @direction NOT IN (-1, 1)
			THROW 51406, 'Type de mouvement tiers absent ou direction invalide.', 1;

		DECLARE @startedTransaction bit = 0;
		IF @@TRANCOUNT = 0
		BEGIN
			BEGIN TRANSACTION;
			SET @startedTransaction = 1;
		END
		ELSE
			SAVE TRANSACTION ThirdPartyMovementSave;

		DECLARE @balanceBefore money;
		SELECT @balanceBefore = dcCurrentBalance
		FROM dbo.tblThirdPartyAccount WITH (UPDLOCK, HOLDLOCK)
		WHERE thirdPartyAccountId = @thirdPartyAccountId;
		IF @balanceBefore IS NULL
			THROW 51409, 'Compte tiers introuvable.', 1;

		DECLARE @balanceAfter money = @balanceBefore + (@direction * @mAmount);
		DECLARE @inserted table (
			thirdPartyAccountMovementId int,
			mBalanceAfter money
		);

		INSERT INTO dbo.tblThirdPartyAccountMovement (
			thirdPartyAccountId, thirdPartyMovementTypeId, saleId, purchaseId,
			debtPaymentId, storeId, mAmount, mBalanceBefore, mBalanceAfter,
			operatedByUserId, Note, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.thirdPartyAccountMovementId, INSERTED.mBalanceAfter
			INTO @inserted (thirdPartyAccountMovementId, mBalanceAfter)
		VALUES (
			@thirdPartyAccountId, @thirdPartyMovementTypeId, @saleId, @purchaseId,
			@debtPaymentId, @storeId, @mAmount, @balanceBefore, @balanceAfter,
			@operatedByUserId, @note, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		UPDATE dbo.tblThirdPartyAccount
		SET dcCurrentBalance = @balanceAfter,
			dtLastMovementAt = SYSUTCDATETIME(),
			dtLastUpdated = SYSUTCDATETIME()
		WHERE thirdPartyAccountId = @thirdPartyAccountId;

		IF @startedTransaction = 1 COMMIT TRANSACTION;
		SELECT thirdPartyAccountMovementId, mBalanceAfter FROM @inserted;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0
		BEGIN
			IF @startedTransaction = 1 ROLLBACK TRANSACTION;
			ELSE IF XACT_STATE() = 1 ROLLBACK TRANSACTION ThirdPartyMovementSave;
		END;
		THROW;
	END CATCH;
END;
GO

/* Dettes accordees (CUSTOMER_DEBT) sur les ventes d'une session. */
CREATE OR ALTER PROCEDURE dbo.usp_GetSessionDebtsGranted
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0
			THROW 51410, 'cashSessionId invalide.', 1;
		SELECT tm.thirdPartyAccountMovementId, tm.saleId, tm.mAmount,
			tm.mBalanceBefore, tm.mBalanceAfter, tm.dtCreatedAt,
			s.vcSaleNumber, s.customerId
		FROM dbo.tblThirdPartyAccountMovement tm
		INNER JOIN dbo.tblRefThirdPartyMovementType t ON tm.thirdPartyMovementTypeId = t.thirdPartyMovementTypeId
		INNER JOIN dbo.tblSale s ON tm.saleId = s.saleId
		WHERE s.cashSessionId = @cashSessionId AND t.vcCode = 'CUSTOMER_DEBT'
		ORDER BY tm.dtCreatedAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
