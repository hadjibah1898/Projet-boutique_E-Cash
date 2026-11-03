/*
================================================================================
  COMPLÉMENT MODULE BOUTIQUES — liste globale (v1.0)
================================================================================
  usp_ListStores : liste les boutiques actives, toutes entreprises confondues
  (@companyId NULL) ou filtrées par entreprise. Utilisée par la route
  de compatibilité GET /api/boutiques (ancien frontend français).
================================================================================
*/

USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_ListStores
    @companyId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        s.storeId, s.companyId, s.storeTypeId, t.vcCode AS storeTypeCode,
        t.vcStoreType, s.vcStoreCode, s.vcStoreName, s.vcAddress, s.vcCity,
        s.vcPhoneNumber, s.dcLatitude, s.dcLongitude, s.createdByUserId,
        s.btEnabled, s.dtCreatedAt, s.dtLastUpdated,
        c.vcCompanyCode, c.vcCompanyName
    FROM dbo.tblStore AS s
    LEFT JOIN dbo.tblRefStoreType AS t ON t.storeTypeId = s.storeTypeId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = s.companyId
    WHERE s.btEnabled = 1
      AND (@companyId IS NULL OR s.companyId = @companyId)
    ORDER BY s.vcStoreName;
END;
GO

PRINT '>> usp_ListStores installé.';
GO
