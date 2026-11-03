/*
  Module stock par boutique - SQL Server.
  Prerequis: dbo.tblStoreStock, dbo.tblStore, dbo.tblProduct, dbo.tblStoreProduct.
  Ce script fournit des procedures equivalentes aux operations de storeStockDAL.js.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Stock par boutique avec informations produit, seuil et statut de stock bas. */
CREATE OR ALTER VIEW dbo.vw_StoreStockDetails
AS
	SELECT
		k.storeStockId,
		k.storeId,
		s.companyId,
		k.productId,
		p.vcProductCode,
		p.vcProductName,
		p.btEnabled AS productEnabled,
		k.dcAvailableQuantity,
		k.dcReservedQuantity,
		COALESCE(sp.alertThreshold, p.dcDefaultAlertThreshold, 0) AS threshold,
		CONVERT(bit, CASE
			WHEN k.dcAvailableQuantity <= COALESCE(sp.alertThreshold, p.dcDefaultAlertThreshold, 0)
			THEN 1 ELSE 0 END) AS isLowStock,
		k.dtUpdatedAt
	FROM dbo.tblStoreStock AS k
	INNER JOIN dbo.tblStore AS s ON s.storeId = k.storeId
	INNER JOIN dbo.tblProduct AS p ON p.productId = k.productId
	LEFT JOIN dbo.tblStoreProduct AS sp
		ON sp.storeId = k.storeId AND sp.productId = k.productId;
GO

/* Lit la ligne de stock ou l'initialise a zero, de maniere atomique. */
CREATE OR ALTER PROCEDURE dbo.sp_GetOrCreateStoreStock
	@storeId int,
	@productId bigint
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51600, 'storeId est obligatoire et doit etre positif.', 1;
		IF @productId IS NULL OR @productId <= 0
			THROW 51601, 'productId est obligatoire et doit etre positif.', 1;

		MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
		USING (SELECT @storeId AS storeId, @productId AS productId) AS source
			ON target.storeId = source.storeId AND target.productId = source.productId
		WHEN NOT MATCHED THEN
			INSERT (storeId, productId, dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt)
			VALUES (source.storeId, source.productId, 0, 0, SYSUTCDATETIME());

		SELECT storeStockId, storeId, productId,
			dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt
		FROM dbo.tblStoreStock
		WHERE storeId = @storeId AND productId = @productId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Applique un delta atomique et retourne les valeurs before/after du DAL. */
CREATE OR ALTER PROCEDURE dbo.sp_ApplyStoreStockDeltaForStore
	@storeId int,
	@productId bigint,
	@delta decimal(18, 3)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51600, 'storeId est obligatoire et doit etre positif.', 1;
		IF @productId IS NULL OR @productId <= 0
			THROW 51601, 'productId est obligatoire et doit etre positif.', 1;
		IF @delta IS NULL OR @delta = 0
			THROW 51602, 'Le delta de stock ne peut pas etre nul.', 1;

		DECLARE @changed table (
			[before] decimal(18, 3),
			[after] decimal(18, 3)
		);
		UPDATE dbo.tblStoreStock WITH (UPDLOCK, ROWLOCK)
		SET dcAvailableQuantity = dcAvailableQuantity + @delta,
			dtUpdatedAt = SYSUTCDATETIME()
		OUTPUT DELETED.dcAvailableQuantity, INSERTED.dcAvailableQuantity
			INTO @changed ([before], [after])
		WHERE storeId = @storeId AND productId = @productId
		  AND (@delta > 0 OR dcAvailableQuantity + @delta >= 0);

		IF EXISTS (SELECT 1 FROM @changed)
		BEGIN
			SELECT [before], [after] FROM @changed;
			RETURN;
		END;

		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblStoreStock
			WHERE storeId = @storeId AND productId = @productId
		)
			THROW 51603, 'Aucune ligne de stock initialisee pour ce produit et cette boutique.', 1;
		THROW 51604, 'Stock insuffisant pour appliquer le delta demande.', 1;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Stock de la boutique; includeInactive suit le second argument du DAL. */
CREATE OR ALTER PROCEDURE dbo.sp_GetStoreStockByStore
	@storeId int,
	@includeInactive bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51600, 'storeId est obligatoire et doit etre positif.', 1;
		SELECT
			storeStockId, storeId, productId, vcProductCode, vcProductName,
			dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt
		FROM dbo.vw_StoreStockDetails
		WHERE storeId = @storeId
		  AND (@includeInactive = 1 OR productEnabled = 1)
		ORDER BY vcProductName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Produits actifs sous leur seuil d'alerte effectif. */
CREATE OR ALTER PROCEDURE dbo.sp_GetLowStoreStock
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51600, 'storeId est obligatoire et doit etre positif.', 1;
		SELECT
			productId, vcProductCode, vcProductName,
			dcAvailableQuantity, threshold
		FROM dbo.vw_StoreStockDetails
		WHERE storeId = @storeId AND productEnabled = 1 AND isLowStock = 1
		ORDER BY dcAvailableQuantity ASC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
