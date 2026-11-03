/*
  Module transferts de stock - SQL Server.
  Prerequis: dbo.tblStockTransfer, dbo.tblStockTransferDetail,
             dbo.tblRefTransferStatus, dbo.tblStore, dbo.tblProduct.
  Pour la creation et la mise a jour par lot, utiliser le type table
  dbo.StockTransferQuantityUpdateType defini dans ce script.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Entete du transfert avec statut et informations des deux boutiques. */
CREATE OR ALTER VIEW dbo.vw_StockTransferDetails
AS
	SELECT
		t.stockTransferId,
		t.vcTransferNumber,
		t.sourceStoreId,
		src.companyId AS sourceCompanyId,
		src.vcStoreName AS sourceStoreName,
		t.destinationStoreId,
		dst.companyId AS destCompanyId,
		dst.vcStoreName AS destStoreName,
		t.transferStatusId,
		r.vcCode AS statusCode,
		r.vcTransferStatus,
		t.createdByUserId,
		t.approvedByUserId,
		t.vcCarrierName,
		t.dtCreatedAt,
		t.dtShippedAt,
		t.dtReceivedAt,
		t.IsCancelled,
		t.vcCancellationReason
	FROM dbo.tblStockTransfer AS t
	INNER JOIN dbo.tblRefTransferStatus AS r ON r.transferStatusId = t.transferStatusId
	INNER JOIN dbo.tblStore AS src ON src.storeId = t.sourceStoreId
	INNER JOIN dbo.tblStore AS dst ON dst.storeId = t.destinationStoreId;
GO

/* Lignes de transfert avec identification du produit. */
CREATE OR ALTER VIEW dbo.vw_StockTransferLineDetails
AS
	SELECT
		d.stockTransferDetailId,
		d.stockTransferId,
		d.productId,
		p.vcProductCode,
		p.vcProductName,
		d.stockLotId,
		d.dcRequestedQuantity,
		d.dcShippedQuantity,
		d.dcReceivedQuantity
	FROM dbo.tblStockTransferDetail AS d
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO

/* Type table des lignes de creation d'un transfert. */
IF TYPE_ID(N'dbo.StockTransferDetailCreateType') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.StockTransferDetailCreateType AS TABLE (
		productId bigint NOT NULL,
		stockLotId int NULL,
		dcRequestedQuantity decimal(18, 3) NOT NULL
	)');
END;
GO

/* Type table pour remplacer les boucles UPDATE ligne par ligne du DAL. */
IF TYPE_ID(N'dbo.StockTransferQuantityUpdateType') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.StockTransferQuantityUpdateType AS TABLE (
		stockTransferDetailId int NOT NULL PRIMARY KEY,
		dcShippedQuantity decimal(18, 3) NOT NULL,
		dcReceivedQuantity decimal(18, 3) NOT NULL
	)');
END;
GO

/* Cree l'entete et toutes les lignes atomiquement; statusId est le statut DRAFT resolu par RefDAL. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateStockTransfer
	@vcTransferNumber varchar(30),
	@sourceStoreId int,
	@destinationStoreId int,
	@transferStatusId int,
	@createdByUserId int,
	@vcCarrierName varchar(50) = NULL,
	@details dbo.StockTransferDetailCreateType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcTransferNumber)), '') IS NULL
			THROW 51800, 'vcTransferNumber est obligatoire.', 1;
		IF @sourceStoreId IS NULL OR @sourceStoreId <= 0
			THROW 51801, 'sourceStoreId est obligatoire et doit etre positif.', 1;
		IF @destinationStoreId IS NULL OR @destinationStoreId <= 0
			THROW 51802, 'destinationStoreId est obligatoire et doit etre positif.', 1;
		IF @sourceStoreId = @destinationStoreId
			THROW 51803, 'Les boutiques source et destination doivent etre differentes.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 51804, 'createdByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM @details)
			THROW 51805, 'Au moins une ligne de transfert est requise.', 1;
		IF EXISTS (SELECT 1 FROM @details WHERE productId <= 0 OR dcRequestedQuantity <= 0)
			THROW 51806, 'Chaque ligne exige productId positif et dcRequestedQuantity > 0.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefTransferStatus WHERE transferStatusId = @transferStatusId)
			THROW 51807, 'Statut de transfert introuvable.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (stockTransferId int, vcTransferNumber varchar(30));
		INSERT INTO dbo.tblStockTransfer (
			vcTransferNumber, sourceStoreId, destinationStoreId, transferStatusId,
			createdByUserId, approvedByUserId, vcCarrierName,
			dtCreatedAt, dtShippedAt, dtReceivedAt, IsCancelled, vcCancellationReason
		)
		OUTPUT INSERTED.stockTransferId, INSERTED.vcTransferNumber
			INTO @created (stockTransferId, vcTransferNumber)
		VALUES (
			LTRIM(RTRIM(@vcTransferNumber)), @sourceStoreId, @destinationStoreId,
			@transferStatusId, @createdByUserId, NULL, @vcCarrierName,
			SYSUTCDATETIME(), NULL, NULL, 0, NULL
		);

		DECLARE @stockTransferId int = (SELECT stockTransferId FROM @created);
		INSERT INTO dbo.tblStockTransferDetail (
			stockTransferId, productId, stockLotId,
			dcRequestedQuantity, dcShippedQuantity, dcReceivedQuantity
		)
		SELECT @stockTransferId, productId, stockLotId, dcRequestedQuantity, 0, 0
		FROM @details;
		COMMIT TRANSACTION;
		SELECT stockTransferId, vcTransferNumber FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

/* Lecture de l'entete et de ses boutiques. */
CREATE OR ALTER PROCEDURE dbo.sp_GetStockTransferHeader
	@stockTransferId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockTransferId IS NULL OR @stockTransferId <= 0
			THROW 51808, 'stockTransferId est obligatoire et doit etre positif.', 1;
		SELECT *
		FROM dbo.vw_StockTransferDetails
		WHERE stockTransferId = @stockTransferId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Details d'un transfert. */
CREATE OR ALTER PROCEDURE dbo.sp_GetStockTransferDetails
	@stockTransferId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockTransferId IS NULL OR @stockTransferId <= 0
			THROW 51808, 'stockTransferId est obligatoire et doit etre positif.', 1;
		SELECT *
		FROM dbo.vw_StockTransferLineDetails
		WHERE stockTransferId = @stockTransferId
		ORDER BY stockTransferDetailId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Fait avancer le statut et positionne les dates/indicateurs correspondants. */
CREATE OR ALTER PROCEDURE dbo.sp_SetStockTransferStatus
	@stockTransferId int,
	@transferStatusId int,
	@approvedByUserId int = NULL,
	@vcCancellationReason varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockTransferId IS NULL OR @stockTransferId <= 0
			THROW 51808, 'stockTransferId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefTransferStatus WHERE transferStatusId = @transferStatusId)
			THROW 51807, 'Statut de transfert introuvable.', 1;

		UPDATE t
		SET transferStatusId = @transferStatusId,
			approvedByUserId = COALESCE(@approvedByUserId, t.approvedByUserId),
			dtShippedAt = CASE
				WHEN r.vcCode = 'SHIPPED' THEN COALESCE(t.dtShippedAt, SYSUTCDATETIME())
				ELSE t.dtShippedAt END,
			dtReceivedAt = CASE
				WHEN r.vcCode = 'RECEIVED' THEN SYSUTCDATETIME()
				ELSE t.dtReceivedAt END,
			IsCancelled = CASE WHEN r.vcCode = 'CANCELLED' THEN 1 ELSE t.IsCancelled END,
			vcCancellationReason = COALESCE(@vcCancellationReason, t.vcCancellationReason)
		OUTPUT INSERTED.stockTransferId, INSERTED.transferStatusId
		FROM dbo.tblStockTransfer AS t
		INNER JOIN dbo.tblRefTransferStatus AS r ON r.transferStatusId = @transferStatusId
		WHERE t.stockTransferId = @stockTransferId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Transferts impliquant une boutique, limites au nombre demande. */
CREATE OR ALTER PROCEDURE dbo.sp_GetStockTransfersByStore
	@storeId int,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51801, 'storeId est obligatoire et doit etre positif.', 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 1000 SET @limit = 100;
		SELECT TOP (@limit) t.*
		FROM dbo.vw_StockTransferDetails AS t
		WHERE (t.sourceStoreId = @storeId OR t.destinationStoreId = @storeId)
  AND (@statusCode IS NULL OR t.statusCode = @statusCode)
		ORDER BY t.dtCreatedAt DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Met a jour par lot les quantites expediees/recues et verifie les lignes du transfert. */
CREATE OR ALTER PROCEDURE dbo.sp_UpdateStockTransferQuantities
	@stockTransferId int,
	@quantities dbo.StockTransferQuantityUpdateType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockTransferId IS NULL OR @stockTransferId <= 0
			THROW 51808, 'stockTransferId est obligatoire et doit etre positif.', 1;
		IF EXISTS (
			SELECT 1 FROM @quantities
			WHERE dcShippedQuantity < 0 OR dcReceivedQuantity < 0
		)
			THROW 51809, 'Quantites expediees/reçues invalides.', 1;
		IF EXISTS (
			SELECT 1 FROM @quantities q
			LEFT JOIN dbo.tblStockTransferDetail d
				ON d.stockTransferDetailId = q.stockTransferDetailId
			   AND d.stockTransferId = @stockTransferId
			WHERE d.stockTransferDetailId IS NULL
		)
			THROW 51810, 'Une ligne de quantite ne correspond pas a ce transfert.', 1;

		UPDATE d
		SET dcShippedQuantity = q.dcShippedQuantity,
			dcReceivedQuantity = q.dcReceivedQuantity
		FROM dbo.tblStockTransferDetail AS d
		INNER JOIN @quantities AS q ON q.stockTransferDetailId = d.stockTransferDetailId
		WHERE d.stockTransferId = @stockTransferId;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
