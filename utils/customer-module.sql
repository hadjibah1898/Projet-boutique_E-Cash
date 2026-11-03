/*
  Module clients - SQL Server
  Prerequis: dbo.tblCustomer, dbo.tblRefCustomerType et dbo.tblRefGender.
  Le script est idempotent et peut etre execute apres le DDL des tables.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER VIEW dbo.vw_CustomerDetails
AS
	SELECT
		c.customerId,
		c.companyId,
		c.customerTypeId,
		ct.vcCode AS customerTypeCode,
		ct.vcCustomerType,
		c.genderId,
		g.vcCode AS genderCode,
		c.vcCustomerCode,
		c.vcLastName,
		c.vcFirstName,
		c.vcEmail,
		c.vcPhoneNumber,
		c.vcQuartier,
		c.vcCity,
		c.createdByUserId,
		c.btEnabled,
		c.dtCreatedAt,
		c.dtLastUpdated,
		CONCAT(
			COALESCE(c.vcLastName, ''), ' ',
			COALESCE(c.vcFirstName, ''), ' ',
			COALESCE(c.vcCustomerCode, ''), ' ',
			COALESCE(c.vcPhoneNumber, ''), ' ',
			COALESCE(c.vcEmail, '')
		) AS fullSearchText
	FROM dbo.tblCustomer AS c
	INNER JOIN dbo.tblRefCustomerType AS ct ON ct.customerTypeId = c.customerTypeId
	LEFT JOIN dbo.tblRefGender AS g ON g.genderId = c.genderId
	WHERE c.btEnabled = 1;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCustomersByCompany
	@companyId int
AS
	BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;
		SELECT
			c.customerId,
			c.companyId,
			c.customerTypeId,
			c.customerTypeCode,
			c.vcCustomerType AS customerType,
			c.genderId,
			c.genderCode,
			c.vcCustomerCode,
			c.vcLastName,
			c.vcFirstName,
			c.vcEmail,
			c.vcPhoneNumber,
			c.vcQuartier,
			c.vcCity,
			c.createdByUserId,
			c.btEnabled,
			c.dtCreatedAt,
			c.dtLastUpdated,
			c.fullSearchText,
			COALESCE(SUM(COALESCE(s.mNetAmount, 0)), 0) AS totalAchats,
			COALESCE(SUM(COALESCE(s.mPaidAmount, 0)), 0) AS totalPaye,
			COALESCE(SUM(COALESCE(s.mDebtAmount, 0)), 0) AS dette,
			MAX(CASE WHEN COALESCE(s.mDebtAmount, 0) > 0 THEN s.dtSoldAt END) AS echeanceDette
		FROM dbo.vw_CustomerDetails c
		LEFT JOIN dbo.tblSale s ON s.customerId = c.customerId AND (s.IsCancelled IS NULL OR s.IsCancelled = 0)
		WHERE c.companyId = @companyId
		GROUP BY
			c.customerId, c.companyId, c.customerTypeId, c.customerTypeCode,
			c.vcCustomerType, c.genderId, c.genderCode, c.vcCustomerCode,
			c.vcLastName, c.vcFirstName, c.vcEmail, c.vcPhoneNumber,
			c.vcQuartier, c.vcCity, c.createdByUserId, c.btEnabled,
			c.dtCreatedAt, c.dtLastUpdated, c.fullSearchText
		ORDER BY c.vcLastName, c.vcFirstName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_CreateCustomer
	@companyId int,
	@customerTypeCode varchar(50),
	@vcCustomerCode varchar(20),
	@createdByUserId int,
	@genderCode varchar(50) = NULL,
	@vcLastName varchar(50) = NULL,
	@vcFirstName varchar(50) = NULL,
	@vcEmail varchar(100) = NULL,
	@vcPhoneNumber varchar(20) = NULL,
	@vcQuartier varchar(50) = NULL,
	@vcCity varchar(50) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		DECLARE @customerTypeId int;
		DECLARE @genderId int = NULL;

		IF @companyId IS NULL OR @companyId <= 0
			THROW 51101, 'companyId est obligatoire et doit etre positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcCustomerCode)), '') IS NULL
			THROW 51102, 'vcCustomerCode est obligatoire.', 1;
		IF @createdByUserId IS NULL OR @createdByUserId <= 0
			THROW 51103, 'createdByUserId est obligatoire.', 1;

		SELECT @customerTypeId = customerTypeId
		FROM dbo.tblRefCustomerType
		WHERE vcCode = @customerTypeCode;
		IF @customerTypeId IS NULL
			THROW 51104, 'Type de client inconnu.', 1;

		IF @genderCode IS NOT NULL
		BEGIN
			SELECT @genderId = genderId
			FROM dbo.tblRefGender
			WHERE vcCode = @genderCode;
			IF @genderId IS NULL
				THROW 51105, 'Genre inconnu.', 1;
		END;

		INSERT INTO dbo.tblCustomer (
			companyId, customerTypeId, genderId, vcCustomerCode,
			vcLastName, vcFirstName, vcEmail, vcPhoneNumber,
			vcQuartier, vcCity, createdByUserId, btEnabled,
			dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.*
		VALUES (
			@companyId, @customerTypeId, @genderId, LTRIM(RTRIM(@vcCustomerCode)),
			@vcLastName, @vcFirstName, @vcEmail, @vcPhoneNumber,
			@vcQuartier, @vcCity, @createdByUserId, 1,
			SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCustomerById
	@customerId int,
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @customerId IS NULL OR @customerId <= 0
			THROW 51106, 'customerId est obligatoire et doit etre positif.', 1;
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			c.customerId, c.companyId, c.customerTypeId,
			ct.vcCode AS customerTypeCode, ct.vcCustomerType,
			c.genderId, g.vcCode AS genderCode,
			c.vcCustomerCode, c.vcLastName, c.vcFirstName,
			c.vcEmail, c.vcPhoneNumber, c.vcQuartier, c.vcCity,
			c.createdByUserId, c.btEnabled, c.dtCreatedAt, c.dtLastUpdated
		FROM dbo.tblCustomer AS c
		INNER JOIN dbo.tblRefCustomerType AS ct ON ct.customerTypeId = c.customerTypeId
		LEFT JOIN dbo.tblRefGender AS g ON g.genderId = c.genderId
		WHERE c.customerId = @customerId AND c.companyId = @companyId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_SearchCustomers
	@companyId int,
	@q varchar(100),
	@limit int = 50
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;
		IF NULLIF(LTRIM(RTRIM(@q)), '') IS NULL
			THROW 51107, 'Le terme de recherche q est obligatoire.', 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 500 SET @limit = 50;

		DECLARE @pattern varchar(202) = '%' + LTRIM(RTRIM(@q)) + '%';
		SELECT TOP (@limit)
			customerId, companyId, customerTypeId, customerTypeCode, vcCustomerType,
			genderId, genderCode, vcCustomerCode, vcLastName,
			vcFirstName, vcEmail, vcPhoneNumber, vcQuartier, vcCity,
			createdByUserId, btEnabled, dtCreatedAt, dtLastUpdated, fullSearchText
		FROM dbo.vw_CustomerDetails
		WHERE companyId = @companyId
		  AND (
			fullSearchText LIKE @pattern
			OR LTRIM(RTRIM(CONCAT(COALESCE(vcFirstName, ''), ' ', COALESCE(vcLastName, '')))) LIKE @pattern
			OR LTRIM(RTRIM(CONCAT(COALESCE(vcLastName, ''), ' ', COALESCE(vcFirstName, '')))) LIKE @pattern
		  )
		ORDER BY vcLastName, vcFirstName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_UpdateCustomer
	@customerId int,
	@companyId int,
	@vcLastName varchar(50) = NULL,
	@setVcLastName bit = 0,
	@vcFirstName varchar(50) = NULL,
	@setVcFirstName bit = 0,
	@vcEmail varchar(100) = NULL,
	@setVcEmail bit = 0,
	@vcPhoneNumber varchar(20) = NULL,
	@setVcPhoneNumber bit = 0,
	@vcQuartier varchar(50) = NULL,
	@setVcQuartier bit = 0,
	@vcCity varchar(50) = NULL,
	@setVcCity bit = 0,
	@customerTypeCode varchar(50) = NULL,
	@setCustomerType bit = 0,
	@genderCode varchar(50) = NULL,
	@setGender bit = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		DECLARE @customerTypeId int = NULL;
		DECLARE @genderId int = NULL;

		IF @customerId IS NULL OR @customerId <= 0
			THROW 51106, 'customerId est obligatoire et doit etre positif.', 1;
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

		IF @setCustomerType = 1
		BEGIN
			IF NULLIF(LTRIM(RTRIM(@customerTypeCode)), '') IS NULL
				THROW 51108, 'Le type de client ne peut pas etre NULL ou vide.', 1;
			SELECT @customerTypeId = customerTypeId
			FROM dbo.tblRefCustomerType
			WHERE vcCode = @customerTypeCode;
			IF @customerTypeId IS NULL
				THROW 51104, 'Type de client inconnu.', 1;
		END;

		IF @setGender = 1 AND @genderCode IS NOT NULL
		BEGIN
			SELECT @genderId = genderId
			FROM dbo.tblRefGender
			WHERE vcCode = @genderCode;
			IF @genderId IS NULL
				THROW 51105, 'Genre inconnu.', 1;
		END;

		UPDATE dbo.tblCustomer
		SET vcLastName = CASE WHEN @setVcLastName = 1 THEN @vcLastName ELSE vcLastName END,
			vcFirstName = CASE WHEN @setVcFirstName = 1 THEN @vcFirstName ELSE vcFirstName END,
			vcEmail = CASE WHEN @setVcEmail = 1 THEN @vcEmail ELSE vcEmail END,
			vcPhoneNumber = CASE WHEN @setVcPhoneNumber = 1 THEN @vcPhoneNumber ELSE vcPhoneNumber END,
			vcQuartier = CASE WHEN @setVcQuartier = 1 THEN @vcQuartier ELSE vcQuartier END,
			vcCity = CASE WHEN @setVcCity = 1 THEN @vcCity ELSE vcCity END,
			customerTypeId = CASE WHEN @setCustomerType = 1 THEN @customerTypeId ELSE customerTypeId END,
			genderId = CASE WHEN @setGender = 1 THEN @genderId ELSE genderId END,
			dtLastUpdated = SYSUTCDATETIME()
		OUTPUT INSERTED.*
		WHERE customerId = @customerId AND companyId = @companyId;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_SoftDeleteCustomer
	@customerId int,
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @customerId IS NULL OR @customerId <= 0
			THROW 51106, 'customerId est obligatoire et doit etre positif.', 1;
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

		UPDATE dbo.tblCustomer
		SET btEnabled = 0, dtLastUpdated = SYSUTCDATETIME()
		WHERE customerId = @customerId AND companyId = @companyId AND btEnabled = 1;
		SELECT @@ROWCOUNT AS rowsAffected;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetCustomerDebtHistory
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51100, 'companyId est obligatoire et doit etre positif.', 1;

		-- Dettes créées (ventes à crédit non annulées)
		-- mDebtAmount = mNetAmount - mPaidAmount (déjà déduit le paiement initial)
		-- On n'inclut PAS les paiements de tblSalePayment comme remboursements
		-- car ce sont des paiements initiaux, pas des remboursements de dette ultérieurs
		SELECT
			c.customerId,
			c.vcFirstName,
			c.vcLastName,
			s.mDebtAmount AS montant,
			'CREATION' AS type,
			s.dtSoldAt AS createdAt,
			s.saleId AS referenceId
		FROM dbo.tblSale AS s
		INNER JOIN dbo.tblCustomer AS c ON c.customerId = s.customerId
		WHERE c.companyId = @companyId
		  AND s.IsCancelled = 0
		  AND s.mDebtAmount > 0

		ORDER BY createdAt DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO