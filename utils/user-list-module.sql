/*
================================================================================
  COMPLÉMENT MODULE UTILISATEUR — liste globale (v2.1)
================================================================================
  usp_ListUsers : liste simple de tous les utilisateurs (pour les listes
  déroulantes de filtres, ex. journal d'audit). Lecture de la vue
  vw_UserDetails — aucun accès inline à tblUser côté Node.js.
================================================================================
*/

USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_ListUsers
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        vd.userId, vd.vcLastName, vd.vcFirstName, vd.vcFullName, vd.vcEmail,
        vd.vcPhoneNumber, vd.btIsActive, vd.dtCreatedAt,
        COALESCE(g.roleCode, a.roleCode) AS roleCode
    FROM dbo.vw_UserDetails vd
    -- Périmètre GLOBAL (SuperAdmin) : companyId IS NULL, absent de vw_UserAssignmentContext.
    OUTER APPLY (
        SELECT TOP 1 r.vcCode AS roleCode
        FROM dbo.tblUserCompany uc
        INNER JOIN dbo.tblRefRole r ON r.roleId = uc.roleId
        WHERE uc.userId = vd.userId AND uc.btEnabled = 1
          AND uc.companyId IS NULL AND r.vcCode = 'SUPER_ADMIN'
    ) g
    -- Périmètre ENTREPRISE/BOUTIQUE : ne dépend pas du btIsActive du compte, afin que
    -- les Admins en attente de validation restent identifiables comme 'ADMIN'.
    OUTER APPLY (
        SELECT TOP 1 ac.roleCode
        FROM dbo.vw_UserAssignmentContext ac
        WHERE ac.userId = vd.userId
        ORDER BY
            CASE ac.scopeType WHEN 'COMPANY' THEN 0 ELSE 1 END,
            CASE ac.roleCode WHEN 'ADMIN' THEN 0 WHEN 'MANAGER' THEN 1 WHEN 'CASHIER' THEN 2 ELSE 3 END
    ) a
    ORDER BY vd.vcLastName, vd.vcFirstName;
END;
GO

PRINT '>> usp_ListUsers installé.';
GO
