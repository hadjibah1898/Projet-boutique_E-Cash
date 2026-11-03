/*
  Module mouvements de stock - SQL Server.
  Prerequis: dbo.tblStockMovement, dbo.tblStoreStock, dbo.tblStore,
             dbo.tblProduct, dbo.tblRefStockMovementType, dbo.tblUser.
  sp_RecordStockMovement peut etre appelee seule ou dans une transaction appelante.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Vue d'historique avec les alias attendus par StockMovementDAL.getByStore. */
CREATE OR ALTER VIEW dbo.vw_StockMovementDetails
AS
	SELECT
		m.stockMovementId,
		m.storeId,
		m.productId,
		p.vcProductName,
		m.stockLotId,
		m.stockMovementTypeId,
		t.vcCode,
		t.vcStockMovementType,
		m.dcQuantity,
		m.dcStockBefore,
		m.dcStockAfter,
		m.vcReferenceType,
		m.referenceId,
		m.operatedByUserId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS operatedByName,
		m.dtMovementAt,
		m.vcComment
	FROM dbo.tblStockMovement AS m
	INNER JOIN dbo.tblProduct AS p ON p.productId = m.productId
	INNER JOIN dbo.tblRefStockMovementType AS t
		ON t.stockMovementTypeId = m.stockMovementTypeId
	INNER JOIN dbo.tblUser AS u ON u.userId = m.operatedByUserId;
GO

/* Cree le journal et met a jour tblStoreStock dans la meme transaction. */
CREATE OR ALTER PROCEDURE dbo.sp_RecordStockMovement
	@storeId int,
	@productId bigint,
	@stockLotId int = NULL,
	@stockMovementTypeId int,
	@dcQuantity decimal(18, 3),
	@vcReferenceType varchar(30) = NULL,
	@referenceId int = NULL,
	@operatedByUserId int,
	@vcComment varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51900, 'storeId est obligatoire et doit etre positif.', 1;
		IF @productId IS NULL OR @productId <= 0
			THROW 51901, 'productId est obligatoire et doit etre positif.', 1;
		IF @stockMovementTypeId IS NULL OR @stockMovementTypeId <= 0
			THROW 51902, 'stockMovementTypeId est obligatoire.', 1;
		IF @dcQuantity IS NULL OR @dcQuantity = 0
			THROW 51903, 'dcQuantity doit etre different de zero.', 1;
		IF @operatedByUserId IS NULL OR @operatedByUserId <= 0
			THROW 51904, 'operatedByUserId est obligatoire.', 1;

		DECLARE @direction smallint;
		SELECT @direction = direction
		FROM dbo.tblRefStockMovementType
		WHERE stockMovementTypeId = @stockMovementTypeId;
		IF @direction IS NULL OR @direction NOT IN (-1, 1)
			THROW 51902, 'Type de mouvement absent ou direction invalide.', 1;

		DECLARE @startedTransaction bit = 0;
		IF @@TRANCOUNT = 0
		BEGIN
			BEGIN TRANSACTION;
			SET @startedTransaction = 1;
		END
		ELSE
			SAVE TRANSACTION StockMovementSave;

		/* Initialiser la ligne sous verrou, puis lire son solde protege. */
		MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
		USING (SELECT @storeId AS storeId, @productId AS productId) AS source
			ON target.storeId = source.storeId AND target.productId = source.productId
		WHEN NOT MATCHED THEN
			INSERT (storeId, productId, dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt)
			VALUES (source.storeId, source.productId, 0, 0, SYSUTCDATETIME());

		DECLARE @stockBefore decimal(18, 3);
		SELECT @stockBefore = dcAvailableQuantity
		FROM dbo.tblStoreStock WITH (UPDLOCK, HOLDLOCK)
		WHERE storeId = @storeId AND productId = @productId;
		IF @stockBefore IS NULL
			THROW 51905, 'Ligne de stock introuvable apres initialisation.', 1;

		/* Le DAL fournit deja une quantite signee selon le type; le referentiel fait autorite. */
		DECLARE @signedQuantity decimal(18, 3) = @direction * ABS(@dcQuantity);
		DECLARE @stockAfter decimal(18, 3) = @stockBefore + @signedQuantity;
		IF @stockAfter < 0
			THROW 51906, 'Stock insuffisant pour effectuer ce mouvement.', 1;

		DECLARE @inserted table (
			stockMovementId int,
			dcStockBefore decimal(18, 3),
			dcStockAfter decimal(18, 3)
		);
		INSERT INTO dbo.tblStockMovement (
			storeId, productId, stockLotId, stockMovementTypeId,
			dcQuantity, dcStockBefore, dcStockAfter, vcReferenceType,
			referenceId, operatedByUserId, dtMovementAt, vcComment
		)
		OUTPUT INSERTED.stockMovementId, INSERTED.dcStockBefore, INSERTED.dcStockAfter
			INTO @inserted (stockMovementId, dcStockBefore, dcStockAfter)
		VALUES (
			@storeId, @productId, @stockLotId, @stockMovementTypeId,
			@signedQuantity, @stockBefore, @stockAfter, @vcReferenceType,
			@referenceId, @operatedByUserId, SYSUTCDATETIME(), @vcComment
		);

		UPDATE dbo.tblStoreStock
		SET dcAvailableQuantity = @stockAfter,
			dtUpdatedAt = SYSUTCDATETIME()
		WHERE storeId = @storeId AND productId = @productId;

		IF @startedTransaction = 1 COMMIT TRANSACTION;
		SELECT stockMovementId, dcStockBefore, dcStockAfter FROM @inserted;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0
		BEGIN
			IF @startedTransaction = 1 ROLLBACK TRANSACTION;
			ELSE IF XACT_STATE() = 1 ROLLBACK TRANSACTION StockMovementSave;
		END;
		THROW;
	END CATCH;
END;
GO

/* Historique d'une boutique, filtrable par produit et limite. */
CREATE OR ALTER PROCEDURE dbo.sp_GetStockMovementsByStore
	@storeId int,
	@productId bigint = NULL,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51900, 'storeId est obligatoire et doit etre positif.', 1;
		IF @productId IS NOT NULL AND @productId <= 0
			THROW 51901, 'productId doit etre positif lorsqu il est fourni.', 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 1000 SET @limit = 100;

		SELECT TOP (@limit)
			stockMovementId, storeId, productId, vcProductName,
			stockLotId, stockMovementTypeId, vcCode, vcStockMovementType,
			dcQuantity, dcStockBefore, dcStockAfter,
			vcReferenceType, referenceId, operatedByUserId,
			operatedByName, dtMovementAt, vcComment
		FROM dbo.vw_StockMovementDetails
		WHERE storeId = @storeId AND (@productId IS NULL OR productId = @productId)
		ORDER BY dtMovementAt DESC, stockMovementId DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Mouvement par identifiant. */
CREATE OR ALTER PROCEDURE dbo.sp_GetStockMovementById
	@stockMovementId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockMovementId IS NULL OR @stockMovementId <= 0
			THROW 51907, 'stockMovementId est obligatoire et doit etre positif.', 1;

		SELECT
			stockMovementId, storeId, productId, vcProductName,
			stockLotId, stockMovementTypeId, vcCode, vcStockMovementType,
			dcQuantity, dcStockBefore, dcStockAfter,
			vcReferenceType, referenceId, operatedByUserId,
			operatedByName, dtMovementAt, vcComment
		FROM dbo.vw_StockMovementDetails
		WHERE stockMovementId = @stockMovementId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
