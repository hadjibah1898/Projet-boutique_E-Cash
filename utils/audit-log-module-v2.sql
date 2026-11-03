/*
================================================================================
  MODULE AUDIT — SQL Server (v1.1)
================================================================================
  Corrections / évolutions :
  - usp_GetAuditLogs : ajout des filtres @vcActionName, @dtStartDate,
    @dtEndDate + 2e jeu de résultats (COUNT total) pour la pagination
    (totalPages côté API).
  - Le DAL appelle usp_CreateAuditLog (sp_CreateAuditLog n'existe pas).
================================================================================
*/

USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetAuditLogs
    @companyId int = NULL,
    @storeId int = NULL,
    @userId int = NULL,
    @tableName sysname = NULL,
    @vcRecordId varchar(100) = NULL,
    @vcActionName varchar(100) = NULL,
    @dtStartDate datetime = NULL,
    @dtEndDate datetime = NULL,
    @page int = 1,
    @limit int = 50
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        IF @page IS NULL OR @page < 1 SET @page = 1;
        -- @limit = 0 => export "tous les enregistrements" (borné à 5000)
        IF @limit IS NULL OR @limit < 0 SET @limit = 50;
        IF @limit > 5000 SET @limit = 5000;

        DECLARE @offset int = (@page - 1) * @limit;

        -- 1. Décompte total (toutes pages confondues)
        SELECT COUNT(*) AS totalRows
        FROM dbo.vw_AuditLogDetails
        WHERE (@companyId IS NULL OR companyId = @companyId)
          AND (@storeId IS NULL OR storeId = @storeId)
          AND (@userId IS NULL OR userId = @userId)
          AND (@tableName IS NULL OR tableName = @tableName)
          AND (@vcRecordId IS NULL OR vcRecordId = @vcRecordId)
          AND (@vcActionName IS NULL OR vcActionName = @vcActionName)
          AND (@dtStartDate IS NULL OR dtCreatedAt >= @dtStartDate)
          AND (@dtEndDate IS NULL OR dtCreatedAt < @dtEndDate);

        -- 2. Page demandée (si @limit = 0 => tout, tri chronologique descendant)
        SELECT
            auditLogId, userId, userName, companyId, vcCompanyName,
            storeId, vcStoreName, vcActionName, tableName, vcRecordId,
            vcOldValuesJson, vcNewValuesJson, vcIpAddress, vcUserAgent, dtCreatedAt
        FROM dbo.vw_AuditLogDetails
        WHERE (@companyId IS NULL OR companyId = @companyId)
          AND (@storeId IS NULL OR storeId = @storeId)
          AND (@userId IS NULL OR userId = @userId)
          AND (@tableName IS NULL OR tableName = @tableName)
          AND (@vcRecordId IS NULL OR vcRecordId = @vcRecordId)
          AND (@vcActionName IS NULL OR vcActionName = @vcActionName)
          AND (@dtStartDate IS NULL OR dtCreatedAt >= @dtStartDate)
          AND (@dtEndDate IS NULL OR dtCreatedAt < @dtEndDate)
        ORDER BY dtCreatedAt DESC, auditLogId DESC
        OFFSET CASE WHEN @limit = 0 THEN 0 ELSE @offset END ROWS
        FETCH NEXT CASE WHEN @limit = 0 THEN 5000 ELSE @limit END ROWS ONLY;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
END;
GO

PRINT '>> Module Audit amélioré (filtres action/dates + totalRows).';
GO
