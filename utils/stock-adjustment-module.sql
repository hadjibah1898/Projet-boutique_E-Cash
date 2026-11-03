USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Ajustements enrichis du motif, statut et boutique. */
CREATE OR ALTER VIEW dbo.vw_StockAdjustmentDetails
AS
	SELECT
		a.stockAdjustmentId,
		a.storeId,
		st.companyId,
		st.vcStoreName,
		a.adjustmentReasonId,
		r.vcCode AS reasonCode,
		r.vcAdjustmentReason,
		a.adjustmentStatusId,
		s.vcCode AS statusCode,
		s.vcAdjustmentStatus,
		a.vcJustification,
		a.vcProofImageUrl,
		a.createdByUserId,
		a.approvedByUserId,
		a.dtcreatedAt,
		a.dtApprovedAt,
		a.vcApprovalComment
	FROM dbo.tblStockAdjustment AS a
	INNER JOIN dbo.tblRefAdjustmentReason AS r ON r.adjustmentReasonId = a.adjustmentReasonId
	INNER JOIN dbo.tblRefAdjustmentStatus AS s ON s.adjustmentStatusId = a.adjustmentStatusId
	INNER JOIN dbo.tblStore AS st ON st.storeId = a.storeId;
GO

/* Lignes d'ajustement avec informations produit. */
CREATE OR ALTER VIEW dbo.vw_StockAdjustmentLineDetails
AS
	SELECT
		d.stockAdjustmentDetailId,
		d.stockAdjustmentId,
		d.productId,
		p.vcProductCode,
		p.vcProductName,
		d.stockLotId,
		d.dcQuantityBefore,
		d.dcAdjustmentQuantity,
		d.dcQuantityAfter
	FROM dbo.tblStockAdjustmentDetail AS d
	INNER JOIN dbo.tblProduct AS p ON p.productId = d.productId;
GO

/* Type table des lignes a inserer lors de la creation d'un ajustement. */
IF TYPE_ID(N'dbo.StockAdjustmentDetailCreateType') IS NULL
BEGIN
	EXEC(N'CREATE TYPE dbo.StockAdjustmentDetailCreateType AS TABLE (
		productId bigint NOT NULL,
		stockLotId int NULL,
		dcQuantityBefore decimal(18, 3) NOT NULL,
		dcAdjustmentQuantity decimal(18, 3) NOT NULL
	)');
END;
GO

/* Cree un ajustement et ses lignes dans une transaction unique. */
CREATE OR ALTER PROCEDURE dbo.usp_CreateStockAdjustment
	@storeId int,
	@adjustmentReasonId int,
	@adjustmentStatusId int,
	@vcJustification varchar(150),
	@vcProofImageUrl varchar(255) = NULL,
	@createdByUserId int,
	@details dbo.StockAdjustmentDetailCreateType READONLY
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52000, 'storeId est obligatoire et doit etre positif.', 1;
		IF @adjustmentReasonId IS NULL OR @adjustmentReasonId <= 0
			THROW 52001, 'adjustmentReasonId est obligatoire.', 1;
		IF @adjustmentStatusId IS NULL OR @adjustmentStatusId <= 0
			THROW 52002, 'adjustmentStatusId est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcJustification)), '') IS NULL
			THROW 52003, 'vcJustification est obligatoire.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 52004, 'createdByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM @details)
			THROW 52005, 'Au moins une ligne d ajustement est requise.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefAdjustmentReason WHERE adjustmentReasonId = @adjustmentReasonId)
			THROW 52001, 'Motif d ajustement introuvable.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefAdjustmentStatus WHERE adjustmentStatusId = @adjustmentStatusId)
			THROW 52002, 'Statut d ajustement introuvable.', 1;
		IF EXISTS (
			SELECT 1 FROM @details
			WHERE productId <= 0 OR dcQuantityBefore < 0
			   OR dcQuantityBefore + dcAdjustmentQuantity < 0
		)
			THROW 52006, 'Chaque ligne doit conserver before >= 0 et after = before + delta >= 0.', 1;

		BEGIN TRANSACTION;
		DECLARE @created table (stockAdjustmentId int);
		INSERT INTO dbo.tblStockAdjustment (
			storeId, adjustmentReasonId, adjustmentStatusId, vcJustification,
			vcProofImageUrl, createdByUserId, approvedByUserId,
			dtcreatedAt, dtApprovedAt, vcApprovalComment
		)
		OUTPUT INSERTED.stockAdjustmentId INTO @created (stockAdjustmentId)
		VALUES (
			@storeId, @adjustmentReasonId, @adjustmentStatusId, LTRIM(RTRIM(@vcJustification)),
			@vcProofImageUrl, @createdByUserId, NULL,
			SYSUTCDATETIME(), NULL, NULL
		);

		DECLARE @stockAdjustmentId int = (SELECT stockAdjustmentId FROM @created);
		INSERT INTO dbo.tblStockAdjustmentDetail (
			stockAdjustmentId, productId, stockLotId,
			dcQuantityBefore, dcAdjustmentQuantity, dcQuantityAfter
		)
		SELECT
			@stockAdjustmentId, productId, stockLotId,
			dcQuantityBefore, dcAdjustmentQuantity,
			dcQuantityBefore + dcAdjustmentQuantity
		FROM @details;
		COMMIT TRANSACTION;
		SELECT stockAdjustmentId FROM @created;
	END TRY
	BEGIN CATCH
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

/* Entete d'un ajustement, avec motif, statut et boutique. */
CREATE OR ALTER PROCEDURE dbo.usp_GetStockAdjustmentHeader
	@stockAdjustmentId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockAdjustmentId IS NULL OR @stockAdjustmentId <= 0
			THROW 52007, 'stockAdjustmentId est obligatoire et doit etre positif.', 1;
		SELECT * FROM dbo.vw_StockAdjustmentDetails
		WHERE stockAdjustmentId = @stockAdjustmentId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Details d'un ajustement. */
CREATE OR ALTER PROCEDURE dbo.usp_GetStockAdjustmentDetails
	@stockAdjustmentId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockAdjustmentId IS NULL OR @stockAdjustmentId <= 0
			THROW 52007, 'stockAdjustmentId est obligatoire et doit etre positif.', 1;
		SELECT * FROM dbo.vw_StockAdjustmentLineDetails
		WHERE stockAdjustmentId = @stockAdjustmentId
		ORDER BY stockAdjustmentDetailId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Passe un ajustement PENDING vers APPROVED ou REJECTED. */
CREATE OR ALTER PROCEDURE dbo.usp_DecideStockAdjustment
	@stockAdjustmentId int,
	@adjustmentStatusId int,
	@approvedByUserId int,
	@vcApprovalComment varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @stockAdjustmentId IS NULL OR @stockAdjustmentId <= 0
			THROW 52007, 'stockAdjustmentId est obligatoire et doit etre positif.', 1;
		IF @approvedByUserId IS NULL OR @approvedByUserId <= 0
			THROW 52004, 'approvedByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblRefAdjustmentStatus
			WHERE adjustmentStatusId = @adjustmentStatusId AND vcCode IN ('APPROVED', 'REJECTED')
		)
			THROW 52008, 'La decision doit etre APPROVED ou REJECTED.', 1;

		UPDATE a
		SET adjustmentStatusId = @adjustmentStatusId,
			approvedByUserId = @approvedByUserId,
			dtApprovedAt = SYSUTCDATETIME(),
			vcApprovalComment = @vcApprovalComment
		OUTPUT INSERTED.stockAdjustmentId, INSERTED.adjustmentStatusId
		FROM dbo.tblStockAdjustment AS a
		WHERE a.stockAdjustmentId = @stockAdjustmentId
		  AND a.adjustmentStatusId = (
			SELECT adjustmentStatusId FROM dbo.tblRefAdjustmentStatus WHERE vcCode = 'PENDING'
		  );
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Ajustements d'une boutique, avec filtre de statut facultatif. */
CREATE OR ALTER PROCEDURE dbo.usp_GetStockAdjustmentsByStore
	@storeId int,
	@statusCode varchar(20) = NULL,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 52000, 'storeId est obligatoire et doit etre positif.', 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 1000 SET @limit = 100;

		SELECT TOP (@limit) a.*
		FROM dbo.vw_StockAdjustmentDetails AS a
		WHERE a.storeId = @storeId AND (@statusCode IS NULL OR a.statusCode = @statusCode)
		ORDER BY a.dtcreatedAt DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO