/*
  Module promotions - SQL Server.
  Prerequis: dbo.tblPromotion, dbo.tblPromotionProduct, dbo.tblPromotionStore,
             dbo.tblRefDiscountType, dbo.tblProduct, dbo.tblStore, dbo.tblStockLot.
  Les deux TVP servent a creer une promotion et ses associations en une transaction.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Promotions enrichies du type de remise. */
CREATE OR ALTER VIEW dbo.vw_PromotionDetails
AS
	SELECT
		pr.promotionId,
		pr.companyId,
		pr.vcPromotionName,
		pr.discountTypeId,
		dt.vcCode AS discountTypeCode,
		dt.vcDiscountType,
		pr.dcDiscountValue,
		pr.dtStartDate,
		pr.dtEndDate,
		pr.createdByUserId,
		pr.btEnabled,
		pr.dtCreatedAt,
		pr.dtLastUpdated
	FROM dbo.tblPromotion AS pr
	INNER JOIN dbo.tblRefDiscountType AS dt ON dt.discountTypeId = pr.discountTypeId;
GO

/* Liens promotion-boutique et promotion-produit. */
CREATE OR ALTER VIEW dbo.vw_PromotionStoreDetails
AS
	SELECT
		ps.promotionId,
		ps.storeId,
		s.companyId,
		s.vcStoreCode,
		s.vcStoreName
	FROM dbo.tblPromotionStore AS ps
	INNER JOIN dbo.tblStore AS s ON s.storeId = ps.storeId;
GO

CREATE OR ALTER VIEW dbo.vw_PromotionProductDetails
AS
	SELECT
		pp.promotionId,
		p.productId,
		p.vcProductCode,
		p.vcProductName
	FROM dbo.tblPromotionProduct AS pp
	INNER JOIN dbo.tblProduct AS p ON p.productId = pp.productId;
GO

IF TYPE_ID(N'dbo.PromotionProductIdList') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.PromotionProductIdList AS TABLE (
		productId bigint NOT NULL PRIMARY KEY
	)');
END;
GO

IF TYPE_ID(N'dbo.PromotionStoreIdList') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.PromotionStoreIdList AS TABLE (
		storeId int NOT NULL PRIMARY KEY
	)');
END;
GO

/* Cree une promotion et ses produits/boutiques dans une transaction unique. */
CREATE OR ALTER PROCEDURE dbo.sp_CreatePromotion
	@companyId int,
	@vcPromotionName varchar(50),
	@discountTypeId int,
	@dcDiscountValue decimal(18, 2),
	@dtStartDate datetime,
	@dtEndDate datetime,
	@createdByUserId int,
	@productIds dbo.PromotionProductIdList READONLY,
	@storeIds dbo.PromotionStoreIdList READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 52400, 'companyId est obligatoire et doit etre positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcPromotionName)), '') IS NULL
			THROW 52401, 'vcPromotionName est obligatoire.', 1;
		IF @dcDiscountValue IS NULL OR @dcDiscountValue < 0
			THROW 52402, 'dcDiscountValue doit etre positif ou nul.', 1;
		IF @dtStartDate IS NULL OR @dtEndDate IS NULL OR @dtEndDate < @dtStartDate
			THROW 52403, 'Les dates de promotion sont invalides (fin >= debut requise).', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 52404, 'createdByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefDiscountType WHERE discountTypeId = @discountTypeId)
			THROW 52405, 'Type de remise introuvable.', 1;
		IF EXISTS (
			SELECT 1 FROM @productIds AS ids
			LEFT JOIN dbo.tblProduct AS p ON p.productId = ids.productId
			WHERE p.productId IS NULL OR p.companyId <> @companyId
		)
			THROW 52406, 'Un ou plusieurs produits sont absents ou hors entreprise.', 1;
		IF EXISTS (
			SELECT 1 FROM @storeIds AS ids
			LEFT JOIN dbo.tblStore AS s ON s.storeId = ids.storeId
			WHERE s.storeId IS NULL OR s.companyId <> @companyId
		)
			THROW 52407, 'Une ou plusieurs boutiques sont absentes ou hors entreprise.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (promotionId int);
		INSERT INTO dbo.tblPromotion (
			companyId, vcPromotionName, discountTypeId, dcDiscountValue,
			dtStartDate, dtEndDate, createdByUserId, btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.promotionId INTO @created(promotionId)
		VALUES (
			@companyId, LTRIM(RTRIM(@vcPromotionName)), @discountTypeId, @dcDiscountValue,
			@dtStartDate, @dtEndDate, @createdByUserId, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		DECLARE @promotionId int = (SELECT promotionId FROM @created);
		INSERT INTO dbo.tblPromotionProduct(promotionId, productId)
		SELECT @promotionId, productId FROM @productIds;
		INSERT INTO dbo.tblPromotionStore(promotionId, storeId)
		SELECT @promotionId, storeId FROM @storeIds;
		COMMIT TRANSACTION;
		SELECT promotionId FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

/* Promotions actives pour une boutique et une date donnee. */
CREATE OR ALTER PROCEDURE dbo.sp_GetActivePromotionsForStore
	@storeId int,
	@atDate datetime
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52408, 'storeId est obligatoire et doit etre positif.', 1;
		IF @atDate IS NULL SET @atDate = GETDATE();

		SELECT
			pr.promotionId, pr.companyId, pr.vcPromotionName,
			pr.discountTypeCode, pr.vcDiscountType, pr.dcDiscountValue,
			pr.dtStartDate, pr.dtEndDate
		FROM dbo.vw_PromotionDetails AS pr
		INNER JOIN dbo.vw_PromotionStoreDetails AS ps ON ps.promotionId = pr.promotionId
		WHERE ps.storeId = @storeId AND pr.btEnabled = 1
		  AND pr.dtStartDate <= @atDate AND pr.dtEndDate >= @atDate
		ORDER BY pr.dtEndDate ASC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Produits couverts par une promotion. */
CREATE OR ALTER PROCEDURE dbo.sp_GetPromotionProducts
	@promotionId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @promotionId IS NULL OR @promotionId <= 0
			THROW 52409, 'promotionId est obligatoire et doit etre positif.', 1;
		SELECT productId, vcProductCode, vcProductName
		FROM dbo.vw_PromotionProductDetails
		WHERE promotionId = @promotionId
		ORDER BY vcProductName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Desactive les promotions dont la date de fin est depassee. */
CREATE OR ALTER PROCEDURE dbo.sp_DisableExpiredPromotions
	@atDate datetime
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SET @atDate = COALESCE(@atDate, GETDATE());
		UPDATE dbo.tblPromotion
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE btEnabled = 1 AND dtEndDate < @atDate;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Produits portant au moins un lot actif encore en stock, expirant avant la date limite. */
CREATE OR ALTER PROCEDURE dbo.sp_GetProductsForExpiryPromotion
	@storeId int,
	@limitDate date
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52408, 'storeId est obligatoire et doit etre positif.', 1;
		IF @limitDate IS NULL
			THROW 52410, 'limitDate est obligatoire.', 1;
		SELECT DISTINCT productId
		FROM dbo.tblStockLot
		WHERE storeId = @storeId AND btEnabled = 1
		  AND dtExpirationAt IS NOT NULL AND dtExpirationAt <= @limitDate
		  AND dcRemainingQuantity > 0
		ORDER BY productId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
