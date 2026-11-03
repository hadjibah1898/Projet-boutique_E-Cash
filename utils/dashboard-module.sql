/*
================================================================================
  MODULE DASHBOARD — SQL Server (v1.0)
================================================================================
  Description : Statistiques globales pour le tableau de bord SuperAdmin.
  Réservé à :  SUPER_ADMIN (contrôle effectué côté Node.js via requireRole).
  Dépendances : dbo.tblCompany, dbo.tblStore, dbo.tblUser, dbo.tblSale,
                dbo.tblUserStore, dbo.tblRefRole.
================================================================================
*/

USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*------------------------------------------------------------------------------
  usp_GetSuperAdminDashboardStats
  Rôle : 2 jeux de résultats :
         RS1 — Compteurs globaux (entreprises, boutiques, utilisateurs, CA,
               gérants, ventes).
         RS2 — Liste des entreprises (pour le tableau du dashboard).
  Remarque : la table tblRefStoreType ne distingue pas "Bar" / "Marchand"
             dans ce schéma ; toutes les boutiques actives sont comptées
             comme "Marchands" et totalBars reste à 0.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_GetSuperAdminDashboardStats
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Compteurs globaux
    SELECT
        (SELECT COUNT(*) FROM dbo.tblCompany WHERE btEnabled = 1) AS totalAdmins,
        (SELECT COUNT(*) FROM dbo.tblStore   WHERE btEnabled = 1) AS totalBoutiques,
        (SELECT COUNT(*) FROM dbo.tblUser    WHERE btIsActive = 1) AS totalUsers,
        (SELECT ISNULL(SUM(mNetAmount), 0) FROM dbo.tblSale WHERE IsCancelled = 0 AND btEnabled = 1) AS totalCA,
        (SELECT COUNT(DISTINCT us.userId)
           FROM dbo.tblUserStore AS us
           INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
          WHERE us.btEnabled = 1 AND us.dtEndDate IS NULL AND r.vcCode = 'MANAGER') AS totalGerants,
        (SELECT COUNT(*) FROM dbo.tblStore   WHERE btEnabled = 1) AS totalMarchands,
        CAST(0 AS int) AS totalBars,
        (SELECT COUNT(*) FROM dbo.tblSale WHERE IsCancelled = 0 AND btEnabled = 1) AS totalVentes;

    -- 2. Liste des entreprises (avec nb de boutiques actives)
    SELECT
        c.companyId                          AS [_id],
        c.vcCompanyName                      AS nom,
        c.vcEmail                            AS email,
        CAST('Marchand' AS varchar(20))      AS typeCompte,
        (SELECT COUNT(*) FROM dbo.tblStore s WHERE s.companyId = c.companyId AND s.btEnabled = 1) AS nbBoutiques,
        c.btEnabled                          AS active,
        c.dtCreatedAt                        AS createdAt
    FROM dbo.tblCompany AS c
    ORDER BY c.dtCreatedAt DESC;
END;
GO

PRINT '>> Module Dashboard installé (1 procédure).';
GO
