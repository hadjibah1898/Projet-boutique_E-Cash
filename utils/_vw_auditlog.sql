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
