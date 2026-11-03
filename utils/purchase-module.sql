USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Entetes d'achat enrichies du fournisseur, de la boutique et du statut. */
CREATE OR ALTER VIEW dbo.vw_PurchaseDetails
AS
	SELECT
		p.purchaseId,
		p.vcPurchaseNumber,
		p.supplierId,
		s.vcBusinessName AS supplierName,
		p.storeId,
		st.companyId,
		st.vcStoreName,
		p.purchaseStatusId,
		rs.vcCode AS statusCode,
		rs.vcPurchaseStatus,
		p.dtOrderAt,
		p.dtReceivedAt,
		p.mTotalAmount,
		p.createdByUserId,
		p.receivedByUserId,
		p.btEnabled,
		p.dtCreatedAt,
		p.dtLastUpdated
	FROM dbo.tblPurchase AS p
	INNER JOIN dbo.tblSupplier AS s ON s.supplierId = p.supplierId
	INNER JOIN dbo.tblStore AS st ON st.storeId = p.storeId
	INNER JOIN dbo.tblRefPurchaseStatus AS rs ON rs.purchaseStatusId = p.purchaseStatusId;
GO

/* Lignes d'achat avec l'identite du produit. */
CREATE OR ALTER VIEW dbo.vw_PurchaseLineDetails
AS
	SELECT
		d.purchaseDetailId,
		d.purchaseId,
		d.productId,
		p.vcProductCode,
		p.vcProductName,
		d.dcOrderedQuantity,
		d.dcReceivedQuantity,
		d.mUnitPurchasePrice,
		d.LineAmount,
		d.vcLotNumber,
		d.dtExpirationAt
	FROM dbo.tblPurchaseDetail AS d
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO

IF TYPE_ID(N'dbo.PurchaseDetailInputType') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.PurchaseDetailInputType AS TABLE (
		productId bigint NOT NULL,
		dcOrderedQuantity decimal(18, 3) NOT NULL,
		mUnitPurchasePrice money NOT NULL,
		vcLotNumber varchar(30) NULL,
		dtExpirationAt date NULL
	)');
END;
GO

IF TYPE_ID(N'dbo.PurchaseReceptionInputType') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.PurchaseReceptionInputType AS TABLE (
		purchaseDetailId int NOT NULL PRIMARY KEY,
		dcQuantity decimal(18, 3) NOT NULL
	)');
END;
GO

/* Cree un achat DRAFT et ses details dans une transaction unique. */
CREATE OR ALTER PROCEDURE dbo.usp_CreatePurchase
	@vcPurchaseNumber varchar(30),
	@supplierId int,
	@storeId int,
	@purchaseStatusId int,
	@dtOrderAt datetime2,
	@createdByUserId int,
	@details dbo.PurchaseDetailInputType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcPurchaseNumber)), '') IS NULL
			THROW 52300, 'vcPurchaseNumber est obligatoire.', 1;
		IF @supplierId IS NULL OR @supplierId <= 0 OR @storeId IS NULL OR @storeId <= 0
			THROW 52301, 'supplierId et storeId doivent etre positifs.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 52302, 'createdByUserId doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM @details)
			THROW 52303, 'Au moins une ligne de detail est requise.', 1;
		IF EXISTS (SELECT 1 FROM @details WHERE productId <= 0 OR dcOrderedQuantity <= 0 OR mUnitPurchasePrice < 0)
			THROW 52304, 'Chaque ligne exige un produit, une quantite positive et un prix positif ou nul.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (purchaseId int, vcPurchaseNumber varchar(30), mTotalAmount money);
		INSERT INTO dbo.tblPurchase (
			vcPurchaseNumber, supplierId, storeId, purchaseStatusId,
			dtOrderAt, dtReceivedAt, mTotalAmount, createdByUserId, receivedByUserId,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.purchaseId, INSERTED.vcPurchaseNumber, INSERTED.mTotalAmount
			INTO @created (purchaseId, vcPurchaseNumber, mTotalAmount)
		VALUES (
			LTRIM(RTRIM(@vcPurchaseNumber)), @supplierId, @storeId, @purchaseStatusId,
			COALESCE(@dtOrderAt, SYSUTCDATETIME()), NULL, 0, @createdByUserId, NULL,
			1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
		DECLARE @purchaseId int = (SELECT purchaseId FROM @created);
		INSERT INTO dbo.tblPurchaseDetail (
			purchaseId, productId, dcOrderedQuantity, dcReceivedQuantity,
			mUnitPurchasePrice, vcLotNumber, dtExpirationAt
		)
		SELECT @purchaseId, productId, dcOrderedQuantity, 0,
			mUnitPurchasePrice, vcLotNumber, dtExpirationAt
		FROM @details;
		COMMIT TRANSACTION;
		SELECT purchaseId, vcPurchaseNumber, mTotalAmount FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

/* Achats actifs d'une boutique. */
CREATE OR ALTER PROCEDURE dbo.usp_GetPurchasesByStore
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0 THROW 52301, 'storeId invalide.', 1;
		SELECT purchaseId, vcPurchaseNumber, supplierId, supplierName, storeId,
			purchaseStatusId, statusCode, vcPurchaseStatus, dtOrderAt, dtReceivedAt,
			mTotalAmount, createdByUserId, receivedByUserId
		FROM dbo.vw_PurchaseDetails
		WHERE storeId = @storeId AND btEnabled = 1
		ORDER BY dtOrderAt DESC;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetPurchaseDetails
	@purchaseId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @purchaseId IS NULL OR @purchaseId <= 0 THROW 52305, 'purchaseId invalide.', 1;
		SELECT * FROM dbo.vw_PurchaseLineDetails
		WHERE purchaseId = @purchaseId
		ORDER BY purchaseDetailId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Reception partielle/complete: details, lots, mouvements et total sont atomiques. */
CREATE OR ALTER PROCEDURE dbo.usp_ReceivePurchase
	@purchaseId int,
	@receivedByUserId int,
	@partialStatusId int,
	@receivedStatusId int,
	@purchaseReceiptMovementTypeId int,
	@receptions dbo.PurchaseReceptionInputType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @purchaseId IS NULL OR @purchaseId <= 0 THROW 52305, 'purchaseId invalide.', 1;
		IF @receivedByUserId IS NULL OR @receivedByUserId <= 0 THROW 52302, 'receivedByUserId invalide.', 1;
		IF NOT EXISTS (SELECT 1 FROM @receptions) THROW 52306, 'Aucune ligne de reception fournie.', 1;
		IF EXISTS (SELECT 1 FROM @receptions WHERE dcQuantity < 0) THROW 52307, 'La quantite recue ne peut pas etre negative.', 1;

		BEGIN TRANSACTION;
		DECLARE @storeId int, @purchaseNumber varchar(30), @statusCode varchar(50);
		SELECT @storeId=p.storeId, @purchaseNumber=p.vcPurchaseNumber, @statusCode=rs.vcCode
		FROM dbo.tblPurchase AS p WITH (UPDLOCK,HOLDLOCK)
		INNER JOIN dbo.tblRefPurchaseStatus AS rs ON rs.purchaseStatusId=p.purchaseStatusId
		WHERE p.purchaseId=@purchaseId;
		IF @storeId IS NULL THROW 52308, 'Achat introuvable.', 1;
		IF @statusCode IN ('RECEIVED','CANCELLED') THROW 52309, 'Cet achat ne peut plus etre receptionne.', 1;

		IF EXISTS (
			SELECT 1 FROM @receptions AS r
			LEFT JOIN dbo.tblPurchaseDetail AS d WITH (UPDLOCK,HOLDLOCK)
				ON d.purchaseDetailId=r.purchaseDetailId AND d.purchaseId=@purchaseId
			WHERE d.purchaseDetailId IS NULL
		)
			THROW 52310, 'Une ligne de reception ne correspond pas a cet achat.', 1;
		IF EXISTS (
			SELECT 1 FROM @receptions AS r
			INNER JOIN dbo.tblPurchaseDetail AS d ON d.purchaseDetailId=r.purchaseDetailId
			WHERE d.dcReceivedQuantity+r.dcQuantity>d.dcOrderedQuantity
		)
			THROW 52311, 'La quantite recue depasse la quantite commandee.', 1;

		DECLARE @movementTypeCode varchar(50);
		SELECT @movementTypeCode=vcCode FROM dbo.tblRefStockMovementType
		WHERE stockMovementTypeId=@purchaseReceiptMovementTypeId;
		IF @movementTypeCode IS NULL OR @movementTypeCode<>'PURCHASE_RECEIPT'
			THROW 52312, 'Type PURCHASE_RECEIPT introuvable ou invalide.', 1;

		-- CORRECTION : Suppression de stockLotId de @updated
		DECLARE @updated table (
			purchaseDetailId int,
			productId bigint,
			vcLotNumber varchar(30) NULL,
			dtExpirationAt date NULL,
			mUnitPurchasePrice money,
			dcQuantity decimal(18,3)
		);
		
		UPDATE d
		SET dcReceivedQuantity=d.dcReceivedQuantity+r.dcQuantity
		OUTPUT INSERTED.purchaseDetailId, INSERTED.productId, 
			INSERTED.vcLotNumber, INSERTED.dtExpirationAt, INSERTED.mUnitPurchasePrice,
			r.dcQuantity
		INTO @updated(purchaseDetailId,productId,vcLotNumber,dtExpirationAt,mUnitPurchasePrice,dcQuantity)
		FROM dbo.tblPurchaseDetail AS d
		INNER JOIN @receptions AS r ON r.purchaseDetailId=d.purchaseDetailId
		WHERE d.purchaseId=@purchaseId AND r.dcQuantity>0;

		-- CORRECTION : Suppression de stockLotId de @lots
		DECLARE @lots table(
			rowNumber int IDENTITY(1,1) PRIMARY KEY,
			productId bigint,
			vcLotNumber varchar(30) NULL,
			dtExpirationAt date NULL,
			mUnitPurchasePrice money,
			dcQuantity decimal(18,3)
		);
		
		INSERT INTO @lots(productId,vcLotNumber,dtExpirationAt,mUnitPurchasePrice,dcQuantity)
		SELECT productId,vcLotNumber,dtExpirationAt,mUnitPurchasePrice,dcQuantity FROM @updated;
		
		DECLARE @i int=1,@n int=(SELECT COUNT(*) FROM @lots),@productId bigint,@stockLotId int,@lotNumber varchar(30),@expiry date,@unitPrice money,@qty decimal(18,3);
		
		WHILE @i<=@n
		BEGIN
			-- CORRECTION : Initialisation à NULL et suppression de la récupération depuis @lots
			SET @stockLotId = NULL;
			
			SELECT @productId=productId,@lotNumber=vcLotNumber,@expiry=dtExpirationAt,@unitPrice=mUnitPurchasePrice,@qty=dcQuantity 
			FROM @lots WHERE rowNumber=@i;
			
			IF @lotNumber IS NOT NULL
			BEGIN
				SELECT @stockLotId=stockLotId FROM dbo.tblStockLot WITH (UPDLOCK,HOLDLOCK)
				WHERE storeId=@storeId AND productId=@productId AND vcLotNumber=@lotNumber;
				
				IF @stockLotId IS NULL
				BEGIN
					DECLARE @newLot table(stockLotId int);
					INSERT INTO dbo.tblStockLot(storeId,productId,vcLotNumber,dtManufacturingAt,dtExpirationAt,dcInitialQuantity,dcRemainingQuantity,mUnitPurchasePrice,dtReceivedAt,btEnabled)
					OUTPUT INSERTED.stockLotId INTO @newLot(stockLotId)
					VALUES(@storeId,@productId,@lotNumber,NULL,@expiry,@qty,@qty,@unitPrice,SYSUTCDATETIME(),1);
					SELECT @stockLotId=stockLotId FROM @newLot;
				END
				ELSE
					UPDATE dbo.tblStockLot SET dcInitialQuantity=dcInitialQuantity+@qty,dcRemainingQuantity=dcRemainingQuantity+@qty WHERE stockLotId=@stockLotId;
			END;

			DECLARE @stockBefore decimal(18,3),@stockAfter decimal(18,3);
			MERGE dbo.tblStoreStock WITH (HOLDLOCK) AS target
			USING(SELECT @storeId AS storeId,@productId AS productId) AS source
			ON target.storeId=source.storeId AND target.productId=source.productId
			WHEN NOT MATCHED THEN INSERT(storeId,productId,dcAvailableQuantity,dcReservedQuantity,dtUpdatedAt) VALUES(source.storeId,source.productId,0,0,SYSUTCDATETIME());
			SELECT @stockBefore=dcAvailableQuantity FROM dbo.tblStoreStock WITH(UPDLOCK,HOLDLOCK) WHERE storeId=@storeId AND productId=@productId;
			SET @stockAfter=@stockBefore+@qty;
			INSERT INTO dbo.tblStockMovement(storeId,productId,stockLotId,stockMovementTypeId,dcQuantity,dcStockBefore,dcStockAfter,vcReferenceType,referenceId,operatedByUserId,dtMovementAt,vcComment)
			VALUES(@storeId,@productId,@stockLotId,@purchaseReceiptMovementTypeId,@qty,@stockBefore,@stockAfter,'PURCHASE',@purchaseId,@receivedByUserId,SYSUTCDATETIME(),CONCAT('Reception achat ',@purchaseNumber));
			UPDATE dbo.tblStoreStock SET dcAvailableQuantity=@stockAfter,dtUpdatedAt=SYSUTCDATETIME() WHERE storeId=@storeId AND productId=@productId;
			SET @i+=1;
		END;

		DECLARE @totalLines int,@completedLines int,@targetStatusId int,@targetCode varchar(20);
		SELECT @totalLines=COUNT(*),@completedLines=SUM(CASE WHEN dcReceivedQuantity>=dcOrderedQuantity THEN 1 ELSE 0 END)
		FROM dbo.tblPurchaseDetail WHERE purchaseId=@purchaseId;
		SET @targetCode=CASE WHEN @totalLines>0 AND @completedLines=@totalLines THEN 'RECEIVED' ELSE 'PARTIAL' END;
		SET @targetStatusId=CASE WHEN @targetCode='RECEIVED' THEN @receivedStatusId ELSE @partialStatusId END;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefPurchaseStatus WHERE purchaseStatusId=@targetStatusId AND vcCode=@targetCode)
			THROW 52313, 'Statut final de reception absent ou incoherent.', 1;
		UPDATE dbo.tblPurchase
		SET purchaseStatusId=@targetStatusId,
			receivedByUserId=@receivedByUserId,
			dtReceivedAt=CASE WHEN @targetCode='RECEIVED' THEN SYSUTCDATETIME() ELSE dtReceivedAt END,
			mTotalAmount=(SELECT COALESCE(SUM(dcReceivedQuantity*mUnitPurchasePrice),0) FROM dbo.tblPurchaseDetail WHERE purchaseId=@purchaseId),
			dtLastUpdated=SYSUTCDATETIME()
		WHERE purchaseId=@purchaseId;
		COMMIT TRANSACTION;
		SELECT @purchaseId AS purchaseId,@targetCode AS status;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

/* Annule uniquement un achat DRAFT ou ORDERED. */
CREATE OR ALTER PROCEDURE dbo.usp_CancelPurchase
	@purchaseId int,
	@cancelledStatusId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @purchaseId IS NULL OR @purchaseId<=0 THROW 52305, 'purchaseId invalide.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefPurchaseStatus WHERE purchaseStatusId=@cancelledStatusId AND vcCode='CANCELLED')
			THROW 52314, 'Statut CANCELLED absent ou invalide.', 1;
		UPDATE dbo.tblPurchase
		SET purchaseStatusId=@cancelledStatusId,dtLastUpdated=SYSUTCDATETIME()
		WHERE purchaseId=@purchaseId AND purchaseStatusId IN(
			SELECT purchaseStatusId FROM dbo.tblRefPurchaseStatus WHERE vcCode IN('DRAFT','ORDERED')
		);
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO