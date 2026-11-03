/*
  Module entreprises - SQL Server.
  Prerequis: dbo.tblCompany, dbo.tblUserCompany, dbo.tblRefRole.
  Les signatures correspondent aux requetes actuelles de companyDAL.js.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Informations entreprise sans filtrage, pour les lectures par ID. */
CREATE OR ALTER VIEW dbo.vw_CompanyDetails
AS
	SELECT
		companyId,
		vcCompanyCode,
		vcCompanyName,
		vcRccm,
		vcPhoneNumber,
		vcEmail,
		vcAddress,
		vcCity,
		vcLogoUrl,
		btEnabled,
		dtCreatedAt,
		dtLastUpdated
	FROM dbo.tblCompany;
GO

/* Affectations entreprise avec role, dont l'affectation globale SUPER_ADMIN (companyId NULL). */
CREATE OR ALTER VIEW dbo.vw_UserCompanyAccess
AS
	SELECT
		uc.userId,
		uc.companyId,
		c.vcCompanyCode,
		c.vcCompanyName,
		c.vcCity,
		c.btEnabled AS companyEnabled,
		uc.roleId,
		r.vcCode AS roleCode,
		r.vcRole AS roleName,
		uc.btEnabled,
		uc.dtAssignedAt,
		uc.dtEndedAt
	FROM dbo.tblUserCompany AS uc
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId
	INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId;
GO

/* Cree une entreprise active. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateCompany
	@vcCompanyCode varchar(20),
	@vcCompanyName varchar(50),
	@vcRccm varchar(50) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@vcEmail nvarchar(100) = NULL,
	@vcAddress varchar(150) = NULL,
	@vcCity varchar(50) = NULL,
	@vcLogoUrl varchar(255) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcCompanyCode)), '') IS NULL
			THROW 53000, 'vcCompanyCode est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcCompanyName)), '') IS NULL
			THROW 53001, 'vcCompanyName est obligatoire.', 1;

		INSERT INTO dbo.tblCompany (
			vcCompanyCode, vcCompanyName, vcRccm, vcPhoneNumber, vcEmail,
			vcAddress, vcCity, vcLogoUrl, btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT
			INSERTED.companyId, INSERTED.vcCompanyCode, INSERTED.vcCompanyName,
			INSERTED.vcRccm, INSERTED.vcPhoneNumber, INSERTED.vcEmail,
			INSERTED.vcAddress, INSERTED.vcCity, INSERTED.vcLogoUrl,
			INSERTED.btEnabled, INSERTED.dtCreatedAt
		VALUES (
			LTRIM(RTRIM(@vcCompanyCode)), LTRIM(RTRIM(@vcCompanyName)),
			@vcRccm, @vcPhoneNumber, @vcEmail, @vcAddress, @vcCity,
			@vcLogoUrl, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Liste toutes les entreprises actives. */
CREATE OR ALTER PROCEDURE dbo.sp_GetAllCompanies
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		SELECT companyId, vcCompanyCode, vcCompanyName, vcRccm, vcPhoneNumber,
			vcEmail, vcAddress, vcCity, vcLogoUrl, btEnabled, dtCreatedAt
		FROM dbo.vw_CompanyDetails
		WHERE btEnabled = 1
		ORDER BY vcCompanyName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Entreprises accessibles a un utilisateur; conserve l'affectation globale du SUPER_ADMIN. */
CREATE OR ALTER PROCEDURE dbo.sp_GetCompaniesByUserId
	@userId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @userId IS NULL OR @userId <= 0
			THROW 53002, 'userId est obligatoire et doit etre positif.', 1;
		SELECT companyId, vcCompanyCode, vcCompanyName, vcCity,
			roleId, roleCode, roleName
		FROM dbo.vw_UserCompanyAccess
		WHERE userId = @userId AND btEnabled = 1
		  AND (companyEnabled = 1 OR companyId IS NULL)
		ORDER BY vcCompanyName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Entreprise par identifiant, active ou non. */
CREATE OR ALTER PROCEDURE dbo.sp_GetCompanyById
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 53003, 'companyId est obligatoire et doit etre positif.', 1;
		SELECT * FROM dbo.vw_CompanyDetails WHERE companyId = @companyId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Mise a jour partielle identique au comportement COALESCE du DAL. */
CREATE OR ALTER PROCEDURE dbo.sp_UpdateCompany
	@companyId int,
	@vcCompanyName varchar(50) = NULL,
	@vcRccm varchar(50) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@vcEmail nvarchar(100) = NULL,
	@vcAddress varchar(150) = NULL,
	@vcCity varchar(50) = NULL,
	@vcLogoUrl varchar(255) = NULL,
	@btEnabled bit = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 53003, 'companyId est obligatoire et doit etre positif.', 1;
		UPDATE dbo.tblCompany
		SET vcCompanyName = COALESCE(@vcCompanyName, vcCompanyName),
			vcRccm = COALESCE(@vcRccm, vcRccm),
			vcPhoneNumber = COALESCE(@vcPhoneNumber, vcPhoneNumber),
			vcEmail = COALESCE(@vcEmail, vcEmail),
			vcAddress = COALESCE(@vcAddress, vcAddress),
			vcCity = COALESCE(@vcCity, vcCity),
			vcLogoUrl = COALESCE(@vcLogoUrl, vcLogoUrl),
			btEnabled = COALESCE(@btEnabled, btEnabled),
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.companyId, INSERTED.vcCompanyCode, INSERTED.vcCompanyName, INSERTED.btEnabled
		WHERE companyId = @companyId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Desactivation logique d'une entreprise. */
CREATE OR ALTER PROCEDURE dbo.sp_SoftDeleteCompany
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 53003, 'companyId est obligatoire et doit etre positif.', 1;
		UPDATE dbo.tblCompany
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE companyId = @companyId;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
