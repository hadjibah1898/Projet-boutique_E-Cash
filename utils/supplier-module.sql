/*
  Module fournisseurs - SQL Server.
  Prerequis: dbo.tblSupplier, dbo.tblSupplierProduct, dbo.tblProduct,
             dbo.tblCompany.
  Correspond aux operations de supplierDAL.js; les parametres restent
  compatibles avec les requetes inline actuelles du DAL.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Fournisseurs avec le nom d'affichage et les informations de l'entreprise. */
CREATE OR ALTER VIEW dbo.vw_SupplierDetails
AS
	SELECT
		s.supplierId,
		s.companyId,
		c.vcCompanyCode,
		c.vcCompanyName,
		s.vcSupplierCode,
		s.vcBusinessName,
		s.vcLastName,
		s.vcFirstName,
		COALESCE(s.vcBusinessName, s.vcLastName, s.vcFirstName) AS supplierDisplayName,
		s.vcPhoneNumber,
		s.vcEmail,
		s.vcAddress,
		s.vcCity,
		s.createdByUserId,
		s.btEnabled,
		s.dtCreatedAt,
		s.dtLastUpdated
	FROM dbo.tblSupplier AS s
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = s.companyId;
GO

/* Association fournisseur-produit avec l'identite complete du produit. */
CREATE OR ALTER VIEW dbo.vw_SupplierProductDetails
AS
	SELECT
		sp.supplierProductId,
		sp.supplierId,
		s.companyId,
		sp.productId,
		p.vcProductCode,
		p.vcProductName,
		sp.vcSupplierReference,
		sp.mReferencePurchasePrice,
		sp.deliveryLeadTimeDays,
		sp.IsPreferred,
		sp.btEnabled
	FROM dbo.tblSupplierProduct AS sp
	INNER JOIN dbo.tblSupplier AS s ON s.supplierId = sp.supplierId
	INNER JOIN dbo.tblProduct AS p ON p.productId = sp.productId;
GO

/* Cree un fournisseur. */
CREATE OR ALTER PROCEDURE dbo.usp_CreateSupplier
	@companyId int,
	@vcSupplierCode varchar(20),
	@createdByUserId int,
	@vcBusinessName varchar(50) = NULL,
	@vcLastName varchar(50) = NULL,
	@vcFirstName varchar(50) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@vcEmail varchar(100) = NULL,
	@vcAddress varchar(150) = NULL,
	@vcCity varchar(50) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51500, 'companyId est obligatoire et doit etre positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcSupplierCode)), '') IS NULL
			THROW 51501, 'vcSupplierCode est obligatoire.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 51502, 'createdByUserId est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcBusinessName)), '') IS NULL
		   AND NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL
		   AND NULLIF(LTRIM(RTRIM(@vcFirstName)), '') IS NULL
			THROW 51503, 'Un nom commercial, un nom ou un prenom est obligatoire.', 1;

		INSERT INTO dbo.tblSupplier (
			companyId, vcSupplierCode, vcBusinessName, vcLastName, vcFirstName,
			vcPhoneNumber, vcEmail, vcAddress, vcCity, createdByUserId,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT
			INSERTED.supplierId, INSERTED.companyId, INSERTED.vcSupplierCode,
			INSERTED.vcBusinessName, INSERTED.vcLastName, INSERTED.vcFirstName,
			INSERTED.vcPhoneNumber, INSERTED.vcEmail, INSERTED.btEnabled
		VALUES (
			@companyId, LTRIM(RTRIM(@vcSupplierCode)), @vcBusinessName,
			@vcLastName, @vcFirstName, @vcPhoneNumber, @vcEmail,
			@vcAddress, @vcCity, @createdByUserId, 1,
			SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Liste les fournisseurs actifs d'une entreprise. */
CREATE OR ALTER PROCEDURE dbo.sp_GetSuppliersByCompany
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51500, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			supplierId, companyId, vcSupplierCode, vcBusinessName,
			vcLastName, vcFirstName, vcPhoneNumber, vcEmail,
			vcAddress, vcCity, btEnabled
		FROM dbo.vw_SupplierDetails
		WHERE companyId = @companyId AND btEnabled = 1
		ORDER BY supplierDisplayName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Fournisseur par identifiant, actif ou inactif comme le DAL courant. */
CREATE OR ALTER PROCEDURE dbo.sp_GetSupplierById
	@supplierId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;
		SELECT *
		FROM dbo.tblSupplier
		WHERE supplierId = @supplierId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Mise a jour partielle suivant le comportement COALESCE actuel du DAL. */
CREATE OR ALTER PROCEDURE dbo.sp_UpdateSupplier
	@supplierId int,
	@vcBusinessName varchar(50) = NULL,
	@vcLastName varchar(50) = NULL,
	@vcFirstName varchar(50) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@vcEmail varchar(100) = NULL,
	@vcAddress varchar(150) = NULL,
	@vcCity varchar(50) = NULL,
	@btEnabled bit = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;

		UPDATE dbo.tblSupplier
		SET vcBusinessName = COALESCE(@vcBusinessName, vcBusinessName),
			vcLastName = COALESCE(@vcLastName, vcLastName),
			vcFirstName = COALESCE(@vcFirstName, vcFirstName),
			vcPhoneNumber = COALESCE(@vcPhoneNumber, vcPhoneNumber),
			vcEmail = COALESCE(@vcEmail, vcEmail),
			vcAddress = COALESCE(@vcAddress, vcAddress),
			vcCity = COALESCE(@vcCity, vcCity),
			btEnabled = COALESCE(@btEnabled, btEnabled),
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.supplierId, INSERTED.vcSupplierCode, INSERTED.btEnabled
		WHERE supplierId = @supplierId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Desactivation logique du fournisseur. */
CREATE OR ALTER PROCEDURE dbo.sp_SoftDeleteSupplier
	@supplierId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;
		UPDATE dbo.tblSupplier
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE supplierId = @supplierId;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Associe un produit a un fournisseur. */
CREATE OR ALTER PROCEDURE dbo.sp_AddSupplierProduct
	@supplierId int,
	@productId bigint,
	@vcSupplierReference varchar(50) = NULL,
	@mReferencePurchasePrice money = NULL,
	@deliveryLeadTimeDays int = NULL,
	@isPreferred bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;
		IF @productId IS NULL OR @productId <= 0
			THROW 51505, 'productId est obligatoire et doit etre positif.', 1;

		INSERT INTO dbo.tblSupplierProduct (
			supplierId, productId, vcSupplierReference, mReferencePurchasePrice,
			deliveryLeadTimeDays, IsPreferred, btEnabled
		)
		OUTPUT INSERTED.supplierProductId, INSERTED.supplierId, INSERTED.productId
		VALUES (
			@supplierId, @productId, @vcSupplierReference, @mReferencePurchasePrice,
			@deliveryLeadTimeDays, @isPreferred, 1
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Produits rattaches a un fournisseur, actifs ou inactifs comme le DAL courant. */
CREATE OR ALTER PROCEDURE dbo.sp_GetSupplierProducts
	@supplierId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @supplierId IS NULL OR @supplierId <= 0
			THROW 51504, 'supplierId est obligatoire et doit etre positif.', 1;
		SELECT
			supplierProductId, productId, vcProductCode, vcProductName,
			vcSupplierReference, mReferencePurchasePrice,
			deliveryLeadTimeDays, IsPreferred, btEnabled
		FROM dbo.vw_SupplierProductDetails
		WHERE supplierId = @supplierId
		ORDER BY vcProductName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
