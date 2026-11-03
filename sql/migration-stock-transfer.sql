/*
 * ===============================================================================
 *  Migration : Procédures stockées et vues pour les transferts de stock
 *  SGBD        : Microsoft SQL Server
 *  Base        : GestionsBoutiques
 *  Description : Applique les procédures et vues du module transferts
 *                (référencées par stockTransferDAL.js) qui manquent dans
 *                scriptprincipale.sql.
 * ===============================================================================
 */

USE GestionsBoutiques;
GO

/*-----------------------------------------------------------------------------
  1. TYPES TABLE (TVP) pour les transferts
-----------------------------------------------------------------------------*/
IF TYPE_ID(N'dbo.StockTransferDetailCreateType') IS NULL
BEGIN
    EXEC(N'CREATE TYPE dbo.StockTransferDetailCreateType AS TABLE (
        productId BIGINT NOT NULL,
        stockLotId INT NULL,
        dcRequestedQuantity DECIMAL(18,3) NOT NULL
    )');
END;
GO

IF TYPE_ID(N'dbo.StockTransferQuantityUpdateType') IS NULL
BEGIN
    EXEC(N'CREATE TYPE dbo.StockTransferQuantityUpdateType AS TABLE (
        stockTransferDetailId INT NOT NULL PRIMARY KEY,
        dcShippedQuantity DECIMAL(18,3) NOT NULL,
        dcReceivedQuantity DECIMAL(18,3) NOT NULL
    )');
END;
GO
/*-----------------------------------------------------------------------------
  2. VUES
-----------------------------------------------------------------------------*/

/* Vue : vw_StockTransferDetails */
IF OBJECT_ID('dbo.vw_StockTransferDetails', 'V') IS NOT NULL
    DROP VIEW dbo.vw_StockTransferDetails;
GO

CREATE VIEW dbo.vw_StockTransferDetails AS
SELECT
    t.stockTransferId,
    t.vcTransferNumber,
    t.sourceStoreId,
    s.vcStoreCode AS sourceStoreCode,
    s.vcStoreName AS sourceStoreName,
    t.destinationStoreId,
    d.vcStoreCode AS destinationStoreCode,
    d.vcStoreName AS destinationStoreName,
    t.transferStatusId,
    st.vcCode AS statusCode,
    st.vcTransferStatus,
    t.createdByUserId,
    u.vcLastName AS createdByLastName,
    u.vcFirstName AS createdByFirstName,
    t.vcCarrierName,
    t.dtCreatedAt,
    t.dtShippedAt,
    t.dtReceivedAt,
    t.IsCancelled,
    t.vcCancellationReason
FROM dbo.tblStockTransfer t
INNER JOIN dbo.tblStore s ON t.sourceStoreId = s.storeId
INNER JOIN dbo.tblStore d ON t.destinationStoreId = d.storeId
INNER JOIN dbo.tblRefTransferStatus st ON t.transferStatusId = st.transferStatusId
INNER JOIN dbo.tblUser u ON t.createdByUserId = u.userId;
GO

/* Vue : vw_StockTransferLineDetails */
IF OBJECT_ID('dbo.vw_StockTransferLineDetails', 'V') IS NOT NULL
    DROP VIEW dbo.vw_StockTransferLineDetails;
GO

CREATE VIEW dbo.vw_StockTransferLineDetails AS
SELECT
    d.stockTransferDetailId,
    d.stockTransferId,
    d.productId,
    p.vcProductName,
    p.vcProductCode,
    d.stockLotId,
    d.dcRequestedQuantity,
    d.dcShippedQuantity,
    d.dcReceivedQuantity,
    (d.dcRequestedQuantity - ISNULL(d.dcShippedQuantity, 0)) AS dcPendingQuantity
FROM dbo.tblStockTransferDetail d
INNER JOIN dbo.tblProduct p ON d.productId = p.productId;
GO
/*-----------------------------------------------------------------------------
  3. PROCÉDURES STOCKÉES
-----------------------------------------------------------------------------*/

/* sp_CreateStockTransfer */
IF OBJECT_ID('dbo.sp_CreateStockTransfer', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_CreateStockTransfer;
GO

CREATE PROCEDURE dbo.sp_CreateStockTransfer
    @vcTransferNumber      VARCHAR(30),
    @sourceStoreId         INT,
    @destinationStoreId    INT,
    @transferStatusId      INT,
    @createdByUserId       INT,
    @vcCarrierName         VARCHAR(50) = NULL,
    @details               dbo.StockTransferDetailCreateType READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @sourceStoreId IS NULL OR @sourceStoreId <= 0
            THROW 51802, 'sourceStoreId est obligatoire et doit être positif.', 1;
        IF @destinationStoreId IS NULL OR @destinationStoreId <= 0
            THROW 51803, 'destinationStoreId est obligatoire et doit être positif.', 1;
        IF @sourceStoreId = @destinationStoreId
            THROW 51803, 'La boutique source et destination doivent être différentes.', 1;
        IF NOT EXISTS (SELECT 1 FROM @details)
            THROW 51805, 'Au moins une ligne de transfert est requise.', 1;
        IF EXISTS (SELECT 1 FROM @details WHERE productId <= 0 OR dcRequestedQuantity <= 0)
            THROW 51806, 'Chaque ligne exige productId positif et dcRequestedQuantity > 0.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblRefTransferStatus WHERE transferStatusId = @transferStatusId)
            THROW 51807, 'Statut de transfert introuvable.', 1;

        INSERT INTO dbo.tblStockTransfer (
            vcTransferNumber, sourceStoreId, destinationStoreId,
            transferStatusId, createdByUserId, vcCarrierName, dtCreatedAt
        )
        OUTPUT INSERTED.stockTransferId, INSERTED.vcTransferNumber
        VALUES (@vcTransferNumber, @sourceStoreId, @destinationStoreId,
                @transferStatusId, @createdByUserId, @vcCarrierName, SYSUTCDATETIME());

        DECLARE @stockTransferId INT;
        SET @stockTransferId = SCOPE_IDENTITY();

        INSERT INTO dbo.tblStockTransferDetail (
            stockTransferId, productId, stockLotId, dcRequestedQuantity
        )
        SELECT @stockTransferId, productId, stockLotId, dcRequestedQuantity
        FROM @details;

        SELECT @stockTransferId AS stockTransferId, @vcTransferNumber AS vcTransferNumber;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
/* sp_GetStockTransferHeader */
IF OBJECT_ID('dbo.sp_GetStockTransferHeader', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_GetStockTransferHeader;
GO

CREATE PROCEDURE dbo.sp_GetStockTransferHeader
    @stockTransferId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM dbo.vw_StockTransferDetails WHERE stockTransferId = @stockTransferId;
END;
GO

/* sp_GetStockTransferDetails */
IF OBJECT_ID('dbo.sp_GetStockTransferDetails', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_GetStockTransferDetails;
GO

CREATE PROCEDURE dbo.sp_GetStockTransferDetails
    @stockTransferId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM dbo.vw_StockTransferLineDetails WHERE stockTransferId = @stockTransferId;
END;
GO

/* sp_SetStockTransferStatus */
IF OBJECT_ID('dbo.sp_SetStockTransferStatus', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_SetStockTransferStatus;
GO

CREATE PROCEDURE dbo.sp_SetStockTransferStatus
    @stockTransferId      INT,
    @transferStatusId     INT,
    @approvedByUserId     INT = NULL,
    @vcCancellationReason VARCHAR(150) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @stockTransferId IS NULL OR @stockTransferId <= 0
            THROW 51808, 'stockTransferId est obligatoire et doit être positif.', 1;

        DECLARE @currentStatus VARCHAR(20);
        SELECT @currentStatus = st.vcCode
        FROM dbo.tblStockTransfer t
        INNER JOIN dbo.tblRefTransferStatus st ON t.transferStatusId = st.transferStatusId
        WHERE t.stockTransferId = @stockTransferId;

        IF @currentStatus IS NULL
            THROW 51808, 'Transfert introuvable.', 1;

        DECLARE @dtShippedAt DATETIME = NULL;
        DECLARE @dtReceivedAt DATETIME = NULL;
        DECLARE @newStatusCode VARCHAR(20);

        SELECT @newStatusCode = vcCode FROM dbo.tblRefTransferStatus WHERE transferStatusId = @transferStatusId;

        IF @newStatusCode = 'SHIPPED' SET @dtShippedAt = SYSUTCDATETIME();
        IF @newStatusCode = 'RECEIVED' SET @dtReceivedAt = SYSUTCDATETIME();

        UPDATE dbo.tblStockTransfer
        SET transferStatusId = @transferStatusId,
            approvedByUserId = @approvedByUserId,
            dtShippedAt = CASE WHEN @dtShippedAt IS NOT NULL THEN @dtShippedAt ELSE dtShippedAt END,
            dtReceivedAt = CASE WHEN @dtReceivedAt IS NOT NULL THEN @dtReceivedAt ELSE dtReceivedAt END,
            IsCancelled = CASE WHEN @newStatusCode = 'CANCELLED' THEN 1 ELSE IsCancelled END,
            vcCancellationReason = CASE WHEN @newStatusCode = 'CANCELLED' THEN @vcCancellationReason ELSE vcCancellationReason END
        WHERE stockTransferId = @stockTransferId;

        SELECT * FROM dbo.vw_StockTransferDetails WHERE stockTransferId = @stockTransferId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO
/* sp_GetStockTransfersByStore */
IF OBJECT_ID('dbo.sp_GetStockTransfersByStore', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_GetStockTransfersByStore;
GO

CREATE PROCEDURE dbo.sp_GetStockTransfersByStore
    @storeId     INT = NULL,
    @limit       INT = 100,
    @statusCode  VARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        IF @limit IS NULL OR @limit < 1 OR @limit > 1000 SET @limit = 100;

        SELECT TOP (@limit) t.*
        FROM dbo.vw_StockTransferDetails AS t
        WHERE (@storeId IS NULL OR t.sourceStoreId = @storeId OR t.destinationStoreId = @storeId)
          AND (@statusCode IS NULL OR t.statusCode = @statusCode)
        ORDER BY t.dtCreatedAt DESC;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

/* sp_UpdateStockTransferQuantities */
IF OBJECT_ID('dbo.sp_UpdateStockTransferQuantities', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_UpdateStockTransferQuantities;
GO

CREATE PROCEDURE dbo.sp_UpdateStockTransferQuantities
    @stockTransferId INT,
    @quantities      dbo.StockTransferQuantityUpdateType READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @stockTransferId IS NULL OR @stockTransferId <= 0
            THROW 51808, 'stockTransferId est obligatoire et doit être positif.', 1;

        IF EXISTS (
            SELECT 1 FROM @quantities
            WHERE dcShippedQuantity < 0 OR dcReceivedQuantity < 0
        )
            THROW 51809, 'Quantités expédiées/reçues invalides.', 1;

        IF EXISTS (
            SELECT 1 FROM @quantities q
            LEFT JOIN dbo.tblStockTransferDetail d
                ON d.stockTransferDetailId = q.stockTransferDetailId
               AND d.stockTransferId = @stockTransferId
            WHERE d.stockTransferDetailId IS NULL
        )
            THROW 51810, 'Une ligne de quantité ne correspond pas à ce transfert.', 1;

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

PRINT 'Migration stock-transfer terminée avec succès.';