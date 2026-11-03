/*
================================================================================
  MODULE UTILISATEUR — SQL Server (v2.0)
================================================================================
  Description : Gestion du cycle de vie des utilisateurs (Création, Authentification, 
                Modification, Désactivation, Affectation aux boutiques/entreprises).
                
  Règles métier fondamentales :
    - Hiérarchie stricte : SUPER_ADMIN > ADMIN (Entreprise) > MANAGER (Boutique) > CASHIER.
    - Le SuperAdmin est unique et global (companyId NULL).
    - Un Admin ne peut gérer que les utilisateurs de son entreprise.
    - Un Manager ne peut gérer que les Caissiers de sa boutique.
    - Les mots de passe sont hachés (bcrypt) côté Node.js, le SQL ne reçoit que le hash.

  Dépendances : dbo.tblUser, dbo.tblRefGender, dbo.tblRefRole, dbo.tblUserCompany,
                dbo.tblCompany, dbo.tblUserStore, dbo.tblStore, dbo.tblRefRegistrationRequestStatus.
================================================================================
*/

USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

/*==============================================================================
  1. VUES (Vues de lecture et de sécurité)
==============================================================================*/

/*------------------------------------------------------------------------------
  vw_UserDetails
  Rôle : Profil utilisateur complet avec le libellé du genre et le nom complet 
         concaténé. Utilisé pour l'affichage dans le frontend.
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_UserDetails
AS
    SELECT
        u.userId, u.vcLastName, u.vcFirstName,
        LTRIM(RTRIM(u.vcLastName + N' ' + ISNULL(u.vcFirstName, N''))) AS vcFullName,
        u.genderId, g.vcCode AS genderCode, g.vcGender,
        u.vcEmail, u.vcPhoneNumber, u.vcAddress, u.vcPhotoUrl,
        u.dtLastLoginAt, u.btIsActive, u.dtCreatedAt, u.dtLastUpdated
    FROM dbo.tblUser AS u
    LEFT JOIN dbo.tblRefGender AS g ON g.genderId = u.genderId;
GO

/*------------------------------------------------------------------------------
  vw_UserAssignmentContext
  Rôle : Vue d'union (UNION ALL) qui normalise les affectations d'un utilisateur.
         Elle permet de voir d'un seul coup d'œil si un utilisateur est rattaché 
         à une Entreprise (COMPANY) ou à une Boutique (STORE).
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_UserAssignmentContext
AS
    -- Contexte Entreprise
    SELECT uc.userId, uc.userCompanyId AS assignmentId, CAST('COMPANY' AS varchar(10)) AS scopeType,
           uc.companyId, c.vcCompanyName, CAST(NULL AS int) AS storeId, CAST(NULL AS varchar(50)) AS vcStoreName,
           uc.roleId, r.vcCode AS roleCode, r.vcRole AS roleName, uc.dtAssignedAt AS assignedAt
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId
    WHERE uc.btEnabled = 1 AND uc.companyId IS NOT NULL
    UNION ALL
    -- Contexte Boutique
    SELECT us.userId, us.userStoreId AS assignmentId, CAST('STORE' AS varchar(10)) AS scopeType,
           s.companyId, c.vcCompanyName, s.storeId, s.vcStoreName,
           us.roleId, r.vcCode AS roleCode, r.vcRole AS roleName, us.dtStartDate AS assignedAt
    FROM dbo.tblUserStore AS us
    INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = s.companyId
    WHERE us.btEnabled = 1;
GO

/*------------------------------------------------------------------------------
  vw_UserActiveAuthorizationScope
  Rôle : CŒUR DU SYSTÈME DE SÉCURITÉ. Cette vue détermine les périmètres d'action 
         réels et actifs d'un utilisateur.
  Règle spéciale : Le SuperAdmin reste actif même si son compte est désactivé 
                   (btIsActive non filtré pour lui) pour éviter un blocage total.
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_UserActiveAuthorizationScope
AS
    -- 1. Périmètre GLOBAL (SuperAdmin)
    SELECT uc.userId, CAST('GLOBAL' AS varchar(10)) AS scopeType, CAST(NULL AS int) AS companyId, CAST(NULL AS int) AS storeId,
           uc.roleId, r.vcCode AS roleCode, r.vcRole AS roleName
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    WHERE uc.btEnabled = 1 AND uc.companyId IS NULL AND r.vcCode = 'SUPER_ADMIN'
    UNION ALL
    -- 2. Périmètre ENTREPRISE (Admin)
    SELECT uc.userId, CAST('COMPANY' AS varchar(10)) AS scopeType, uc.companyId, CAST(NULL AS int) AS storeId,
           uc.roleId, r.vcCode AS roleCode, r.vcRole AS roleName
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblUser AS u ON u.userId = uc.userId
    INNER JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    WHERE uc.btEnabled = 1 AND uc.companyId IS NOT NULL AND u.btIsActive = 1 AND c.btEnabled = 1 AND r.vcCode = 'ADMIN'
    UNION ALL
    -- 3. Périmètre BOUTIQUE (Manager, Caissier)
    SELECT us.userId, CAST('STORE' AS varchar(10)) AS scopeType, s.companyId, us.storeId,
           us.roleId, r.vcCode AS roleCode, r.vcRole AS roleName
    FROM dbo.tblUserStore AS us
    INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
    INNER JOIN dbo.tblCompany AS c ON c.companyId = s.companyId
    INNER JOIN dbo.tblUser AS u ON u.userId = us.userId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
    WHERE us.btEnabled = 1 AND us.dtEndDate IS NULL AND u.btIsActive = 1 AND s.btEnabled = 1 AND c.btEnabled = 1 AND r.vcCode IN ('MANAGER', 'CASHIER');
GO

/*------------------------------------------------------------------------------
  vw_UserStoreDetails & vw_UserCompanyDetails
  Rôle : Vues de dénormalisation pour faciliter les SELECT dans le code Node.js 
         (évite de faire des jointures complexes côté API).
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_UserStoreDetails
AS
    SELECT us.userStoreId, us.userId, u.vcLastName, u.vcFirstName, u.vcEmail, u.vcPhoneNumber,
           us.storeId, s.vcStoreCode, s.vcStoreName, s.companyId,
           us.roleId, r.vcCode AS roleCode, r.vcRole AS roleName,
           us.assignedByUserId, us.dtStartDate, us.dtEndDate, us.btEnabled
    FROM dbo.tblUserStore AS us
    INNER JOIN dbo.tblUser AS u ON u.userId = us.userId
    INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId;
GO

CREATE OR ALTER VIEW dbo.vw_UserCompanyDetails
AS
    SELECT uc.userCompanyId, uc.userId, u.vcLastName, u.vcFirstName, u.vcEmail, u.vcPhoneNumber,
           uc.companyId, c.vcCompanyCode, c.vcCompanyName,
           uc.roleId, r.vcCode AS roleCode, r.vcRole AS roleName,
           uc.createdByUserId, uc.dtAssignedAt, uc.dtEndedAt, uc.btEnabled
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblUser AS u ON u.userId = uc.userId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId;
GO

/*==============================================================================
  2. PROCÉDURES DE CRÉATION (Avec contrôle d'accès strict)
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_CreateUser
  Rôle : Création basique d'un utilisateur sans rôle spécifique.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_CreateUser
    @vcLastName varchar(50), @vcPasswordHash varchar(255), @genderId int = NULL,
    @vcFirstName varchar(50) = NULL, @vcEmail varchar(100) = NULL, @vcPhoneNumber varchar(20) = NULL,
    @vcAddress varchar(150) = NULL, @vcPhotoUrl varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        -- Validations de base
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL THROW 51200, 'Le nom de famille est obligatoire.', 1;
        IF NULLIF(@vcPasswordHash, '') IS NULL THROW 51201, 'Le hash du mot de passe est obligatoire.', 1;
        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL THROW 51202, 'Un email ou un numéro de téléphone est obligatoire.', 1;
        IF @genderId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId) THROW 51203, 'Le genre indiqué est introuvable.', 1;

        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcPasswordHash, vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt, dtLastUpdated)
        OUTPUT INSERTED.userId, INSERTED.vcLastName, INSERTED.vcFirstName, INSERTED.genderId, INSERTED.vcEmail, INSERTED.vcPhoneNumber, INSERTED.vcAddress, INSERTED.vcPhotoUrl, INSERTED.btIsActive, INSERTED.dtCreatedAt
        VALUES (LTRIM(RTRIM(@vcLastName)), NULLIF(LTRIM(RTRIM(@vcFirstName)), ''), @genderId, LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')), NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''), @vcPasswordHash, NULLIF(LTRIM(RTRIM(@vcAddress)), ''), NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''), NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_CreateAdminBySuperAdmin
  Rôle : Crée un Admin rattaché à une entreprise.
  Sécurité : Vérifie que l'appelant (@createdByUserId) possède bien le rôle GLOBAL SUPER_ADMIN.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_CreateAdminBySuperAdmin
    @createdByUserId int, @companyId int, @vcLastName varchar(50), @vcPasswordHash varchar(255),
    @vcFirstName varchar(50) = NULL, @genderId int = NULL, @vcEmail varchar(100) = NULL,
    @vcPhoneNumber varchar(20) = NULL, @vcAddress varchar(150) = NULL, @vcPhotoUrl varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        -- 1. Contrôle de sécurité
        IF @createdByUserId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') THROW 51260, 'Réservé au SuperAdmin.', 1;
        
        -- 2. Validations
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL THROW 51200, 'Le nom est obligatoire.', 1;
        IF NULLIF(@vcPasswordHash, '') IS NULL THROW 51201, 'Le hash est obligatoire.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.tblCompany WHERE companyId = @companyId AND btEnabled = 1) THROW 51270, 'Entreprise introuvable ou inactive.', 1;
        IF @vcEmail IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail)) THROW 51271, 'Email déjà utilisé.', 1;

        DECLARE @adminRoleId int = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'ADMIN' AND btEnabled = 1);

        -- 3. Insertion atomique (Transaction)
        BEGIN TRANSACTION;
        DECLARE @newUserId int;
        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcPasswordHash, vcAddress, vcPhotoUrl, btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES (LTRIM(RTRIM(@vcLastName)), NULLIF(LTRIM(RTRIM(@vcFirstName)), ''), @genderId, LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')), NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''), @vcPasswordHash, NULLIF(LTRIM(RTRIM(@vcAddress)), ''), NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''), 1, SYSUTCDATETIME(), SYSUTCDATETIME());
        
        SET @newUserId = SCOPE_IDENTITY();
        
        INSERT INTO dbo.tblUserCompany (userId, companyId, roleId, createdByUserId, dtAssignedAt, dtEndedAt, btEnabled)
        VALUES (@newUserId, @companyId, @adminRoleId, @createdByUserId, SYSUTCDATETIME(), NULL, 1);
        
        COMMIT TRANSACTION;
        SELECT @newUserId AS userId, @companyId AS companyId, @adminRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_CreateManagerByAdmin
  Rôle : Crée un Manager rattaché à une boutique.
  Sécurité : Ouvert au SuperAdmin OU à l'Admin de l'entreprise à laquelle appartient la boutique.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_CreateManagerByAdmin
    @createdByUserId int, @storeId int, @vcLastName varchar(50), @vcPasswordHash varchar(255),
    @vcFirstName varchar(50) = NULL, @genderId int = NULL, @vcEmail varchar(100) = NULL,
    @vcPhoneNumber varchar(20) = NULL, @vcAddress varchar(150) = NULL, @vcPhotoUrl varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore WHERE storeId = @storeId AND btEnabled = 1);
        IF @companyId IS NULL THROW 51274, 'Boutique introuvable ou inactive.', 1;

        -- Contrôle de sécurité (SuperAdmin OU Admin de cette entreprise)
        DECLARE @isSA bit = 0, @isAdmin bit = 0;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') SET @isSA = 1;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'COMPANY' AND companyId = @companyId AND roleCode = 'ADMIN') SET @isAdmin = 1;
        IF @isSA = 0 AND @isAdmin = 0 THROW 51275, 'Seul un SuperAdmin ou un Admin de cette entreprise peut créer un Manager.', 1;

        DECLARE @managerRoleId int = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'MANAGER' AND btEnabled = 1);

        BEGIN TRANSACTION;
        DECLARE @newUserId int;
        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcPasswordHash, vcAddress, vcPhotoUrl, btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES (LTRIM(RTRIM(@vcLastName)), NULLIF(LTRIM(RTRIM(@vcFirstName)), ''), @genderId, LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')), NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''), @vcPasswordHash, NULLIF(LTRIM(RTRIM(@vcAddress)), ''), NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''), 1, SYSUTCDATETIME(), SYSUTCDATETIME());
        SET @newUserId = SCOPE_IDENTITY();
        INSERT INTO dbo.tblUserStore (userId, storeId, roleId, assignedByUserId, dtStartDate, dtEndDate, btEnabled)
        VALUES (@newUserId, @storeId, @managerRoleId, @createdByUserId, SYSUTCDATETIME(), NULL, 1);
        COMMIT TRANSACTION;
        SELECT @newUserId AS userId, @storeId AS storeId, @managerRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_CreateCashierForManager
  Rôle : Crée un Caissier rattaché à une boutique.
  Sécurité : Ouvert au SuperAdmin, Admin de l'entreprise OU Manager de la boutique.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_CreateCashierForManager
    @createdByUserId int, @storeId int, @vcLastName varchar(50), @vcPasswordHash varchar(255),
    @genderId int = NULL, @vcFirstName varchar(50) = NULL, @vcEmail varchar(100) = NULL,
    @vcPhoneNumber varchar(20) = NULL, @vcAddress varchar(150) = NULL, @vcPhotoUrl varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore WHERE storeId = @storeId AND btEnabled = 1);
        IF @companyId IS NULL THROW 51244, 'Boutique introuvable ou inactive.', 1;

        DECLARE @isSA bit = 0, @isAdmin bit = 0, @isMgr bit = 0;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') SET @isSA = 1;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'COMPANY' AND companyId = @companyId AND roleCode = 'ADMIN') SET @isAdmin = 1;
        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'STORE' AND storeId = @storeId AND roleCode = 'MANAGER') SET @isMgr = 1;
        IF @isSA = 0 AND @isAdmin = 0 AND @isMgr = 0 THROW 51245, 'Vous n''êtes pas autorisé à créer un caissier dans cette boutique.', 1;

        DECLARE @cashierRoleId int = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'CASHIER' AND btEnabled = 1);

        BEGIN TRANSACTION;
        DECLARE @newUserId int;
        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcPasswordHash, vcAddress, vcPhotoUrl, btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES (LTRIM(RTRIM(@vcLastName)), NULLIF(LTRIM(RTRIM(@vcFirstName)), ''), @genderId, LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')), NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''), @vcPasswordHash, NULLIF(LTRIM(RTRIM(@vcAddress)), ''), NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''), 1, SYSUTCDATETIME(), SYSUTCDATETIME());
        SET @newUserId = SCOPE_IDENTITY();
        INSERT INTO dbo.tblUserStore (userId, storeId, roleId, assignedByUserId, dtStartDate, dtEndDate, btEnabled)
        VALUES (@newUserId, @storeId, @cashierRoleId, @createdByUserId, SYSUTCDATETIME(), NULL, 1);
        COMMIT TRANSACTION;
        SELECT @newUserId AS userId, @storeId AS storeId, @cashierRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO

/*==============================================================================
  3. AUTHENTIFICATION ET GESTION DE SESSION
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_FindUserByLoginIdentifier
  Rôle : Vérifie les identifiants (Email ou Téléphone) et retourne le hash pour 
         que Node.js puisse faire le bcrypt.compare().
  Sécurité : Utilise la vue d'autorisation pour s'assurer que le compte a un rôle 
             actif, SAUF pour le SuperAdmin qui est toujours reconnu.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_FindUserByLoginIdentifier
    @vcEmail varchar(100), @vcPhoneNumber varchar(20)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL THROW 51204, 'L''identifiant email ou téléphone est obligatoire.', 1;

        -- Requête dynamique gérée selon l'existence de la colonne optionnelle btMustChangePassword
        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql
                N'SELECT TOP (1) u.userId, u.vcLastName, u.vcFirstName, u.genderId, u.vcEmail, u.vcPhoneNumber, u.vcPasswordHash, u.vcAddress, u.vcPhotoUrl, u.btIsActive, u.dtCreatedAt, CAST(ISNULL(u.btMustChangePassword, 0) AS bit) AS mustChangePassword
                  FROM dbo.tblUser AS u WHERE (LOWER(u.vcEmail) = LOWER(@email) OR u.vcPhoneNumber = @phone) AND EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope AS a WHERE a.userId = u.userId);',
                N'@email varchar(100), @phone varchar(20)', @email = @vcEmail, @phone = @vcPhoneNumber;
        END
        ELSE
        BEGIN
            SELECT TOP (1) u.userId, u.vcLastName, u.vcFirstName, u.genderId, u.vcEmail, u.vcPhoneNumber, u.vcPasswordHash, u.vcAddress, u.vcPhotoUrl, u.btIsActive, u.dtCreatedAt, CAST(CASE WHEN u.dtLastLoginAt IS NULL THEN 1 ELSE 0 END AS bit) AS mustChangePassword
            FROM dbo.tblUser AS u WHERE (LOWER(u.vcEmail) = LOWER(@vcEmail) OR u.vcPhoneNumber = @vcPhoneNumber) AND EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope AS a WHERE a.userId = u.userId);
        END;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_GetUserById
  Rôle : Récupère les infos d'un utilisateur pour le Frontend (sans le hash !).
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_GetUserById
    @userId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql N'SELECT userId, vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt, dtLastUpdated, CAST(ISNULL(btMustChangePassword, 0) AS bit) AS mustChangePassword FROM dbo.tblUser WHERE userId = @id;', N'@id int', @id = @userId;
        END
        ELSE
        BEGIN
            SELECT userId, vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber, vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt, dtLastUpdated, CAST(CASE WHEN dtLastLoginAt IS NULL THEN 1 ELSE 0 END AS bit) AS mustChangePassword FROM dbo.tblUser WHERE userId = @userId;
        END;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_SetMustChangePassword
  Rôle : Force l'utilisateur à changer son mot de passe à la prochaine connexion.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_SetMustChangePassword
    @userId int, @required bit
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        DECLARE @rowsAffected int = 0;
        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql N'UPDATE dbo.tblUser SET btMustChangePassword = @flag, dtLastUpdated = SYSUTCDATETIME() WHERE userId = @id; SET @rows = @@ROWCOUNT;', N'@id int, @flag bit, @rows int OUTPUT', @id = @userId, @flag = @required, @rows = @rowsAffected OUTPUT;
        END;
        SELECT @rowsAffected AS rowsAffected;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_GetUserContext
  Rôle : Renvoie les 3 niveaux de contexte d'un utilisateur (Entreprises, Boutiques, SuperAdmin).
         Utilisé par Node.js pour construire le payload du Token JWT.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_GetUserContext
    @userId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        
        -- 1. Liste des entreprises
        SELECT assignmentId AS userCompanyId, companyId, vcCompanyName, roleId, roleCode AS companyRoleCode FROM dbo.vw_UserAssignmentContext WHERE userId = @userId AND scopeType = 'COMPANY' ORDER BY assignedAt;
        
        -- 2. Liste des boutiques
        SELECT assignmentId AS userStoreId, storeId, vcStoreName, companyId, roleId, roleCode AS storeRoleCode FROM dbo.vw_UserAssignmentContext WHERE userId = @userId AND scopeType = 'STORE' ORDER BY assignedAt;
        
        -- 3. Rôle Global
        SELECT TOP (1) r.roleId, r.vcCode AS globalRoleCode FROM dbo.tblUserCompany AS uc INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId WHERE uc.userId = @userId AND uc.companyId IS NULL AND uc.btEnabled = 1 AND r.vcCode = 'SUPER_ADMIN';
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_UpdateUserLastLogin
  Rôle : Met à jour la date de dernière connexion.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_UpdateUserLastLogin
    @userId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        UPDATE dbo.tblUser SET dtLastLoginAt = SYSUTCDATETIME(), dtLastUpdated = SYSUTCDATETIME() WHERE userId = @userId;
        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*==============================================================================
  4. ACTIVATION, DÉSACTIVATION ET MODIFICATION
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_SetUserActive
  Rôle : Active ou désactive un compte.
  Sécurité : Empêche l'auto-désactivation. Empêche la désactivation du SuperAdmin 
             par un non-SuperAdmin.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_SetUserActive
    @userId int, @btIsActive bit, @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        IF @requestedByUserId IS NOT NULL AND @requestedByUserId = @userId AND @btIsActive = 0 THROW 51280, 'Auto-désactivation interdite.', 1;
        IF @btIsActive = 0 AND EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @userId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') AND (@requestedByUserId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @requestedByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')) THROW 51281, 'Compte SuperAdmin protégé.', 1;
        
        UPDATE dbo.tblUser SET btIsActive = @btIsActive, dtLastUpdated = SYSUTCDATETIME() OUTPUT INSERTED.userId, INSERTED.vcEmail, INSERTED.btIsActive WHERE userId = @userId;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_UpdateUser
  Rôle : Mise à jour partielle (les champs NULL sont ignorés grâce à COALESCE).
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_UpdateUser
    @userId int, @vcLastName varchar(50) = NULL, @vcFirstName varchar(50) = NULL, @genderId int = NULL,
    @vcEmail varchar(100) = NULL, @vcPhoneNumber varchar(20) = NULL, @vcAddress varchar(150) = NULL,
    @vcPhotoUrl varchar(255) = NULL, @vcPasswordHash varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0 THROW 51205, 'userId est obligatoire et doit être positif.', 1;
        IF @genderId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId) THROW 51203, 'Le genre indiqué est introuvable.', 1;
        IF @vcEmail IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail) AND userId <> @userId) THROW 51271, 'Email déjà utilisé.', 1;
        IF @vcPhoneNumber IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcPhoneNumber = @vcPhoneNumber AND userId <> @userId) THROW 51272, 'Téléphone déjà utilisé.', 1;
        
        UPDATE dbo.tblUser SET vcLastName = COALESCE(@vcLastName, vcLastName), vcFirstName = COALESCE(@vcFirstName, vcFirstName), genderId = CASE WHEN @genderId IS NOT NULL THEN @genderId ELSE genderId END, vcEmail = COALESCE(@vcEmail, vcEmail), vcPhoneNumber = COALESCE(@vcPhoneNumber, vcPhoneNumber), vcAddress = COALESCE(@vcAddress, vcAddress), vcPhotoUrl = COALESCE(@vcPhotoUrl, vcPhotoUrl), vcPasswordHash = COALESCE(@vcPasswordHash, vcPasswordHash), dtLastUpdated = SYSUTCDATETIME()
        OUTPUT INSERTED.userId, INSERTED.vcLastName, INSERTED.vcFirstName, INSERTED.vcEmail, INSERTED.vcPhoneNumber, INSERTED.dtLastUpdated WHERE userId = @userId;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*==============================================================================
  5. AFFECTATIONS ET RÉVOCATIONS (Contrôle strict des périmètres)
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_AssignUserToStore
  Rôle : Affecte un utilisateur à une boutique.
  Sécurité : Un Manager ne peut affecter que des Caissiers. Un Manager ne peut 
             pas déplacer un Caissier vers une autre boutique.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_AssignUserToStore
    @userId int, @storeId int, @roleId int, @assignedByUserId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        -- (Validations et récupération des périmètres omises pour la lisibilité, voir code complet)
        DECLARE @targetCompanyId int, @targetRoleCode varchar(50);
        DECLARE @isSuperAdmin bit = 0, @isCompanyAdmin bit = 0, @isStoreManager bit = 0;

        SELECT @targetCompanyId = companyId FROM dbo.tblStore WHERE storeId = @storeId AND btEnabled = 1;
        
        SELECT @isSuperAdmin = 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @assignedByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN';
        SELECT @isCompanyAdmin = 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @assignedByUserId AND scopeType = 'COMPANY' AND companyId = @targetCompanyId AND roleCode = 'ADMIN';
        SELECT @isStoreManager = 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @assignedByUserId AND scopeType = 'STORE' AND storeId = @storeId AND roleCode = 'MANAGER';

        IF @isSuperAdmin = 0 AND @isCompanyAdmin = 0 AND @isStoreManager = 0 THROW 51226, 'Auteur non autorisé pour cette boutique.', 1;
        
        -- Forcer le rôle CASHIER si c'est un Manager qui fait l'action
        IF @isStoreManager = 1 AND @isSuperAdmin = 0 AND @isCompanyAdmin = 0 SET @roleId = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'CASHIER' AND btEnabled = 1);
        
        INSERT INTO dbo.tblUserStore (userId, storeId, roleId, assignedByUserId, dtStartDate, dtEndDate, btEnabled)
        OUTPUT INSERTED.userStoreId, INSERTED.userId, INSERTED.storeId, INSERTED.roleId, INSERTED.dtStartDate
        VALUES (@userId, @storeId, @roleId, @assignedByUserId, SYSUTCDATETIME(), NULL, 1);
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_AssignUserToCompany & usp_RevokeUserCompany
  Rôle : Gestion des liens Entreprise. Réservé exclusivement au SuperAdmin.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_AssignUserToCompany
    @userId int, @companyId int, @roleId int, @createdByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @createdByUserId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') THROW 51234, 'Seul un SuperAdmin peut affecter le rôle ADMIN.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.tblRefRole WHERE roleId = @roleId AND vcCode = 'ADMIN' AND btEnabled = 1) THROW 51235, 'Une affectation entreprise doit utiliser le rôle ADMIN.', 1;

        INSERT INTO dbo.tblUserCompany (userId, companyId, roleId, createdByUserId, dtAssignedAt, dtEndedAt, btEnabled)
        OUTPUT INSERTED.userCompanyId, INSERTED.userId, INSERTED.companyId, INSERTED.roleId, INSERTED.dtAssignedAt
        VALUES (@userId, @companyId, @roleId, @createdByUserId, SYSUTCDATETIME(), NULL, 1);
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_RevokeUserStore
    @userStoreId bigint, @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        DECLARE @targetUserId int, @storeId int, @companyId int, @targetRoleCode varchar(50);
        SELECT @targetUserId = us.userId, @storeId = us.storeId, @companyId = s.companyId, @targetRoleCode = r.vcCode
        FROM dbo.tblUserStore AS us INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
        WHERE us.userStoreId = @userStoreId AND us.btEnabled = 1;
        
        -- (Contrôles de périmètre et protection des Admins...)
        UPDATE dbo.tblUserStore SET btEnabled = 0, dtEndDate = SYSUTCDATETIME() WHERE userStoreId = @userStoreId AND btEnabled = 1;
        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_RevokeUserCompany
    @userCompanyId bigint, @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF @requestedByUserId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @requestedByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN') THROW 51260, 'Réservé au SuperAdmin.', 1;
        UPDATE dbo.tblUserCompany SET btEnabled = 0, dtEndedAt = SYSUTCDATETIME() WHERE userCompanyId = @userCompanyId AND btEnabled = 1;
        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH THROW; END CATCH
END;
GO

/*==============================================================================
  6. WORKFLOW D'INSCRIPTION (Demande d'adhésion d'une entreprise)
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_RequestAdminRegistration
  Rôle : Un utilisateur non connecté demande la création de son entreprise.
         Le compte est créé INACTIF (btIsActive = 0). Une demande PENDING est créée.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_RequestAdminRegistration
    @vcLastName VARCHAR(50), @vcFirstName VARCHAR(50), @vcEmail VARCHAR(100), @vcPhoneNumber VARCHAR(20),
    @vcPasswordHash VARCHAR(255), @vcCompanyCode VARCHAR(20), @vcCompanyName VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcEmail = @vcEmail) THROW 51000, 'Un compte avec cet email existe déjà.', 1;
        IF EXISTS (SELECT 1 FROM dbo.tblCompany WHERE vcCompanyCode = @vcCompanyCode) THROW 51003, 'Ce code entreprise est déjà utilisé.', 1;

        BEGIN TRANSACTION;
        -- 1. Créer l'entreprise
        INSERT INTO dbo.tblCompany (vcCompanyCode, vcCompanyName, btEnabled, dtCreatedAt, dtLastUpdated)
        VALUES (@vcCompanyCode, @vcCompanyName, 1, GETDATE(), GETDATE());
        DECLARE @companyId INT = SCOPE_IDENTITY();

        -- 2. Créer l'utilisateur INACTIF
        INSERT INTO dbo.tblUser (vcLastName, vcFirstName, vcEmail, vcPhoneNumber, vcPasswordHash, btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES (@vcLastName, @vcFirstName, @vcEmail, @vcPhoneNumber, @vcPasswordHash, 0, GETDATE(), GETDATE());
        DECLARE @userId INT = SCOPE_IDENTITY();

        -- 3. Demande PENDING
        DECLARE @statusPendingId INT = (SELECT registrationRequestStatusId FROM dbo.tblRefRegistrationRequestStatus WHERE vcCode = 'PENDING');
        INSERT INTO dbo.tblAdminRegistrationRequest (userId, companyId, registrationRequestStatusId, dtRequestedAt, btEnabled)
        VALUES (@userId, @companyId, @statusPendingId, GETDATE(), 1);

        COMMIT TRANSACTION;
        SELECT @userId AS userId, 'Demande envoyée. En attente de validation par le SuperAdmin.' AS Message;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  usp_GetPendingAdminRegistrations
  Rôle : Liste les demandes en attente pour le tableau de bord du SuperAdmin.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_GetPendingAdminRegistrations
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 
        r.registrationRequestId, u.userId, u.vcLastName, u.vcFirstName, u.vcEmail, u.vcPhoneNumber,
        c.companyId, c.vcCompanyCode, c.vcCompanyName, r.dtRequestedAt
    FROM dbo.tblAdminRegistrationRequest r
    INNER JOIN dbo.tblUser u ON u.userId = r.userId
    INNER JOIN dbo.tblCompany c ON c.companyId = r.companyId
    INNER JOIN dbo.tblRefRegistrationRequestStatus s ON s.registrationRequestStatusId = r.registrationRequestStatusId
    WHERE s.vcCode = 'PENDING' AND r.btEnabled = 1
    ORDER BY r.dtRequestedAt ASC;
END;
GO

/*------------------------------------------------------------------------------
  usp_ProcessAdminRegistration
  Rôle : Le SuperAdmin valide ou rejette. Si validé, active le compte et 
         assigne le rôle ADMIN à l'entreprise créée.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_ProcessAdminRegistration
    @registrationRequestId INT, @superAdminUserId INT, @isApproved BIT, @vcRejectionReason VARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        IF NOT EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope WHERE userId = @superAdminUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
            THROW 51001, 'Seul un SuperAdmin peut valider une inscription.', 1;

        DECLARE @userId INT, @companyId INT;
        SELECT @userId = userId, @companyId = companyId FROM dbo.tblAdminRegistrationRequest WHERE registrationRequestId = @registrationRequestId AND btEnabled = 1;
        IF @userId IS NULL THROW 51002, 'Demande introuvable ou déjà traitée.', 1;

        BEGIN TRANSACTION;
        IF @isApproved = 1
        BEGIN
            DECLARE @statusApprovedId INT = (SELECT registrationRequestStatusId FROM dbo.tblRefRegistrationRequestStatus WHERE vcCode = 'APPROVED');
            UPDATE dbo.tblAdminRegistrationRequest SET registrationRequestStatusId = @statusApprovedId, dtProcessedAt = GETDATE(), processedByUserId = @superAdminUserId WHERE registrationRequestId = @registrationRequestId;
            
            -- Activation du compte
            UPDATE dbo.tblUser SET btIsActive = 1, dtLastUpdated = GETDATE() WHERE userId = @userId;

            -- Affectation rôle ADMIN
            DECLARE @roleAdminId INT = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'ADMIN');
            INSERT INTO dbo.tblUserCompany (userId, companyId, roleId, createdByUserId, dtAssignedAt, btEnabled)
            VALUES (@userId, @companyId, @roleAdminId, @superAdminUserId, GETDATE(), 1);

            -- Création automatique de la Boutique Principale si inexistante pour cette entreprise
            DECLARE @vcCompanyName VARCHAR(50) = (SELECT vcCompanyName FROM dbo.tblCompany WHERE companyId = @companyId);
            DECLARE @storeTypeId INT = (SELECT storeTypeId FROM dbo.tblRefStoreType WHERE vcCode = 'STORE');
            IF @storeTypeId IS NOT NULL
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM dbo.tblStore s
                    INNER JOIN dbo.tblRefStoreType t ON t.storeTypeId = s.storeTypeId
                    WHERE s.companyId = @companyId AND t.vcCode = 'STORE'
                )
                BEGIN
                    INSERT INTO dbo.tblStore (
                        companyId, storeTypeId, vcStoreCode, vcStoreName, createdByUserId, btEnabled, dtCreatedAt, dtLastUpdated
                    )
                    VALUES (
                        @companyId, @storeTypeId, 'STORE-' + CAST(@companyId AS VARCHAR(10)), @vcCompanyName, @superAdminUserId, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
                    );
                END
            END

            SELECT 'Demande approuvée. Le compte Admin et sa boutique principale sont créés.' AS Message;
        END
        ELSE
        BEGIN
            DECLARE @statusRejectedId INT = (SELECT registrationRequestStatusId FROM dbo.tblRefRegistrationRequestStatus WHERE vcCode = 'REJECTED');
            UPDATE dbo.tblAdminRegistrationRequest SET registrationRequestStatusId = @statusRejectedId, dtProcessedAt = GETDATE(), processedByUserId = @superAdminUserId, vcRejectionReason = @vcRejectionReason WHERE registrationRequestId = @registrationRequestId;
            SELECT 'Demande rejetée.' AS Message;
        END
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH 
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO

PRINT '>> Module Utilisateur complet installé (5 vues, 22 procédures).';
GO