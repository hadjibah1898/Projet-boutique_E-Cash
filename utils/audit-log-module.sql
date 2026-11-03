USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* Journal d'audit avec nom de l'utilisateur, entreprise et boutique. */
CREATE OR ALTER VIEW dbo.vw_AuditLogDetails
AS
	SELECT
		a.auditLogId,
		a.userId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS userName,
		a.companyId,
		c.vcCompanyName,
		a.storeId,
		s.vcStoreName,
		a.vcActionName,
		a.tableName,
		a.vcRecordId,
		a.vcOldValuesJson,
		a.vcNewValuesJson,
		a.vcIpAddress,
		a.vcUserAgent,
		a.btEnabled,
		a.dtCreatedAt,
		a.dtLastUpdated
	FROM dbo.tblAuditLog AS a
	LEFT JOIN dbo.tblUser AS u ON u.userId = a.userId
	LEFT JOIN dbo.tblCompany AS c ON c.companyId = a.companyId
	LEFT JOIN dbo.tblStore AS s ON s.storeId = a.storeId;
GO

/* Insere une entree immuable d'audit et retourne le resume attendu par le DAL. */
CREATE OR ALTER PROCEDURE dbo.usp_CreateAuditLog
	@userId int = NULL,
	@companyId int = NULL,
	@storeId int = NULL,
	@vcActionName varchar(100),
	@tableName sysname,
	@vcRecordId varchar(100) = NULL,
	@vcOldValuesJson varchar(max) = NULL,
	@vcNewValuesJson varchar(max) = NULL,
	@vcIpAddress varchar(30) = NULL,
	@vcUserAgent varchar(150) = NULL
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF NULLIF(LTRIM(RTRIM(@vcActionName)), '') IS NULL
			THROW 53300, 'vcActionName est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@tableName)), '') IS NULL
			THROW 53301, 'tableName est obligatoire.', 1;

		INSERT INTO dbo.tblAuditLog (
			userId, companyId, storeId, vcActionName, tableName, vcRecordId,
			vcOldValuesJson, vcNewValuesJson, vcIpAddress, vcUserAgent,
			btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.auditLogId, INSERTED.userId, INSERTED.vcActionName,
		       INSERTED.tableName, INSERTED.vcRecordId, INSERTED.dtCreatedAt
		VALUES (
			@userId, @companyId, @storeId, @vcActionName, @tableName, @vcRecordId,
			@vcOldValuesJson, @vcNewValuesJson, @vcIpAddress, @vcUserAgent,
			1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/* Historique pagine avec filtres optionnels multi-tenant. */
CREATE OR ALTER PROCEDURE dbo.usp_GetAuditLogs
	@companyId int = NULL,
	@storeId int = NULL,
	@userId int = NULL,
	@tableName sysname = NULL,
	@vcRecordId varchar(100) = NULL,
	@page int = 1,
	@limit int = 50
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @page IS NULL OR @page < 1 SET @page = 1;
		IF @limit IS NULL OR @limit < 1 OR @limit > 500 SET @limit = 50;

		DECLARE @offset int = (@page - 1) * @limit;
		SELECT
			auditLogId, userId, companyId, storeId, vcActionName, tableName,
			vcRecordId, vcOldValuesJson, vcNewValuesJson,
			vcIpAddress, vcUserAgent, btEnabled, dtCreatedAt
		FROM dbo.vw_AuditLogDetails
		WHERE (@companyId IS NULL OR companyId = @companyId)
		  AND (@storeId IS NULL OR storeId = @storeId)
		  AND (@userId IS NULL OR userId = @userId)
		  AND (@tableName IS NULL OR tableName = @tableName)
		  AND (@vcRecordId IS NULL OR vcRecordId = @vcRecordId)
		ORDER BY dtCreatedAt DESC, auditLogId DESC
		OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO