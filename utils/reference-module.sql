USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Liste blanche des references et indicateur de presence de btEnabled. */
CREATE OR ALTER VIEW dbo.vw_ReferenceTableCatalog
AS
	SELECT
		v.refKey,
		v.tableName,
		CONVERT(bit, CASE WHEN c.COLUMN_NAME IS NULL THEN 0 ELSE 1 END) AS hasEnabledColumn
	FROM (VALUES
		('role', 'tblRefRole'),
		('gender', 'tblRefGender'),
		('customerType', 'tblRefCustomerType'),
		('storeType', 'tblRefStoreType'),
		('paymentMethod', 'tblRefPaymentMethod'),
		('paymentStatus', 'tblRefPaymentStatus'),
		('saleStatus', 'tblRefSaleStatus'),
		('discountType', 'tblRefDiscountType'),
		('cashSessionStatus', 'tblRefCashSessionStatus'),
		('stockMovementType', 'tblRefStockMovementType'),
		('transferStatus', 'tblRefTransferStatus'),
		('thirdPartyMovementType', 'tblRefThirdPartyMovementType'),
		('adjustmentReason', 'tblRefAdjustmentReason'),
		('adjustmentStatus', 'tblRefAdjustmentStatus'),
		('cashReportStatus', 'tblRefCashReportStatus'),
		('purchaseStatus', 'tblRefPurchaseStatus'),
		('inventoryStatus', 'tblRefInventoryStatus'),
		('registrationRequestStatus', 'tblRefRegistrationRequestStatus'),
		('unitOfMeasure', 'tblRefUnitOfMeasure'),
		('treasuryAccountType', 'tblRefTreasuryAccountType'),
		('treasuryMovementType', 'tblRefTreasuryMovementType'),
		('notificationType', 'tblRefNotificationType')
	) AS v(refKey, tableName)
	LEFT JOIN INFORMATION_SCHEMA.COLUMNS AS c
		ON c.TABLE_SCHEMA = 'dbo'
	   AND c.TABLE_NAME = v.tableName
	   AND c.COLUMN_NAME = 'btEnabled';
GO

/* Retourne toutes les lignes d'une cle de reference; filtre btEnabled si disponible. */
CREATE OR ALTER PROCEDURE dbo.usp_GetAllReferences
	@refKey varchar(50)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		DECLARE @tableName sysname;
		DECLARE @hasEnabled bit;
		SELECT @tableName = tableName, @hasEnabled = hasEnabledColumn
		FROM dbo.vw_ReferenceTableCatalog
		WHERE refKey = @refKey;
		IF @tableName IS NULL
			THROW 52200, 'Cle de reference inconnue.', 1;

		DECLARE @statement nvarchar(max) = N'SELECT * FROM dbo.' + QUOTENAME(@tableName);
		IF @hasEnabled = 1 SET @statement += N' WHERE btEnabled = 1';
		EXEC sys.sp_executesql @statement;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Retourne la premiere ligne correspondant exactement a vcCode, meme inactive. */
CREATE OR ALTER PROCEDURE dbo.usp_GetReferenceByCode
	@refKey varchar(50),
	@vcCode varchar(50)
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcCode)), '') IS NULL
			RETURN;

		DECLARE @tableName sysname;
		SELECT @tableName = tableName
		FROM dbo.vw_ReferenceTableCatalog
		WHERE refKey = @refKey;
		IF @tableName IS NULL
			THROW 52200, 'Cle de reference inconnue.', 1;

		-- CORRECTION ICI : On stocke le code nettoyé dans une variable d'abord
		DECLARE @cleanCode varchar(50) = LTRIM(RTRIM(@vcCode));
		
		DECLARE @statement nvarchar(max) =
			N'SELECT TOP (1) * FROM dbo.' + QUOTENAME(@tableName) + N' WHERE vcCode = @code;';
		
		-- On passe la variable propre au lieu de la fonction
		EXEC sys.sp_executesql @statement, N'@code varchar(50)', @code = @cleanCode;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO