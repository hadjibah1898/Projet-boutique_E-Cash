/*
  Module ventes - SQL Server.
  Prerequis: tblSale, tblSaleDetail, tblSalePayment, tblStoreStock,
             tblStockMovement, tblRefSaleStatus, tblRefPaymentStatus,
             tblRefPaymentMethod, tblRefStockMovementType, tblCustomer,
             tblUser, tblProduct, tblStore, tblCashSession, tblStockLot.
  Les TVP transmettent les lignes et paiements aux procedures transactionnelles.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* En-tete de vente, correspondant aux colonnes retournees par SaleDAL. */
CREATE OR ALTER VIEW dbo.vw_SaleDetails
AS
	SELECT
		s.saleId,
		s.vcSaleNumber,
		s.companyId,
		s.storeId,
		s.cashSessionId,
		s.customerId,
		CASE WHEN c.customerId IS NULL THEN NULL
			ELSE LTRIM(RTRIM(COALESCE(c.vcLastName, '') + ' ' + COALESCE(c.vcFirstName, ''))) END AS customerName,
		s.sellerUserId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS sellerName,
		s.saleStatusId,
		rs.vcCode AS statusCode,
		rs.vcSaleStatus,
		s.mGrossAmount,
		s.mDiscountAmount,
		s.mNetAmount,
		s.mPaidAmount,
		s.mDebtAmount,
		s.dtSoldAt,
		s.IsCancelled,
		s.dtCancelledAt,
		s.vcCancellationReason,
		s.btEnabled,
		s.dtCreatedAt,
		s.dtLastUpdated
	FROM dbo.tblSale AS s
	INNER JOIN dbo.tblRefSaleStatus AS rs ON rs.saleStatusId = s.saleStatusId
	INNER JOIN dbo.tblUser AS u ON u.userId = s.sellerUserId
	LEFT JOIN dbo.tblCustomer AS c ON c.customerId = s.customerId;
GO

CREATE OR ALTER VIEW dbo.vw_SaleLineDetails
AS
	SELECT
		d.saleDetailId,
		d.saleId,
		d.productId,
		p.vcProductCode,
		p.vcProductName,
		d.stockLotId,
		d.dcQuantity,
		d.mUnitPurchasePrice,
		d.mUnitSalePrice,
		d.mDiscountAmount,
		d.mLineAmount
	FROM dbo.tblSaleDetail AS d
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO

CREATE OR ALTER VIEW dbo.vw_SalePaymentDetails
AS
	SELECT
		sp.salePaymentId,
		sp.saleId,
		sp.paymentMethodId,
		pm.vcCode AS methodCode,
		pm.vcPaymentMethod,
		sp.paymentStatusId,
		ps.vcCode AS statusCode,
		ps.vcPaymentStatus,
		sp.mAmount,
		sp.vcTransactionId,
		sp.vcOperatorReference,
		sp.vcPayerPhoneNumber,
		sp.vcCallbackPayload,
		sp.OperatorMessage,
		sp.dtCreatedAt,
		sp.dtLastUpdated
	FROM dbo.tblSalePayment AS sp
	INNER JOIN dbo.tblRefPaymentMethod AS pm ON pm.paymentMethodId = sp.paymentMethodId
	INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = sp.paymentStatusId;
GO

IF TYPE_ID(N'dbo.SaleDetailInputType') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.SaleDetailInputType AS TABLE (
		productId bigint NOT NULL,
		stockLotId int NULL,
		dcQuantity decimal(18, 3) NOT NULL,
		mUnitPurchasePrice money NULL,
		mUnitSalePrice money NOT NULL,
		mDiscountAmount money NOT NULL
	)');
END;
GO

IF TYPE_ID(N'dbo.SalePaymentInputType') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.SalePaymentInputType AS TABLE (
		paymentMethodId int NOT NULL,
		paymentStatusId int NOT NULL,
		mAmount money NOT NULL,
		vcTransactionId varchar(150) NULL,
		vcOperatorReference varchar(150) NULL,
		vcPayerPhoneNumber varchar(20) NULL
	)');
END;
GO

/*
  Creation atomique de l'entete, des details, des paiements et des mouvements.
  Les totaux sont calcules par Node comme dans SaleDAL.create.
*/
CREATE OR ALTER PROCEDURE dbo.sp_CreateSale
	@vcSaleNumber varchar(20),
	@companyId int,
	@storeId int,
	@cashSessionId int,
	@sellerUserId int,
	@saleStatusId int,
	@mGrossAmount money,
	@mDiscountAmount money,
	@mNetAmount money,
	@mPaidAmount money,
	@mDebtAmount money,
	@details dbo.SaleDetailInputType READONLY,
	@payments dbo.SalePaymentInputType READONLY,
	@customerId int = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcSaleNumber)), '') IS NULL
			THROW 52100, 'vcSaleNumber est obligatoire.', 1;
		IF @companyId IS NULL OR @companyId <= 0 OR @storeId IS NULL OR @storeId <= 0
			THROW 52101, 'companyId et storeId doivent etre positifs.', 1;
		IF @cashSessionId IS NULL OR @cashSessionId <= 0 OR @sellerUserId IS NULL OR @sellerUserId <= 0
			THROW 52102, 'cashSessionId et sellerUserId sont obligatoires.', 1;
		IF NOT EXISTS (SELECT 1 FROM @details)
			THROW 52103, 'Au moins une ligne de vente est requise.', 1;
		IF EXISTS (SELECT 1 FROM @details WHERE productId <= 0 OR dcQuantity <= 0 OR mUnitSalePrice < 0 OR mDiscountAmount < 0)
			THROW 52104, 'Ligne de vente invalide.', 1;
		IF @mNetAmount < 0 OR @mPaidAmount < 0 OR @mDebtAmount < 0 OR @mPaidAmount + @mDebtAmount <> @mNetAmount
			THROW 52105, 'Les montants doivent respecter mPaidAmount + mDebtAmount = mNetAmount.', 1;
		IF @mDebtAmount > 0 AND @customerId IS NULL
			THROW 52106, 'Une vente a credit exige un customerId.', 1;

		DECLARE @statusCode varchar(50);
		SELECT @statusCode = vcCode FROM dbo.tblRefSaleStatus WHERE saleStatusId = @saleStatusId;
		IF @statusCode IS NULL THROW 52107, 'Statut de vente introuvable.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (saleId bigint, vcSaleNumber varchar(20), mNetAmount money);
		INSERT INTO dbo.tblSale (
			vcSaleNumber, companyId, storeId, cashSessionId, customerId, sellerUserId,
			saleStatusId, mGrossAmount, mDiscountAmount, mNetAmount, mPaidAmount, mDebtAmount,
			dtSoldAt, IsCancelled, cancelledByUserId, dtCancelledAt, vcCancellationReason,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.saleId, INSERTED.vcSaleNumber, INSERTED.mNetAmount
			INTO @created (saleId, vcSaleNumber, mNetAmount)
		VALUES (
			@vcSaleNumber, @companyId, @storeId, @cashSessionId, @customerId, @sellerUserId,
			@saleStatusId, @mGrossAmount, @mDiscountAmount, @mNetAmount, @mPaidAmount, @mDebtAmount,
			SYSUTCDATETIME(), 0, NULL, NULL, NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		DECLARE @saleId bigint = (SELECT saleId FROM @created);
		INSERT INTO dbo.tblSaleDetail (
			saleId, productId, stockLotId, dcQuantity, mUnitPurchasePrice,
			mUnitSalePrice, mDiscountAmount, mLineAmount
		)
		SELECT @saleId, productId, stockLotId, dcQuantity, mUnitPurchasePrice,
			mUnitSalePrice, mDiscountAmount,
			CONVERT(decimal(18, 2), dcQuantity * mUnitSalePrice - mDiscountAmount)
		FROM @details;

		INSERT INTO dbo.tblSalePayment (
			saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			vcCallbackPayload, OperatorMessage, dtCreatedAt, dtLastUpdated
		)
		SELECT @saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()
		FROM @payments;

		IF @statusCode <> 'DRAFT'
		BEGIN
			DECLARE @saleLines table (
				rowNumber int IDENTITY(1,1) PRIMARY KEY,
				productId bigint,
				stockLotId int NULL,
				dcQuantity decimal(18,3)
			);
			INSERT INTO @saleLines (productId, stockLotId, dcQuantity)
			SELECT productId, stockLotId, dcQuantity FROM @details;

			DECLARE @row int = 1, @rowCount int = (SELECT COUNT(*) FROM @saleLines);
			DECLARE @productId bigint, @stockLotId int, @qty decimal(18,3);
			DECLARE @stockBefore decimal(18,3), @stockAfter decimal(18,3), @movementTypeId int;
			SELECT @movementTypeId = stockMovementTypeId
			FROM dbo.tblRefStockMovementType WHERE vcCode = 'SALE';
			IF @movementTypeId IS NULL THROW 52108, 'Type de mouvement SALE absent.', 1;

			WHILE @row <= @rowCount
			BEGIN
				SELECT @productId = productId, @stockLotId = stockLotId, @qty = dcQuantity
				FROM @saleLines WHERE rowNumber = @row;
				MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
				USING (SELECT @storeId AS storeId, @productId AS productId) AS source
					ON target.storeId = source.storeId AND target.productId = source.productId
				WHEN NOT MATCHED THEN
					INSERT (storeId, productId, dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt)
					VALUES (source.storeId, source.productId, 0, 0, SYSUTCDATETIME());
				SELECT @stockBefore = dcAvailableQuantity
				FROM dbo.tblStoreStock WITH (UPDLOCK, HOLDLOCK)
				WHERE storeId = @storeId AND productId = @productId;
				SET @stockAfter = @stockBefore - @qty;
				IF @stockAfter < 0 THROW 52109, 'Stock insuffisant pour valider la vente.', 1;
				INSERT INTO dbo.tblStockMovement (
					storeId, productId, stockLotId, stockMovementTypeId,
					dcQuantity, dcStockBefore, dcStockAfter, vcReferenceType,
					referenceId, operatedByUserId, dtMovementAt, vcComment
				)
				VALUES (@storeId, @productId, @stockLotId, @movementTypeId,
					-@qty, @stockBefore, @stockAfter, 'SALE', CONVERT(int, @saleId),
					@sellerUserId, SYSUTCDATETIME(), CONCAT('Vente ', @vcSaleNumber));
				UPDATE dbo.tblStoreStock
				SET dcAvailableQuantity = @stockAfter, dtUpdatedAt = SYSUTCDATETIME()
				WHERE storeId = @storeId AND productId = @productId;
				SET @row += 1;
			END;
		END;

		COMMIT TRANSACTION;
		SELECT saleId, vcSaleNumber, mNetAmount FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetSalesByStore
	@storeId int,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0 THROW 52101, 'storeId invalide.', 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 1000 SET @limit = 100;
		SELECT TOP (@limit) saleId, vcSaleNumber, companyId, storeId, cashSessionId,
			customerId, customerName, sellerUserId, sellerName, saleStatusId,
			statusCode, vcSaleStatus, mGrossAmount, mDiscountAmount, mNetAmount,
			mPaidAmount, mDebtAmount, dtSoldAt, IsCancelled
		FROM dbo.vw_SaleDetails
		WHERE storeId = @storeId AND btEnabled = 1
		ORDER BY dtSoldAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetSalesByCashSession
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0 THROW 52110, 'cashSessionId invalide.', 1;
		SELECT saleId, vcSaleNumber, companyId, storeId, cashSessionId, customerId,
			customerName, sellerUserId, sellerName, saleStatusId, statusCode, vcSaleStatus,
			mGrossAmount, mDiscountAmount, mNetAmount, mPaidAmount, mDebtAmount,
			dtSoldAt, IsCancelled
		FROM dbo.vw_SaleDetails
		WHERE cashSessionId = @cashSessionId AND btEnabled = 1
		ORDER BY dtSoldAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetSaleHeader
	@saleId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @saleId IS NULL OR @saleId <= 0 THROW 52111, 'saleId invalide.', 1;
		SELECT saleId, vcSaleNumber, companyId, storeId, cashSessionId, customerId,
			customerName, sellerUserId, sellerName, saleStatusId, statusCode, vcSaleStatus,
			mGrossAmount, mDiscountAmount, mNetAmount, mPaidAmount, mDebtAmount,
			dtSoldAt, IsCancelled, dtCancelledAt, vcCancellationReason, dtCreatedAt, dtLastUpdated
		FROM dbo.vw_SaleDetails
		WHERE saleId = @saleId AND btEnabled = 1;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetSaleLines
	@saleId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @saleId IS NULL OR @saleId <= 0 THROW 52111, 'saleId invalide.', 1;
		SELECT * FROM dbo.vw_SaleLineDetails WHERE saleId = @saleId ORDER BY productId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetSalePayments
	@saleId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @saleId IS NULL OR @saleId <= 0 THROW 52111, 'saleId invalide.', 1;
		SELECT * FROM dbo.vw_SalePaymentDetails WHERE saleId = @saleId ORDER BY dtCreatedAt;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Ajoute un paiement en attente et met a jour les montants de l'entete atomiquement. */
CREATE OR ALTER PROCEDURE dbo.sp_AddSalePayment
	@saleId bigint,
	@paymentMethodId int,
	@paymentStatusId int,
	@mAmount money,
	@vcTransactionId varchar(150) = NULL,
	@vcOperatorReference varchar(150) = NULL,
	@vcPayerPhoneNumber varchar(20) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @saleId IS NULL OR @saleId <= 0 THROW 52111, 'saleId invalide.', 1;
		IF @mAmount IS NULL OR @mAmount <= 0 THROW 52112, 'mAmount doit etre superieur a zero.', 1;
		BEGIN TRANSACTION;
		DECLARE @net money, @paid money, @debt money, @cancelled bit;
		SELECT @net = mNetAmount, @paid = mPaidAmount, @debt = mDebtAmount, @cancelled = IsCancelled
		FROM dbo.tblSale WITH (UPDLOCK, HOLDLOCK) WHERE saleId = @saleId;
		IF @net IS NULL THROW 52113, 'Vente introuvable.', 1;
		IF @cancelled = 1 THROW 52114, 'Impossible de payer une vente annulee.', 1;
		IF @debt <= 0 THROW 52115, 'Cette vente est deja entierement payee.', 1;
		DECLARE @amountToApply money = CASE WHEN @mAmount > @debt THEN @debt ELSE @mAmount END;
		DECLARE @payment table (salePaymentId bigint);
		INSERT INTO dbo.tblSalePayment (
			saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			vcCallbackPayload, OperatorMessage, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.salePaymentId INTO @payment(salePaymentId)
		VALUES (@saleId, @paymentMethodId, @paymentStatusId, @amountToApply,
			@vcTransactionId, @vcOperatorReference, @vcPayerPhoneNumber,
			NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME());
		UPDATE dbo.tblSale
		SET mPaidAmount = mPaidAmount + @amountToApply,
			mDebtAmount = mDebtAmount - @amountToApply,
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.mPaidAmount, INSERTED.mDebtAmount
		WHERE saleId = @saleId;
		COMMIT TRANSACTION;
		SELECT salePaymentId, @amountToApply AS mAmount FROM @payment;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetSaleSessionTotals
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0 THROW 52110, 'cashSessionId invalide.', 1;
		WITH PaidBySale AS (
			SELECT sp.saleId,
				SUM(CASE WHEN pm.vcCode = 'CASH' AND ps.vcCode = 'SUCCESS' THEN sp.mAmount ELSE 0 END) AS cashPaid,
				SUM(CASE WHEN pm.vcCode IN ('ORANGE_MONEY', 'MTN_MOMO') AND ps.vcCode = 'SUCCESS' THEN sp.mAmount ELSE 0 END) AS mobilePaid,
				SUM(CASE WHEN pm.vcCode IN ('CARD', 'BANK_TRANSFER') AND ps.vcCode = 'SUCCESS' THEN sp.mAmount ELSE 0 END) AS otherPaid
			FROM dbo.tblSalePayment AS sp
			INNER JOIN dbo.tblRefPaymentMethod AS pm ON pm.paymentMethodId = sp.paymentMethodId
			INNER JOIN dbo.tblRefPaymentStatus AS ps ON ps.paymentStatusId = sp.paymentStatusId
			GROUP BY sp.saleId
		)
		SELECT COUNT(1) AS nbVentes,
			COALESCE(SUM(s.mNetAmount), 0) AS mTotalSales,
			COALESCE(SUM(s.mPaidAmount), 0) AS mTotalPaid,
			COALESCE(SUM(s.mDebtAmount), 0) AS mTotalCredit,
			COALESCE(SUM(s.mDiscountAmount), 0) AS mTotalDiscount,
			COALESCE(SUM(p.cashPaid), 0) AS mTotalCash,
			COALESCE(SUM(p.mobilePaid), 0) AS mTotalMobileMoney,
			COALESCE(SUM(p.otherPaid), 0) AS mTotalOther
		FROM dbo.tblSale AS s
		LEFT JOIN PaidBySale AS p ON p.saleId = s.saleId
		WHERE s.cashSessionId = @cashSessionId AND s.IsCancelled = 0;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetSaleSessionSales
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0 THROW 52110, 'cashSessionId invalide.', 1;
		SELECT s.saleId, s.vcSaleNumber, s.customerId, s.sellerUserId,
			s.mGrossAmount, s.mDiscountAmount, s.mNetAmount, s.mPaidAmount, s.mDebtAmount,
			s.dtSoldAt, s.IsCancelled, s.statusCode
		FROM dbo.vw_SaleDetails AS s
		WHERE s.cashSessionId = @cashSessionId
		ORDER BY s.dtSoldAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetDraftSalesBySession
	@cashSessionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @cashSessionId IS NULL OR @cashSessionId <= 0 THROW 52110, 'cashSessionId invalide.', 1;
		SELECT saleId, vcSaleNumber, mNetAmount
		FROM dbo.vw_SaleDetails
		WHERE cashSessionId = @cashSessionId AND statusCode = 'DRAFT'
		  AND IsCancelled = 0 AND btEnabled = 1;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Finalise une vente DRAFT, ajoute les paiements, mouvements et passe a VALIDATED. */
CREATE OR ALTER PROCEDURE dbo.sp_FinalizeSale
	@saleId bigint,
	@userId int,
	@allowPartial bit = 1,
	@payments dbo.SalePaymentInputType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		BEGIN TRANSACTION;
		DECLARE @storeId int, @customerId int, @saleNumber varchar(20), @net money,
			@cancelled bit, @statusCode varchar(50), @validatedStatusId int;
		SELECT @storeId = s.storeId, @customerId = s.customerId, @saleNumber = s.vcSaleNumber,
			@net = s.mNetAmount, @cancelled = s.IsCancelled, @statusCode = rs.vcCode
		FROM dbo.tblSale AS s WITH (UPDLOCK, HOLDLOCK)
		INNER JOIN dbo.tblRefSaleStatus AS rs ON rs.saleStatusId = s.saleStatusId
		WHERE s.saleId = @saleId;
		IF @net IS NULL THROW 52113, 'Vente introuvable.', 1;
		IF @cancelled = 1 THROW 52114, 'Vente annulee : finalisation impossible.', 1;
		IF @statusCode <> 'DRAFT' THROW 52116, 'Seule une vente DRAFT peut etre finalisee.', 1;
		IF @userId IS NULL OR @userId <= 0 THROW 52117, 'userId invalide.', 1;

		DECLARE @paid money = COALESCE((SELECT SUM(mAmount) FROM @payments), 0);
		DECLARE @debt money = @net - @paid;
		IF @debt < 0 THROW 52118, 'Le montant encaisse depasse le net a payer.', 1;
		IF @debt > 0 AND @allowPartial = 0 THROW 52119, 'Encaissement partiel non autorise.', 1;
		IF @debt > 0 AND @customerId IS NULL THROW 52120, 'Une vente a credit exige un client.', 1;

		INSERT INTO dbo.tblSalePayment (
			saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			vcCallbackPayload, OperatorMessage, dtCreatedAt, dtLastUpdated
		)
		SELECT @saleId, paymentMethodId, paymentStatusId, mAmount,
			vcTransactionId, vcOperatorReference, vcPayerPhoneNumber,
			NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()
		FROM @payments;

		DECLARE @movementTypeId int;
		SELECT @movementTypeId = stockMovementTypeId FROM dbo.tblRefStockMovementType WHERE vcCode = 'SALE';
		IF @movementTypeId IS NULL THROW 52108, 'Type de mouvement SALE absent.', 1;
		DECLARE @lines table (rowNumber int IDENTITY(1,1) PRIMARY KEY, productId bigint, stockLotId int NULL, qty decimal(18,3));
		INSERT INTO @lines(productId, stockLotId, qty)
		SELECT productId, stockLotId, dcQuantity FROM dbo.tblSaleDetail WHERE saleId = @saleId;
		DECLARE @i int = 1, @n int = (SELECT COUNT(*) FROM @lines), @product bigint, @lot int, @qty decimal(18,3), @before decimal(18,3), @after decimal(18,3);
		WHILE @i <= @n
		BEGIN
			SELECT @product=productId, @lot=stockLotId, @qty=qty FROM @lines WHERE rowNumber=@i;
			MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
			USING (SELECT @storeId AS storeId, @product AS productId) AS source
			ON target.storeId=source.storeId AND target.productId=source.productId
			WHEN NOT MATCHED THEN INSERT(storeId,productId,dcAvailableQuantity,dcReservedQuantity,dtUpdatedAt)
			VALUES(source.storeId,source.productId,0,0,SYSUTCDATETIME());
			SELECT @before=dcAvailableQuantity FROM dbo.tblStoreStock WITH (UPDLOCK,HOLDLOCK) WHERE storeId=@storeId AND productId=@product;
			SET @after=@before-@qty;
			IF @after<0 THROW 52109, 'Stock insuffisant pour finaliser la vente.', 1;
			INSERT INTO dbo.tblStockMovement(storeId,productId,stockLotId,stockMovementTypeId,dcQuantity,dcStockBefore,dcStockAfter,vcReferenceType,referenceId,operatedByUserId,dtMovementAt,vcComment)
			VALUES(@storeId,@product,@lot,@movementTypeId,-@qty,@before,@after,'SALE',CONVERT(int,@saleId),@userId,SYSUTCDATETIME(),CONCAT('Finalisation vente ',@saleNumber));
			UPDATE dbo.tblStoreStock SET dcAvailableQuantity=@after,dtUpdatedAt=SYSUTCDATETIME() WHERE storeId=@storeId AND productId=@product;
			SET @i+=1;
		END;
		SELECT @validatedStatusId=saleStatusId FROM dbo.tblRefSaleStatus WHERE vcCode='VALIDATED';
		IF @validatedStatusId IS NULL THROW 52107, 'Statut VALIDATED absent.', 1;
		UPDATE dbo.tblSale SET saleStatusId=@validatedStatusId,mPaidAmount=@paid,mDebtAmount=@debt,
			dtSoldAt=SYSUTCDATETIME(),dtLastUpdated=SYSUTCDATETIME() WHERE saleId=@saleId;
		COMMIT TRANSACTION;
		SELECT @saleId AS saleId,'VALIDATED' AS statusCode,@paid AS mPaidAmount,@debt AS mDebtAmount;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

/* Annule une vente et restaure le stock par mouvements SALE_CANCEL. */
CREATE OR ALTER PROCEDURE dbo.sp_CancelSale
	@saleId bigint,
	@cancelledByUserId int,
	@vcCancellationReason varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		BEGIN TRANSACTION;
		DECLARE @storeId int, @saleNumber varchar(20), @cancelled bit, @cancelStatusId int;
		SELECT @storeId=storeId,@saleNumber=vcSaleNumber,@cancelled=IsCancelled
		FROM dbo.tblSale WITH (UPDLOCK,HOLDLOCK) WHERE saleId=@saleId;
		IF @storeId IS NULL THROW 52113, 'Vente introuvable.', 1;
		IF @cancelled=1 THROW 52121, 'Vente deja annulee.', 1;
		IF @cancelledByUserId IS NULL OR @cancelledByUserId<=0 THROW 52117, 'cancelledByUserId invalide.', 1;
		SELECT @cancelStatusId=saleStatusId FROM dbo.tblRefSaleStatus WHERE vcCode='CANCELLED';
		IF @cancelStatusId IS NULL THROW 52107, 'Statut CANCELLED absent.', 1;
		UPDATE dbo.tblSale SET saleStatusId=@cancelStatusId,IsCancelled=1,cancelledByUserId=@cancelledByUserId,
			dtCancelledAt=SYSUTCDATETIME(),vcCancellationReason=@vcCancellationReason,
			dtLastUpdated=SYSUTCDATETIME() WHERE saleId=@saleId;

		DECLARE @movementTypeId int;
		SELECT @movementTypeId=stockMovementTypeId FROM dbo.tblRefStockMovementType WHERE vcCode='SALE_CANCEL';
		IF @movementTypeId IS NULL THROW 52108, 'Type de mouvement SALE_CANCEL absent.', 1;
		DECLARE @lines table(rowNumber int IDENTITY(1,1) PRIMARY KEY,productId bigint,stockLotId int NULL,qty decimal(18,3));
		INSERT INTO @lines(productId,stockLotId,qty)
		SELECT productId,stockLotId,dcQuantity FROM dbo.tblSaleDetail WHERE saleId=@saleId;
		DECLARE @i int=1,@n int=(SELECT COUNT(*) FROM @lines),@product bigint,@lot int,@qty decimal(18,3),@before decimal(18,3),@after decimal(18,3);
		WHILE @i<=@n
		BEGIN
			SELECT @product=productId,@lot=stockLotId,@qty=qty FROM @lines WHERE rowNumber=@i;
			MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
			USING (SELECT @storeId AS storeId,@product AS productId) AS source
			ON target.storeId=source.storeId AND target.productId=source.productId
			WHEN NOT MATCHED THEN INSERT(storeId,productId,dcAvailableQuantity,dcReservedQuantity,dtUpdatedAt)
			VALUES(source.storeId,source.productId,0,0,SYSUTCDATETIME());
			SELECT @before=dcAvailableQuantity FROM dbo.tblStoreStock WITH (UPDLOCK,HOLDLOCK) WHERE storeId=@storeId AND productId=@product;
			SET @after=@before+@qty;
			INSERT INTO dbo.tblStockMovement(storeId,productId,stockLotId,stockMovementTypeId,dcQuantity,dcStockBefore,dcStockAfter,vcReferenceType,referenceId,operatedByUserId,dtMovementAt,vcComment)
			VALUES(@storeId,@product,@lot,@movementTypeId,@qty,@before,@after,'SALE_CANCEL',CONVERT(int,@saleId),@cancelledByUserId,SYSUTCDATETIME(),CONCAT('Annulation vente ',@saleNumber));
			UPDATE dbo.tblStoreStock SET dcAvailableQuantity=@after,dtUpdatedAt=SYSUTCDATETIME() WHERE storeId=@storeId AND productId=@product;
			SET @i+=1;
		END;
		COMMIT TRANSACTION;
		SELECT @saleId AS saleId,CAST(1 AS bit) AS cancelled;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO
