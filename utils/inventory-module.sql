/*
  Module inventaires - SQL Server.
  Prerequis: dbo.tblInventory, dbo.tblInventoryDetail,
             dbo.tblRefInventoryStatus, dbo.tblStore, dbo.tblProduct.
  Les types table fournissent les details et comptages en un appel SQL.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Entete d'inventaire enrichie du statut et de la boutique. */
CREATE OR ALTER VIEW dbo.vw_InventoryDetails
AS
	SELECT
		i.inventoryId,
		i.vcInventoryNumber,
		i.storeId,
		s.companyId,
		s.vcStoreName,
		i.inventoryStatusId,
		rs.vcCode AS statusCode,
		rs.vcInventoryStatus,
		i.dtStartedAt,
		i.dtEndedAt,
		i.createdByUserId,
		i.approvedByUserId
	FROM dbo.tblInventory AS i
	INNER JOIN dbo.tblRefInventoryStatus AS rs ON rs.inventoryStatusId = i.inventoryStatusId
	INNER JOIN dbo.tblStore AS s ON s.storeId = i.storeId;
GO

/* Details avec difference calculee par la table et informations produit. */
CREATE OR ALTER VIEW dbo.vw_InventoryLineDetails
AS
	SELECT
		d.inventoryDetailId,
		d.inventoryId,
		d.productId,
		p.vcProductCode,
		p.vcProductName,
		d.dcTheoreticalQuantity,
		d.dcPhysicalQuantity,
		d.DifferenceQuantity,
		d.vcComment
	FROM dbo.tblInventoryDetail AS d
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO

IF TYPE_ID(N'dbo.InventoryDetailCreateType') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.InventoryDetailCreateType AS TABLE (
		productId bigint NOT NULL,
		dcTheoreticalQuantity decimal(18, 3) NOT NULL,
		dcPhysicalQuantity decimal(18, 3) NOT NULL,
		vcComment nvarchar(150) NULL
	)');
END;
GO

IF TYPE_ID(N'dbo.InventoryCountUpdateType') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.InventoryCountUpdateType AS TABLE (
		inventoryDetailId int NOT NULL PRIMARY KEY,
		dcPhysicalQuantity decimal(18, 3) NOT NULL
	)');
END;
GO

/* Ouvre un inventaire OPEN et insere ses lignes de comptage en une transaction. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateInventory
	@vcInventoryNumber varchar(30),
	@storeId int,
	@inventoryStatusId int,
	@createdByUserId int,
	@details dbo.InventoryDetailCreateType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcInventoryNumber)), '') IS NULL
			THROW 52700, 'vcInventoryNumber est obligatoire.', 1;
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52701, 'storeId est obligatoire et doit etre positif.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 52702, 'createdByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefInventoryStatus WHERE inventoryStatusId=@inventoryStatusId AND vcCode='OPEN')
			THROW 52703, 'Le statut initial doit etre OPEN.', 1;
		IF EXISTS (SELECT 1 FROM @details WHERE productId<=0 OR dcTheoreticalQuantity<0 OR dcPhysicalQuantity<0)
			THROW 52704, 'Les produits doivent etre valides et les quantites >= 0.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table(inventoryId int,vcInventoryNumber varchar(30));
		INSERT INTO dbo.tblInventory(
			vcInventoryNumber,storeId,inventoryStatusId,dtStartedAt,dtEndedAt,createdByUserId,approvedByUserId
		)
		OUTPUT INSERTED.inventoryId,INSERTED.vcInventoryNumber INTO @created(inventoryId,vcInventoryNumber)
		VALUES(LTRIM(RTRIM(@vcInventoryNumber)),@storeId,@inventoryStatusId,SYSUTCDATETIME(),NULL,@createdByUserId,NULL);
		DECLARE @inventoryId int=(SELECT inventoryId FROM @created);
		INSERT INTO dbo.tblInventoryDetail(inventoryId,productId,dcTheoreticalQuantity,dcPhysicalQuantity,vcComment)
		SELECT @inventoryId,productId,dcTheoreticalQuantity,dcPhysicalQuantity,vcComment FROM @details;
		COMMIT TRANSACTION;
		SELECT inventoryId,vcInventoryNumber FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetInventoryHeader
	@inventoryId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @inventoryId IS NULL OR @inventoryId<=0 THROW 52705, 'inventoryId invalide.', 1;
		SELECT * FROM dbo.vw_InventoryDetails WHERE inventoryId=@inventoryId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetInventoryDetails
	@inventoryId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @inventoryId IS NULL OR @inventoryId<=0 THROW 52705, 'inventoryId invalide.', 1;
		SELECT * FROM dbo.vw_InventoryLineDetails
		WHERE inventoryId=@inventoryId
		ORDER BY inventoryDetailId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Change d'etat; date de fin uniquement pour VALIDATED ou CANCELLED. */
CREATE OR ALTER PROCEDURE dbo.sp_SetInventoryStatus
	@inventoryId int,
	@inventoryStatusId int,
	@approvedByUserId int=NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @inventoryId IS NULL OR @inventoryId<=0 THROW 52705, 'inventoryId invalide.', 1;
		IF NOT EXISTS(SELECT 1 FROM dbo.tblRefInventoryStatus WHERE inventoryStatusId=@inventoryStatusId)
			THROW 52706, 'Statut d inventaire introuvable.', 1;
		UPDATE i
		SET inventoryStatusId=@inventoryStatusId,
			approvedByUserId=COALESCE(@approvedByUserId,i.approvedByUserId),
			dtEndedAt=CASE WHEN rs.vcCode IN ('VALIDATED','CANCELLED') THEN SYSUTCDATETIME() ELSE i.dtEndedAt END
		OUTPUT INSERTED.inventoryId,INSERTED.inventoryStatusId
		FROM dbo.tblInventory AS i
		INNER JOIN dbo.tblRefInventoryStatus AS rs ON rs.inventoryStatusId=@inventoryStatusId
		WHERE i.inventoryId=@inventoryId;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO

/* Met a jour les comptages physiques des lignes appartenant a l'inventaire. */
CREATE OR ALTER PROCEDURE dbo.sp_UpdateInventoryCounts
	@inventoryId int,
	@counts dbo.InventoryCountUpdateType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @inventoryId IS NULL OR @inventoryId<=0 THROW 52705, 'inventoryId invalide.', 1;
		IF EXISTS(SELECT 1 FROM @counts WHERE dcPhysicalQuantity<0)
			THROW 52704, 'La quantite physique doit etre >= 0.', 1;
		IF EXISTS(
			SELECT 1 FROM @counts AS c
			LEFT JOIN dbo.tblInventoryDetail AS d
				ON d.inventoryDetailId=c.inventoryDetailId AND d.inventoryId=@inventoryId
			WHERE d.inventoryDetailId IS NULL
		)
			THROW 52707, 'Ligne de comptage absente de cet inventaire.', 1;
		UPDATE d
		SET dcPhysicalQuantity=c.dcPhysicalQuantity
		FROM dbo.tblInventoryDetail AS d
		INNER JOIN @counts AS c ON c.inventoryDetailId=d.inventoryDetailId
		WHERE d.inventoryId=@inventoryId;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY BEGIN CATCH THROW; END CATCH;
END;
GO
