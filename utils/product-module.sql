/*
  Module catalogue produits - SQL Server.
  Prerequis: dbo.tblProductCategory, dbo.tblProduct, dbo.tblStoreProduct,
             dbo.tblProductPriceHistory, dbo.tblStoreStock, dbo.tblStore,
             dbo.tblRefUnitOfMeasure.
  Le stock courant reste gere par les modules store-stock et stock-movement.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Categories avec entreprise. */
CREATE OR ALTER VIEW dbo.vw_ProductCategoryDetails
AS
	SELECT
		c.productCategoryId,
		c.companyId,
		c.vcCategoryCode,
		c.vcCategoryName,
		c.vcDescription,
		c.btEnabled,
		c.dtCreatedAt,
		c.dtLastUpdated
	FROM dbo.tblProductCategory AS c;
GO

/* Produit catalogue avec categorie et unite de mesure. */
CREATE OR ALTER VIEW dbo.vw_ProductDetails
AS
	SELECT
		p.productId,
		p.companyId,
		p.productCategoryId,
		c.vcCategoryCode,
		c.vcCategoryName,
		p.unitOfMeasureId,
		u.vcSymbol,
		p.vcProductCode,
		p.vcProductName,
		p.vcDescription,
		p.vcBarcode,
		p.vcImageUrl,
		p.dcDefaultAlertThreshold,
		p.createdByUserId,
		p.btEnabled,
		p.dtCreatedAt,
		p.dtLastUpdated
	FROM dbo.tblProduct AS p
	INNER JOIN dbo.tblProductCategory AS c ON c.productCategoryId = p.productCategoryId
	LEFT JOIN dbo.tblRefUnitOfMeasure AS u ON u.unitOfMeasureId = p.unitOfMeasureId;
GO

/* Prix et disponibilite par boutique, avec informations du produit. */
CREATE OR ALTER VIEW dbo.vw_StoreProductDetails
AS
	SELECT
		sp.storeProductId,
		sp.storeId,
		s.vcStoreName,
		s.companyId,
		sp.productId,
		p.productCategoryId,
		c.vcCategoryName,
		p.vcProductCode,
		p.vcProductName,
		p.vcDescription,
		p.vcBarcode,
		p.vcImageUrl,
		sp.mCurrentSalePrice,
		COALESCE(sp.alertThreshold, p.dcDefaultAlertThreshold) AS alertThreshold,
		COALESCE(k.dcAvailableQuantity, 0) AS dcAvailableQuantity,
		sp.btEnabled,
		sp.dtCreatedAt,
		sp.dtLastUpdated
	FROM dbo.tblStoreProduct AS sp
	INNER JOIN dbo.tblStore AS s ON s.storeId = sp.storeId
	INNER JOIN dbo.tblProduct AS p ON p.productId = sp.productId
	INNER JOIN dbo.tblProductCategory AS c ON c.productCategoryId = p.productCategoryId
	LEFT JOIN dbo.tblStoreStock AS k ON k.storeId = sp.storeId AND k.productId = sp.productId;
GO

/* Cree une categorie produit. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateProductCategory
	@companyId int,
	@vcCategoryCode varchar(20),
	@vcCategoryName varchar(50),
	@vcDescription nvarchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0 THROW 52500, 'companyId invalide.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcCategoryCode)), '') IS NULL THROW 52501, 'vcCategoryCode est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcCategoryName)), '') IS NULL THROW 52502, 'vcCategoryName est obligatoire.', 1;
		INSERT INTO dbo.tblProductCategory(companyId,vcCategoryCode,vcCategoryName,vcDescription,btEnabled,dtCreatedAt,dtLastUpdated)
		OUTPUT INSERTED.productCategoryId,INSERTED.companyId,INSERTED.vcCategoryCode,INSERTED.vcCategoryName
		VALUES(@companyId,LTRIM(RTRIM(@vcCategoryCode)),LTRIM(RTRIM(@vcCategoryName)),@vcDescription,1,SYSUTCDATETIME(),SYSUTCDATETIME());
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetProductCategoriesByCompany
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0 THROW 52500, 'companyId invalide.', 1;
		SELECT productCategoryId,companyId,vcCategoryCode,vcCategoryName,vcDescription,btEnabled
		FROM dbo.vw_ProductCategoryDetails
		WHERE companyId=@companyId AND btEnabled=1
		ORDER BY vcCategoryName;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Cree un produit; unitOfMeasureId a deja ete resolu via RefDAL. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateProduct
	@companyId int,
	@productCategoryId int,
	@unitOfMeasureId int = NULL,
	@vcProductCode varchar(20),
	@vcProductName varchar(50),
	@vcDescription varchar(150) = NULL,
	@vcBarcode varchar(100) = NULL,
	@vcImageUrl varchar(255) = NULL,
	@dcDefaultAlertThreshold decimal(18,3) = 0,
	@createdByUserId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0 THROW 52500, 'companyId invalide.', 1;
		IF @productCategoryId IS NULL OR @productCategoryId <= 0 THROW 52503, 'productCategoryId invalide.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcProductCode)), '') IS NULL THROW 52504, 'vcProductCode est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcProductName)), '') IS NULL THROW 52505, 'vcProductName est obligatoire.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0 THROW 52506, 'createdByUserId invalide.', 1;
		IF @dcDefaultAlertThreshold < 0 THROW 52507, 'Le seuil d alerte ne peut pas etre negatif.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblProductCategory WHERE productCategoryId=@productCategoryId AND companyId=@companyId)
			THROW 52508, 'Categorie absente de cette entreprise.', 1;
		IF @unitOfMeasureId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.tblRefUnitOfMeasure WHERE unitOfMeasureId=@unitOfMeasureId)
			THROW 52509, 'Unite de mesure introuvable.', 1;
		INSERT INTO dbo.tblProduct(companyId,productCategoryId,unitOfMeasureId,vcProductCode,vcProductName,vcDescription,vcBarcode,vcImageUrl,dcDefaultAlertThreshold,createdByUserId,btEnabled,dtCreatedAt,dtLastUpdated)
		OUTPUT INSERTED.productId,INSERTED.companyId,INSERTED.productCategoryId,INSERTED.vcProductCode,INSERTED.vcProductName,INSERTED.vcBarcode,INSERTED.dcDefaultAlertThreshold,INSERTED.btEnabled,INSERTED.dtCreatedAt
		VALUES(@companyId,@productCategoryId,@unitOfMeasureId,LTRIM(RTRIM(@vcProductCode)),LTRIM(RTRIM(@vcProductName)),@vcDescription,@vcBarcode,@vcImageUrl,@dcDefaultAlertThreshold,@createdByUserId,1,SYSUTCDATETIME(),SYSUTCDATETIME());
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetProductsByCompany
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0 THROW 52500, 'companyId invalide.', 1;
		SELECT productId,companyId,productCategoryId,vcCategoryName,unitOfMeasureId,vcSymbol,vcProductCode,vcProductName,vcDescription,vcBarcode,vcImageUrl,dcDefaultAlertThreshold,btEnabled
		FROM dbo.vw_ProductDetails
		WHERE companyId=@companyId AND btEnabled=1
		ORDER BY vcProductName;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetProductById
	@productId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @productId IS NULL OR @productId <= 0 THROW 52510, 'productId invalide.', 1;
		SELECT p.*,c.vcCategoryName
		FROM dbo.tblProduct AS p
		INNER JOIN dbo.tblProductCategory AS c ON c.productCategoryId=p.productCategoryId
		WHERE p.productId=@productId AND p.btEnabled=1;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_FindProductByBarcode
	@companyId int,
	@vcBarcode varchar(100)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0 THROW 52500, 'companyId invalide.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcBarcode)), '') IS NULL RETURN;
		SELECT TOP (1) * FROM dbo.tblProduct
		WHERE companyId=@companyId AND vcBarcode=@vcBarcode AND btEnabled=1;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_FindStoreProductByBarcode
	@storeId int,
	@vcBarcode varchar(100)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0 THROW 52511, 'storeId invalide.', 1;
		SELECT TOP (1)
			p.productId,p.companyId,p.productCategoryId,c.vcCategoryName,p.vcProductCode,p.vcProductName,p.vcDescription,p.vcBarcode,p.vcImageUrl,p.btEnabled,
			sp.mCurrentSalePrice,sp.alertThreshold,COALESCE(k.dcAvailableQuantity,0) AS dcAvailableQuantity
		FROM dbo.tblProduct AS p
		INNER JOIN dbo.tblProductCategory AS c ON c.productCategoryId=p.productCategoryId
		INNER JOIN dbo.tblStoreProduct AS sp ON sp.productId=p.productId AND sp.storeId=@storeId
		LEFT JOIN dbo.tblStoreStock AS k ON k.storeId=@storeId AND k.productId=p.productId
		WHERE p.vcBarcode=@vcBarcode AND p.btEnabled=1 AND sp.btEnabled=1;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_SearchStoreProducts
	@storeId int,
	@q varchar(100),
	@limit int=50
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId<=0 THROW 52511, 'storeId invalide.', 1;
		IF NULLIF(LTRIM(RTRIM(@q)),'') IS NULL RETURN;
		IF @limit IS NULL OR @limit<1 OR @limit>500 SET @limit=50;
		DECLARE @pattern varchar(202)='%'+@q+'%';
		SELECT TOP (@limit)
			p.productId,p.companyId,p.vcProductCode,p.vcProductName,p.vcDescription,p.vcBarcode,c.vcCategoryName,
			sp.mCurrentSalePrice,sp.alertThreshold,COALESCE(k.dcAvailableQuantity,0) AS dcAvailableQuantity
		FROM dbo.tblStoreProduct AS sp
		INNER JOIN dbo.tblProduct AS p ON p.productId=sp.productId
		INNER JOIN dbo.tblProductCategory AS c ON c.productCategoryId=p.productCategoryId
		LEFT JOIN dbo.tblStoreStock AS k ON k.storeId=sp.storeId AND k.productId=sp.productId
		WHERE sp.storeId=@storeId AND sp.btEnabled=1 AND p.btEnabled=1
		AND (p.vcProductName LIKE @pattern OR p.vcProductCode LIKE @pattern OR p.vcBarcode LIKE @pattern)
		ORDER BY p.vcProductName;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetStoreProductForSale
	@storeId int,
	@productId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT TOP (1) storeProductId,storeId,productId,mCurrentSalePrice,alertThreshold
		FROM dbo.tblStoreProduct
		WHERE storeId=@storeId AND productId=@productId AND btEnabled=1;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetSaleCatalogByStore
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT sp.productId,sp.mCurrentSalePrice,COALESCE(sp.alertThreshold,p.dcDefaultAlertThreshold) AS alertThreshold,
			COALESCE(k.dcAvailableQuantity,0) AS dcAvailableQuantity,p.vcProductName
		FROM dbo.tblStoreProduct AS sp
		INNER JOIN dbo.tblProduct AS p ON p.productId=sp.productId
		LEFT JOIN dbo.tblStoreStock AS k ON k.storeId=sp.storeId AND k.productId=sp.productId
		WHERE sp.storeId=@storeId AND sp.btEnabled=1 AND p.btEnabled=1;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Retourne le catalogue d'articles d'une boutique avec tous les champs
   attendus par le controller getAllArticles (prix, stock, categorie, image). */
CREATE OR ALTER PROCEDURE dbo.sp_GetArticlesWithDetails
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT
			sp.productId,
			sp.storeId AS boutiqueId,
			p.vcProductCode,
			p.vcProductName,
			p.vcBarcode,
			sp.mCurrentSalePrice,
			NULL AS mUnitPurchasePrice,
			COALESCE(k.dcAvailableQuantity, 0) AS dcAvailableQuantity,
			COALESCE(sp.alertThreshold, p.dcDefaultAlertThreshold, 10) AS alertThreshold,
			p.vcImageUrl,
			c.vcCategoryName,
			NULL AS fournisseurNom
		FROM dbo.tblStoreProduct AS sp
		INNER JOIN dbo.tblProduct AS p ON p.productId = sp.productId
		INNER JOIN dbo.tblProductCategory AS c ON c.productCategoryId = p.productCategoryId
		LEFT JOIN dbo.tblStoreStock AS k ON k.storeId = sp.storeId AND k.productId = sp.productId
		WHERE sp.storeId = @storeId
		  AND sp.btEnabled = 1
		  AND p.btEnabled = 1
		ORDER BY p.vcProductName;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Cree le lien boutique-produit et historise le prix dans la meme transaction. */
CREATE OR ALTER PROCEDURE dbo.sp_AddStoreProduct
	@storeId int,
	@productId bigint,
	@mCurrentSalePrice money,
	@alertThreshold int=NULL,
	@createdByUserId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @mCurrentSalePrice IS NULL OR @mCurrentSalePrice<0 THROW 52512, 'mCurrentSalePrice doit etre positif ou nul.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId<=0 THROW 52506, 'createdByUserId invalide.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblStore WHERE storeId=@storeId)
			THROW 52511, 'Boutique introuvable.', 1;
		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblProduct AS p
			INNER JOIN dbo.tblStore AS s ON s.storeId=@storeId
			WHERE p.productId=@productId AND p.companyId=s.companyId
		)
			THROW 52513, 'Produit absent ou rattache a une autre entreprise que la boutique.', 1;
		BEGIN TRANSACTION;
		DECLARE @created table(storeProductId int,storeId int,productId bigint,mCurrentSalePrice money,alertThreshold int NULL);
		INSERT INTO dbo.tblStoreProduct(storeId,productId,mCurrentSalePrice,alertThreshold,btEnabled,dtCreatedAt,dtLastUpdated)
		OUTPUT INSERTED.storeProductId,INSERTED.storeId,INSERTED.productId,INSERTED.mCurrentSalePrice,INSERTED.alertThreshold
		INTO @created(storeProductId,storeId,productId,mCurrentSalePrice,alertThreshold)
		VALUES(@storeId,@productId,@mCurrentSalePrice,@alertThreshold,1,SYSUTCDATETIME(),SYSUTCDATETIME());
		INSERT INTO dbo.tblProductPriceHistory(storeId,productId,mPurchasePrice,mSalePrice,dtEffectiveFrom,dtEffectiveTo,createdByUserId)
		VALUES(@storeId,@productId,NULL,@mCurrentSalePrice,SYSUTCDATETIME(),NULL,@createdByUserId);
		COMMIT TRANSACTION;
		SELECT * FROM @created;
	END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK TRANSACTION; THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetStoreProductsByProduct
	@productId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT sp.storeProductId,sp.storeId,s.vcStoreName,sp.mCurrentSalePrice,sp.alertThreshold,sp.btEnabled,
			COALESCE(k.dcAvailableQuantity,0) AS dcAvailableQuantity
		FROM dbo.tblStoreProduct AS sp
		INNER JOIN dbo.tblStore AS s ON s.storeId=sp.storeId
		LEFT JOIN dbo.tblStoreStock AS k ON k.storeId=sp.storeId AND k.productId=sp.productId
		WHERE sp.productId=@productId
		ORDER BY s.vcStoreName;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Mise a jour partielle suivant COALESCE/CASE du DAL existant. */
CREATE OR ALTER PROCEDURE dbo.sp_UpdateProduct
	@productId bigint,
	@vcProductName varchar(50)=NULL,
	@vcDescription varchar(150)=NULL,
	@vcBarcode varchar(100)=NULL,
	@vcImageUrl varchar(255)=NULL,
	@dcDefaultAlertThreshold decimal(18,3)=NULL,
	@productCategoryId int=NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		UPDATE dbo.tblProduct
		SET vcProductName=COALESCE(@vcProductName,vcProductName),
			vcDescription=COALESCE(@vcDescription,vcDescription),
			vcBarcode=CASE WHEN @vcBarcode IS NULL THEN vcBarcode ELSE @vcBarcode END,
			vcImageUrl=CASE WHEN @vcImageUrl IS NULL THEN vcImageUrl ELSE @vcImageUrl END,
			dcDefaultAlertThreshold=COALESCE(@dcDefaultAlertThreshold,dcDefaultAlertThreshold),
			productCategoryId=COALESCE(@productCategoryId,productCategoryId),
			dtLastUpdated=SYSUTCDATETIME()
		OUTPUT INSERTED.productId,INSERTED.vcProductName,INSERTED.dtLastUpdated
		WHERE productId=@productId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_SoftDeleteProduct
	@productId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		UPDATE dbo.tblProduct SET btEnabled=0,dtLastUpdated=SYSUTCDATETIME()
		WHERE productId=@productId;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Date d'expiration minimale des lots par produit (filtre catalogue
   expired / expiring_soon de productService). Prerequis: dbo.tblStockLot. */
CREATE OR ALTER PROCEDURE dbo.sp_GetProductLotExpiries
	@storeId int = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NOT NULL AND @storeId <= 0
			THROW 52514, 'storeId invalide lorsqu il est fourni.', 1;

		SELECT productId, MIN(dtExpirationAt) AS dtExpirationAt
		FROM dbo.tblStockLot
		WHERE (@storeId IS NULL OR storeId = @storeId)
		  AND btEnabled = 1
		  AND dtExpirationAt IS NOT NULL
		GROUP BY productId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
