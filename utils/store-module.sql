/*
  Module boutiques - SQL Server.
  Prerequis: dbo.tblStore, dbo.tblCompany, dbo.tblRefStoreType.
  Le DAL Node reste inchange; ces objets fournissent la couche SQL cible.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Boutiques enrichies du type, du code et du nom de l'entreprise. */
CREATE OR ALTER VIEW dbo.vw_StoreDetails
AS
	SELECT
		s.storeId,
		s.companyId,
		c.vcCompanyCode,
		c.vcCompanyName,
		s.storeTypeId,
		t.vcCode AS storeTypeCode,
		t.vcStoreType,
		s.vcStoreCode,
		s.vcStoreName,
		s.vcAddress,
		s.vcCity,
		s.vcPhoneNumber,
		s.dcLatitude,
		s.dcLongitude,
		s.createdByUserId,
		s.btEnabled,
		s.dtCreatedAt,
		s.dtLastUpdated
	FROM dbo.tblStore AS s
	INNER JOIN dbo.tblRefStoreType AS t ON t.storeTypeId = s.storeTypeId
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = s.companyId;
GO

/* Cree une boutique ou un entrepot. storeTypeId est resolu par RefDAL. */
CREATE OR ALTER PROCEDURE dbo.sp_CreateStore
	@companyId int,
	@storeTypeId int,
	@vcStoreCode varchar(20),
	@vcStoreName varchar(50),
	@createdByUserId int,
	@vcAddress varchar(150) = NULL,
	@vcCity varchar(50) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@dcLatitude decimal(9, 6) = NULL,
	@dcLongitude decimal(9, 6) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51700, 'companyId est obligatoire et doit etre positif.', 1;
		IF @storeTypeId IS NULL OR @storeTypeId <= 0
			THROW 51701, 'storeTypeId est obligatoire et doit etre positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcStoreCode)), '') IS NULL
			THROW 51702, 'vcStoreCode est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcStoreName)), '') IS NULL
			THROW 51703, 'vcStoreName est obligatoire.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 51704, 'createdByUserId est obligatoire et doit etre positif.', 1;
		IF NOT EXISTS (SELECT 1 FROM dbo.tblRefStoreType WHERE storeTypeId = @storeTypeId)
			THROW 51701, 'Type de boutique introuvable.', 1;

		INSERT INTO dbo.tblStore (
			companyId, storeTypeId, vcStoreCode, vcStoreName, vcAddress, vcCity,
			vcPhoneNumber, dcLatitude, dcLongitude, createdByUserId,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT
			INSERTED.storeId, INSERTED.companyId, INSERTED.storeTypeId,
			INSERTED.vcStoreCode, INSERTED.vcStoreName, INSERTED.vcAddress,
			INSERTED.vcCity, INSERTED.vcPhoneNumber, INSERTED.dcLatitude,
			INSERTED.dcLongitude, INSERTED.btEnabled, INSERTED.dtCreatedAt
		VALUES (
			@companyId, @storeTypeId, LTRIM(RTRIM(@vcStoreCode)), LTRIM(RTRIM(@vcStoreName)),
			@vcAddress, @vcCity, @vcPhoneNumber, @dcLatitude, @dcLongitude,
			@createdByUserId, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Liste les boutiques d'une entreprise, avec filtre actif optionnel. */
CREATE OR ALTER PROCEDURE dbo.sp_GetStoresByCompany
	@companyId int,
	@onlyActive bit = 1
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51700, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			storeId, companyId, storeTypeId, vcStoreType,
			vcStoreCode, vcStoreName, vcAddress, vcCity, vcPhoneNumber,
			dcLatitude, dcLongitude, btEnabled
		FROM dbo.vw_StoreDetails
		WHERE companyId = @companyId AND (@onlyActive = 0 OR btEnabled = 1)
		ORDER BY vcStoreName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Lit une boutique par identifiant, active ou non. */
CREATE OR ALTER PROCEDURE dbo.sp_GetStoreById
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51705, 'storeId est obligatoire et doit etre positif.', 1;
		SELECT *
		FROM dbo.vw_StoreDetails
		WHERE storeId = @storeId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Mise a jour partielle; les indicateurs permettent de passer NULL explicitement. */
CREATE OR ALTER PROCEDURE dbo.sp_UpdateStore
	@storeId int,
	@vcStoreName varchar(50) = NULL,
	@setVcStoreName bit = 0,
	@vcAddress varchar(150) = NULL,
	@setVcAddress bit = 0,
	@vcCity varchar(50) = NULL,
	@setVcCity bit = 0,
	@vcPhoneNumber varchar(20) = NULL,
	@setVcPhoneNumber bit = 0,
	@dcLatitude decimal(9, 6) = NULL,
	@setDcLatitude bit = 0,
	@dcLongitude decimal(9, 6) = NULL,
	@setDcLongitude bit = 0,
	@btEnabled bit = NULL,
	@setBtEnabled bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51705, 'storeId est obligatoire et doit etre positif.', 1;
		IF @setVcStoreName = 1 AND NULLIF(LTRIM(RTRIM(@vcStoreName)), '') IS NULL
			THROW 51703, 'vcStoreName ne peut pas etre NULL ou vide.', 1;

		UPDATE dbo.tblStore
		SET vcStoreName = CASE WHEN @setVcStoreName = 1 THEN LTRIM(RTRIM(@vcStoreName)) ELSE vcStoreName END,
			vcAddress = CASE WHEN @setVcAddress = 1 THEN @vcAddress ELSE vcAddress END,
			vcCity = CASE WHEN @setVcCity = 1 THEN @vcCity ELSE vcCity END,
			vcPhoneNumber = CASE WHEN @setVcPhoneNumber = 1 THEN @vcPhoneNumber ELSE vcPhoneNumber END,
			dcLatitude = CASE WHEN @setDcLatitude = 1 THEN @dcLatitude ELSE dcLatitude END,
			dcLongitude = CASE WHEN @setDcLongitude = 1 THEN @dcLongitude ELSE dcLongitude END,
			btEnabled = CASE WHEN @setBtEnabled = 1 THEN @btEnabled ELSE btEnabled END,
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.storeId, INSERTED.vcStoreName, INSERTED.btEnabled, INSERTED.dtLastUpdated
		WHERE storeId = @storeId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Desactivation logique d'une boutique active. */
CREATE OR ALTER PROCEDURE dbo.sp_SoftDeleteStore
	@storeId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @storeId IS NULL OR @storeId <= 0
			THROW 51705, 'storeId est obligatoire et doit etre positif.', 1;
		UPDATE dbo.tblStore
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE storeId = @storeId AND btEnabled = 1;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO
