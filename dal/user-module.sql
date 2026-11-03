/*
================================================================================
  MODULE UTILISATEUR — SQL Server (v2.0)
================================================================================
  Objet    : Gestion des utilisateurs, de leurs rôles et de leurs périmètres
             d'autorisation (SuperAdmin / Entreprise / Boutique).
  Prérequis: dbo.tblUser, dbo.tblRefGender, dbo.tblRefRole,
             dbo.tblUserCompany, dbo.tblCompany, dbo.tblUserStore, dbo.tblStore.
  Remarque : la colonne dbo.tblUser.btMustChangePassword est optionnelle.
             Les procédures qui la lisent ou l'écrivent adaptent leur requête
             dynamiquement selon sa présence.

--------------------------------------------------------------------------------
  ÉVOLUTIONS v2.0
--------------------------------------------------------------------------------
  1. vw_UserActiveAuthorizationScope : le SuperAdmin est désormais inclus même
   
  2. sp_SetUserActive             : ajout du contrôle de périmètre et de la
                                    protection contre l'auto-désactivation.
  3. sp_ListUsersByStore          : ajout du contrôle de périmètre via
                                    @requestedByUserId.
  4. sp_RevokeUserStore           : ajout du contrôle de périmètre et de la
                                    protection des comptes Admin / SuperAdmin.
  5. sp_CreateAdminBySuperAdmin   : nouvelle procédure, réservée au SuperAdmin.
  6. sp_CreateManagerByAdmin      : nouvelle procédure, ouverte au SuperAdmin
                                    et à l'Admin de l'entreprise cible.

--------------------------------------------------------------------------------
  PLAGES DE CODES D'ERREUR
--------------------------------------------------------------------------------
  51200-51205  Validation de base
  51220-51229  Affectation boutique
  51230-51239  Affectation entreprise
  51240-51249  Création caissier
  51260-51269  Opérations réservées au SuperAdmin
  51270-51279  Création Admin / Manager
  51280-51289  Contrôle de périmètre
================================================================================
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

/*==============================================================================
  1. VUES
==============================================================================*/

/*------------------------------------------------------------------------------
  1.1 vw_UserDetails
      Profil utilisateur enrichi du code et du libellé du genre,
      ainsi qu'un nom complet calculé.
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_UserDetails
AS
    SELECT
        u.userId,
        u.vcLastName,
        u.vcFirstName,
        LTRIM(RTRIM(u.vcLastName + N' ' + ISNULL(u.vcFirstName, N''))) AS vcFullName,
        u.genderId,
        g.vcCode        AS genderCode,
        g.vcGender,
        u.vcEmail,
        u.vcPhoneNumber,
        u.vcAddress,
        u.vcPhotoUrl,
        u.dtLastLoginAt,
        u.btIsActive,
        u.dtCreatedAt,
        u.dtLastUpdated
    FROM dbo.tblUser AS u
    LEFT JOIN dbo.tblRefGender AS g ON g.genderId = u.genderId;
GO

/*------------------------------------------------------------------------------
  1.2 vw_UserAssignmentContext
      Affectations actives d'un utilisateur, présentées sous un format
      normalisé unique pour les périmètres Entreprise et Boutique.
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_UserAssignmentContext
AS
    /* --- Affectations de type Entreprise --- */
    SELECT
        uc.userId,
        uc.userCompanyId AS assignmentId,
        CAST('COMPANY' AS varchar(10)) AS scopeType,
        uc.companyId,
        c.vcCompanyName,
        CAST(NULL AS int) AS storeId,
        CAST(NULL AS varchar(50)) AS vcStoreName,
        uc.roleId,
        r.vcCode AS roleCode,
        r.vcRole AS roleName,
        uc.dtAssignedAt AS assignedAt
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId
    WHERE uc.btEnabled = 1 AND uc.companyId IS NOT NULL

    UNION ALL

    /* --- Affectations de type Boutique --- */
    SELECT
        us.userId,
        us.userStoreId AS assignmentId,
        CAST('STORE' AS varchar(10)) AS scopeType,
        s.companyId,
        c.vcCompanyName,
        s.storeId,
        s.vcStoreName,
        us.roleId,
        r.vcCode AS roleCode,
        r.vcRole AS roleName,
        us.dtStartDate AS assignedAt
    FROM dbo.tblUserStore AS us
    INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = s.companyId
    WHERE us.btEnabled = 1;
GO

/*------------------------------------------------------------------------------
  1.3 vw_UserActiveAuthorizationScope
      Périmètres d'autorisation actifs, par niveau hiérarchique.

      Correction v2.0 : le périmètre GLOBAL (SuperAdmin) n'applique pas de
      filtre sur btIsActive. Un SuperAdmin demeure opérationnel même si son
      compte est marqué inactif (règle métier).
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_UserActiveAuthorizationScope
AS
    /* --- GLOBAL : SuperAdmin (exception métier : btIsActive non filtré) --- */
    SELECT
        uc.userId,
        CAST('GLOBAL' AS varchar(10)) AS scopeType,
        CAST(NULL AS int) AS companyId,
        CAST(NULL AS int) AS storeId,
        uc.roleId,
        r.vcCode AS roleCode,
        r.vcRole AS roleName
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    WHERE uc.btEnabled = 1
      AND uc.companyId IS NULL
      AND r.vcCode = 'SUPER_ADMIN'

    UNION ALL

    /* --- COMPANY : Admin d'entreprise (doit être actif) --- */
    SELECT
        uc.userId,
        CAST('COMPANY' AS varchar(10)) AS scopeType,
        uc.companyId,
        CAST(NULL AS int) AS storeId,
        uc.roleId,
        r.vcCode AS roleCode,
        r.vcRole AS roleName
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblUser AS u ON u.userId = uc.userId
    INNER JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    WHERE uc.btEnabled = 1
      AND uc.companyId IS NOT NULL
      AND u.btIsActive = 1
      AND c.btEnabled = 1
      AND r.vcCode = 'ADMIN'

    UNION ALL

    /* --- STORE : Manager ou Caissier (doivent être actifs) --- */
    SELECT
        us.userId,
        CAST('STORE' AS varchar(10)) AS scopeType,
        s.companyId,
        us.storeId,
        us.roleId,
        r.vcCode AS roleCode,
        r.vcRole AS roleName
    FROM dbo.tblUserStore AS us
    INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
    INNER JOIN dbo.tblCompany AS c ON c.companyId = s.companyId
    INNER JOIN dbo.tblUser AS u ON u.userId = us.userId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
    WHERE us.btEnabled = 1
      AND us.dtEndDate IS NULL
      AND u.btIsActive = 1
      AND s.btEnabled = 1
      AND c.btEnabled = 1
      AND r.vcCode IN ('MANAGER', 'CASHIER');
GO

/*------------------------------------------------------------------------------
  1.4 vw_UserStoreDetails
      Affectations utilisateur / boutique enrichies des informations
      utilisateur, boutique et rôle.
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_UserStoreDetails
AS
    SELECT
        us.userStoreId,
        us.userId,
        u.vcLastName,
        u.vcFirstName,
        u.vcEmail,
        u.vcPhoneNumber,
        us.storeId,
        s.vcStoreCode,
        s.vcStoreName,
        s.companyId,
        us.roleId,
        r.vcCode AS roleCode,
        r.vcRole AS roleName,
        us.assignedByUserId,
        us.dtStartDate,
        us.dtEndDate,
        us.btEnabled
    FROM dbo.tblUserStore AS us
    INNER JOIN dbo.tblUser AS u ON u.userId = us.userId
    INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId;
GO

/*------------------------------------------------------------------------------
  1.5 vw_UserCompanyDetails
      Affectations utilisateur / entreprise enrichies des informations
      utilisateur, entreprise et rôle.
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_UserCompanyDetails
AS
    SELECT
        uc.userCompanyId,
        uc.userId,
        u.vcLastName,
        u.vcFirstName,
        u.vcEmail,
        u.vcPhoneNumber,
        uc.companyId,
        c.vcCompanyCode,
        c.vcCompanyName,
        uc.roleId,
        r.vcCode AS roleCode,
        r.vcRole AS roleName,
        uc.createdByUserId,
        uc.dtAssignedAt,
        uc.dtEndedAt,
        uc.btEnabled
    FROM dbo.tblUserCompany AS uc
    INNER JOIN dbo.tblUser AS u ON u.userId = uc.userId
    INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
    LEFT JOIN dbo.tblCompany AS c ON c.companyId = uc.companyId;
GO

/*==============================================================================
  2. PROCÉDURES — CRÉATION DE BASE
==============================================================================*/

/*------------------------------------------------------------------------------
  2.1 sp_CreateUser
      Crée un utilisateur.
      Le hash du mot de passe est calculé en amont (bcrypt, côté Node.js).
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_CreateUser
    @vcLastName     varchar(50),
    @vcPasswordHash varchar(255),
    @genderId       int = NULL,
    @vcFirstName    varchar(50) = NULL,
    @vcEmail        varchar(100) = NULL,
    @vcPhoneNumber  varchar(20) = NULL,
    @vcAddress      varchar(150) = NULL,
    @vcPhotoUrl     varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- Validations métier --- */
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL
            THROW 51200, 'Le nom de famille est obligatoire.', 1;

        IF NULLIF(@vcPasswordHash, '') IS NULL
            THROW 51201, 'Le hash du mot de passe est obligatoire.', 1;

        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51202, 'Un email ou un numéro de téléphone est obligatoire.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51203, 'Le genre indiqué est introuvable.', 1;

        /* --- Insertion --- */
        INSERT INTO dbo.tblUser (
            vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
            vcPasswordHash, vcAddress, vcPhotoUrl, dtLastLoginAt,
            btIsActive, dtCreatedAt, dtLastUpdated
        )
        OUTPUT
            INSERTED.userId, INSERTED.vcLastName, INSERTED.vcFirstName,
            INSERTED.genderId, INSERTED.vcEmail, INSERTED.vcPhoneNumber,
            INSERTED.vcAddress, INSERTED.vcPhotoUrl,
            INSERTED.btIsActive, INSERTED.dtCreatedAt
        VALUES (
            LTRIM(RTRIM(@vcLastName)),
            NULLIF(LTRIM(RTRIM(@vcFirstName)), ''),
            @genderId,
            LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')),
            NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''),
            @vcPasswordHash,
            NULLIF(LTRIM(RTRIM(@vcAddress)), ''),
            NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''),
            NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*==============================================================================
  3. PROCÉDURES — CRÉATION AVEC RÔLE
==============================================================================*/

/*------------------------------------------------------------------------------
  3.1 sp_CreateAdminBySuperAdmin
      Réservée au SuperAdmin. Crée un compte Admin rattaché à une entreprise.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_CreateAdminBySuperAdmin
    @createdByUserId int,
    @companyId       int,
    @vcLastName      varchar(50),
    @vcPasswordHash  varchar(255),
    @vcFirstName     varchar(50) = NULL,
    @genderId        int = NULL,
    @vcEmail         varchar(100) = NULL,
    @vcPhoneNumber   varchar(20) = NULL,
    @vcAddress       varchar(150) = NULL,
    @vcPhotoUrl      varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- 1. Contrôle d'autorisation : l'appelant doit être SuperAdmin --- */
        IF @createdByUserId IS NULL
           OR NOT EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @createdByUserId
                  AND scopeType = 'GLOBAL'
                  AND roleCode = 'SUPER_ADMIN'
           )
            THROW 51260, 'Réservé au SuperAdmin.', 1;

        /* --- 2. Validations métier --- */
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL
            THROW 51200, 'Le nom est obligatoire.', 1;

        IF NULLIF(@vcPasswordHash, '') IS NULL
            THROW 51201, 'Le hash est obligatoire.', 1;

        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51202, 'Email ou téléphone obligatoire.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51203, 'Genre introuvable.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblCompany WHERE companyId = @companyId AND btEnabled = 1)
            THROW 51270, 'Entreprise introuvable ou inactive.', 1;

        IF @vcEmail IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail))
            THROW 51271, 'Email déjà utilisé.', 1;

        IF @vcPhoneNumber IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcPhoneNumber = @vcPhoneNumber)
            THROW 51272, 'Téléphone déjà utilisé.', 1;

        DECLARE @adminRoleId int =
            (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'ADMIN' AND btEnabled = 1);
        IF @adminRoleId IS NULL
            THROW 51273, 'Rôle ADMIN introuvable.', 1;

        /* --- 3. Création atomique de l'utilisateur et de son affectation --- */
        BEGIN TRANSACTION;

        DECLARE @newUserId int;

        INSERT INTO dbo.tblUser
            (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
             vcPasswordHash, vcAddress, vcPhotoUrl,
             btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES
            (LTRIM(RTRIM(@vcLastName)),
             NULLIF(LTRIM(RTRIM(@vcFirstName)), ''),
             @genderId,
             LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')),
             NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''),
             @vcPasswordHash,
             NULLIF(LTRIM(RTRIM(@vcAddress)), ''),
             NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''),
             1, SYSUTCDATETIME(), SYSUTCDATETIME());

        SET @newUserId = SCOPE_IDENTITY();

        INSERT INTO dbo.tblUserCompany
            (userId, companyId, roleId, createdByUserId,
             dtAssignedAt, dtEndedAt, btEnabled)
        VALUES
            (@newUserId, @companyId, @adminRoleId, @createdByUserId,
             SYSUTCDATETIME(), NULL, 1);

        COMMIT TRANSACTION;

        SELECT @newUserId AS userId, @companyId AS companyId,
               @adminRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() BETWEEN 50000 AND 59999 THROW;
        THROW 51299, N'sp_CreateAdminBySuperAdmin : échec technique.', 1;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  3.2 sp_CreateManagerByAdmin
      Ouverte au SuperAdmin ou à l'Admin de l'entreprise cible.
      Crée un compte Manager rattaché à une boutique.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_CreateManagerByAdmin
    @createdByUserId int,
    @storeId         int,
    @vcLastName      varchar(50),
    @vcPasswordHash  varchar(255),
    @vcFirstName     varchar(50) = NULL,
    @genderId        int = NULL,
    @vcEmail         varchar(100) = NULL,
    @vcPhoneNumber   varchar(20) = NULL,
    @vcAddress       varchar(150) = NULL,
    @vcPhotoUrl      varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- Validations métier --- */
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL
            THROW 51200, 'Le nom est obligatoire.', 1;

        IF NULLIF(@vcPasswordHash, '') IS NULL
            THROW 51201, 'Le hash est obligatoire.', 1;

        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51202, 'Email ou téléphone obligatoire.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51203, 'Genre introuvable.', 1;

        DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore
                                   WHERE storeId = @storeId AND btEnabled = 1);
        IF @companyId IS NULL
            THROW 51274, 'Boutique introuvable ou inactive.', 1;

        /* --- Contrôle d'autorisation : SuperAdmin ou Admin de l'entreprise --- */
        DECLARE @isSA bit = 0, @isAdmin bit = 0;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
            SET @isSA = 1;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'COMPANY'
                     AND companyId = @companyId
                     AND roleCode = 'ADMIN')
            SET @isAdmin = 1;

        IF @isSA = 0 AND @isAdmin = 0
            THROW 51275, 'Seul un SuperAdmin ou un Admin de cette entreprise peut créer un Manager.', 1;

        /* --- Unicité de l'identifiant --- */
        IF @vcEmail IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail))
            THROW 51271, 'Email déjà utilisé.', 1;

        IF @vcPhoneNumber IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcPhoneNumber = @vcPhoneNumber)
            THROW 51272, 'Téléphone déjà utilisé.', 1;

        DECLARE @managerRoleId int =
            (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'MANAGER' AND btEnabled = 1);
        IF @managerRoleId IS NULL
            THROW 51276, 'Rôle MANAGER introuvable.', 1;

        /* --- Création atomique --- */
        BEGIN TRANSACTION;

        DECLARE @newUserId int;

        INSERT INTO dbo.tblUser
            (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
             vcPasswordHash, vcAddress, vcPhotoUrl,
             btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES
            (LTRIM(RTRIM(@vcLastName)),
             NULLIF(LTRIM(RTRIM(@vcFirstName)), ''),
             @genderId,
             LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')),
             NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''),
             @vcPasswordHash,
             NULLIF(LTRIM(RTRIM(@vcAddress)), ''),
             NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''),
             1, SYSUTCDATETIME(), SYSUTCDATETIME());

        SET @newUserId = SCOPE_IDENTITY();

        INSERT INTO dbo.tblUserStore
            (userId, storeId, roleId, assignedByUserId,
             dtStartDate, dtEndDate, btEnabled)
        VALUES
            (@newUserId, @storeId, @managerRoleId, @createdByUserId,
             SYSUTCDATETIME(), NULL, 1);

        COMMIT TRANSACTION;

        SELECT @newUserId AS userId, @storeId AS storeId,
               @managerRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() BETWEEN 50000 AND 59999 THROW;
        THROW 51299, N'sp_CreateManagerByAdmin : échec technique.', 1;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  3.3 sp_CreateCashierForManager
      Ouverte au SuperAdmin, à l'Admin de l'entreprise ou au Manager de la
      boutique. Crée un compte Caissier rattaché à la boutique.
      Un Manager peut créer plusieurs Caissiers.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_CreateCashierForManager
    @createdByUserId int,
    @storeId         int,
    @vcLastName      varchar(50),
    @vcPasswordHash  varchar(255),
    @genderId        int = NULL,
    @vcFirstName     varchar(50) = NULL,
    @vcEmail         varchar(100) = NULL,
    @vcPhoneNumber   varchar(20) = NULL,
    @vcAddress       varchar(150) = NULL,
    @vcPhotoUrl      varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- Validations métier --- */
        IF NULLIF(LTRIM(RTRIM(@vcLastName)), '') IS NULL
            THROW 51240, 'Le nom de famille est obligatoire.', 1;

        IF NULLIF(@vcPasswordHash, '') IS NULL
            THROW 51241, 'Le hash du mot de passe est obligatoire.', 1;

        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51242, 'Un email ou un numéro de téléphone est obligatoire.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51243, 'Le genre indiqué est introuvable.', 1;

        DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore
                                   WHERE storeId = @storeId AND btEnabled = 1);
        IF @companyId IS NULL
            THROW 51244, 'Boutique introuvable ou inactive.', 1;

        /* --- Contrôle d'autorisation : SA, Admin de l'entreprise ou Manager --- */
        DECLARE @isSA bit = 0, @isAdmin bit = 0, @isMgr bit = 0;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
            SET @isSA = 1;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'COMPANY'
                     AND companyId = @companyId
                     AND roleCode = 'ADMIN')
            SET @isAdmin = 1;

        IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                   WHERE userId = @createdByUserId
                     AND scopeType = 'STORE'
                     AND storeId = @storeId
                     AND roleCode = 'MANAGER')
            SET @isMgr = 1;

        IF @isSA = 0 AND @isAdmin = 0 AND @isMgr = 0
            THROW 51245, 'Vous n''êtes pas autorisé à créer un caissier dans cette boutique.', 1;

        /* --- Unicité de l'identifiant --- */
        IF @vcEmail IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE LOWER(vcEmail) = LOWER(@vcEmail))
            THROW 51271, 'Email déjà utilisé.', 1;

        IF @vcPhoneNumber IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser WHERE vcPhoneNumber = @vcPhoneNumber)
            THROW 51272, 'Téléphone déjà utilisé.', 1;

        DECLARE @cashierRoleId int =
            (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'CASHIER' AND btEnabled = 1);
        IF @cashierRoleId IS NULL
            THROW 51246, 'Le rôle CASHIER est introuvable ou inactif.', 1;

        /* --- Création atomique --- */
        BEGIN TRANSACTION;

        DECLARE @newUserId int;

        INSERT INTO dbo.tblUser
            (vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
             vcPasswordHash, vcAddress, vcPhotoUrl,
             btIsActive, dtCreatedAt, dtLastUpdated)
        VALUES
            (LTRIM(RTRIM(@vcLastName)),
             NULLIF(LTRIM(RTRIM(@vcFirstName)), ''),
             @genderId,
             LOWER(NULLIF(LTRIM(RTRIM(@vcEmail)), '')),
             NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), ''),
             @vcPasswordHash,
             NULLIF(LTRIM(RTRIM(@vcAddress)), ''),
             NULLIF(LTRIM(RTRIM(@vcPhotoUrl)), ''),
             1, SYSUTCDATETIME(), SYSUTCDATETIME());

        SET @newUserId = SCOPE_IDENTITY();

        INSERT INTO dbo.tblUserStore
            (userId, storeId, roleId, assignedByUserId,
             dtStartDate, dtEndDate, btEnabled)
        VALUES
            (@newUserId, @storeId, @cashierRoleId, @createdByUserId,
             SYSUTCDATETIME(), NULL, 1);

        COMMIT TRANSACTION;

        SELECT @newUserId AS userId, @storeId AS storeId,
               @cashierRoleId AS roleId, 1 AS rowsAffected;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() BETWEEN 50000 AND 59999 THROW;
        THROW 51299, N'sp_CreateCashierForManager : échec technique.', 1;
    END CATCH
END;
GO

/*==============================================================================
  4. AUTHENTIFICATION
==============================================================================*/

/*------------------------------------------------------------------------------
  4.1 sp_FindUserByLoginIdentifier
      Recherche un utilisateur par email ou téléphone et retourne le hash.
      Le SuperAdmin inactif est reconnu : la vue
      vw_UserActiveAuthorizationScope ne filtre pas sur btIsActive pour GLOBAL.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_FindUserByLoginIdentifier
    @vcEmail       varchar(100),
    @vcPhoneNumber varchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF NULLIF(LTRIM(RTRIM(@vcEmail)), '') IS NULL
           AND NULLIF(LTRIM(RTRIM(@vcPhoneNumber)), '') IS NULL
            THROW 51204, 'L''identifiant email ou téléphone est obligatoire.', 1;

        /* Variante avec colonne optionnelle btMustChangePassword */
        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql
                N'SELECT TOP (1)
                    u.userId, u.vcLastName, u.vcFirstName, u.genderId,
                    u.vcEmail, u.vcPhoneNumber, u.vcPasswordHash,
                    u.vcAddress, u.vcPhotoUrl, u.btIsActive, u.dtCreatedAt,
                    CAST(ISNULL(u.btMustChangePassword, 0) AS bit) AS mustChangePassword
                  FROM dbo.tblUser AS u
                  WHERE (LOWER(u.vcEmail) = LOWER(@email) OR u.vcPhoneNumber = @phone)
                    AND EXISTS (
                        SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope AS a
                        WHERE a.userId = u.userId
                    );',
                N'@email varchar(100), @phone varchar(20)',
                @email = @vcEmail, @phone = @vcPhoneNumber;
        END
        ELSE
        BEGIN
            /* Variante sans la colonne optionnelle */
            SELECT TOP (1)
                u.userId, u.vcLastName, u.vcFirstName, u.genderId,
                u.vcEmail, u.vcPhoneNumber, u.vcPasswordHash,
                u.vcAddress, u.vcPhotoUrl, u.btIsActive, u.dtCreatedAt,
                CAST(CASE WHEN u.dtLastLoginAt IS NULL THEN 1 ELSE 0 END AS bit) AS mustChangePassword
            FROM dbo.tblUser AS u
            WHERE (LOWER(u.vcEmail) = LOWER(@vcEmail) OR u.vcPhoneNumber = @vcPhoneNumber)
              AND EXISTS (
                    SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope AS a
                    WHERE a.userId = u.userId
              );
        END;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  4.2 sp_GetUserById
      Retourne un utilisateur par son identifiant, sans exposer le hash.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_GetUserById
    @userId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql
                N'SELECT
                    userId, vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
                    vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt,
                    dtLastUpdated, CAST(ISNULL(btMustChangePassword, 0) AS bit) AS mustChangePassword
                  FROM dbo.tblUser WHERE userId = @id;',
                N'@id int', @id = @userId;
        END
        ELSE
        BEGIN
            SELECT
                userId, vcLastName, vcFirstName, genderId, vcEmail, vcPhoneNumber,
                vcAddress, vcPhotoUrl, dtLastLoginAt, btIsActive, dtCreatedAt,
                dtLastUpdated,
                CAST(CASE WHEN dtLastLoginAt IS NULL THEN 1 ELSE 0 END AS bit) AS mustChangePassword
            FROM dbo.tblUser
            WHERE userId = @userId;
        END;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  4.3 sp_SetMustChangePassword
      Positionne le drapeau de changement obligatoire du mot de passe,
      si la colonne optionnelle existe.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_SetMustChangePassword
    @userId int,
    @required bit
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        DECLARE @rowsAffected int = 0;

        IF COL_LENGTH('dbo.tblUser', 'btMustChangePassword') IS NOT NULL
        BEGIN
            EXEC sys.sp_executesql
                N'UPDATE dbo.tblUser
                  SET btMustChangePassword = @flag, dtLastUpdated = SYSUTCDATETIME()
                  WHERE userId = @id;
                  SET @rows = @@ROWCOUNT;',
                N'@id int, @flag bit, @rows int OUTPUT',
                @id = @userId, @flag = @required, @rows = @rowsAffected OUTPUT;
        END;

        SELECT @rowsAffected AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  4.4 sp_GetUserContext
      Retourne trois jeux de résultats :
        1. les affectations entreprise,
        2. les affectations boutique,
        3. le rôle global éventuel.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_GetUserContext
    @userId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        /* Jeu 1 : entreprises */
        SELECT
            assignmentId AS userCompanyId, companyId, vcCompanyName,
            roleId, roleCode AS companyRoleCode
        FROM dbo.vw_UserAssignmentContext
        WHERE userId = @userId AND scopeType = 'COMPANY'
        ORDER BY assignedAt;

        /* Jeu 2 : boutiques */
        SELECT
            assignmentId AS userStoreId, storeId, vcStoreName, companyId,
            roleId, roleCode AS storeRoleCode
        FROM dbo.vw_UserAssignmentContext
        WHERE userId = @userId AND scopeType = 'STORE'
        ORDER BY assignedAt;

        /* Jeu 3 : rôle global */
        SELECT TOP (1) r.roleId, r.vcCode AS globalRoleCode
        FROM dbo.tblUserCompany AS uc
        INNER JOIN dbo.tblRefRole AS r ON r.roleId = uc.roleId
        WHERE uc.userId = @userId AND uc.companyId IS NULL
          AND uc.btEnabled = 1 AND r.vcCode = 'SUPER_ADMIN';
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  4.5 sp_UpdateUserLastLogin
      Enregistre la date de dernière connexion en UTC.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_UpdateUserLastLogin
    @userId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        UPDATE dbo.tblUser
        SET dtLastLoginAt = SYSUTCDATETIME(),
            dtLastUpdated = SYSUTCDATETIME()
        WHERE userId = @userId;

        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*==============================================================================
  5. ACTIVATION / DÉSACTIVATION
==============================================================================*/

/*------------------------------------------------------------------------------
  5.1 sp_SetUserActive
      Active ou désactive un compte utilisateur.

      Contrôles :
        - interdiction d'auto-désactivation,
        - protection du compte SuperAdmin : seul un SuperAdmin peut le
          désactiver.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_SetUserActive
    @userId            int,
    @btIsActive        bit,
    @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        /* Anti auto-désactivation */
        IF @requestedByUserId IS NOT NULL
           AND @requestedByUserId = @userId
           AND @btIsActive = 0
            THROW 51280, 'Auto-désactivation interdite.', 1;

        /* Protection du compte SuperAdmin */
        IF @btIsActive = 0
           AND EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @userId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN'
           )
           AND (@requestedByUserId IS NULL
                OR NOT EXISTS (
                    SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                    WHERE userId = @requestedByUserId
                      AND scopeType = 'GLOBAL'
                      AND roleCode = 'SUPER_ADMIN'
                ))
            THROW 51281, 'Compte SuperAdmin protégé.', 1;

        UPDATE dbo.tblUser
        SET btIsActive = @btIsActive,
            dtLastUpdated = SYSUTCDATETIME()
        OUTPUT INSERTED.userId, INSERTED.vcEmail, INSERTED.btIsActive
        WHERE userId = @userId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*==============================================================================
  6. MODIFICATION
==============================================================================*/

/*------------------------------------------------------------------------------
  6.1 sp_UpdateUser
      Mise à jour partielle d'un utilisateur : seuls les champs fournis
      (non NULL) sont modifiés.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_UpdateUser
    @userId         int,
    @vcLastName     varchar(50) = NULL,
    @vcFirstName    varchar(50) = NULL,
    @genderId       int = NULL,
    @vcEmail        varchar(100) = NULL,
    @vcPhoneNumber  varchar(20) = NULL,
    @vcAddress      varchar(150) = NULL,
    @vcPhotoUrl     varchar(255) = NULL,
    @vcPasswordHash varchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51205, 'userId est obligatoire et doit être positif.', 1;

        IF @genderId IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.tblRefGender WHERE genderId = @genderId)
            THROW 51203, 'Le genre indiqué est introuvable.', 1;

        IF @vcEmail IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser
                       WHERE LOWER(vcEmail) = LOWER(@vcEmail) AND userId <> @userId)
            THROW 51271, 'Email déjà utilisé.', 1;

        IF @vcPhoneNumber IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.tblUser
                       WHERE vcPhoneNumber = @vcPhoneNumber AND userId <> @userId)
            THROW 51272, 'Téléphone déjà utilisé.', 1;

        UPDATE dbo.tblUser
        SET vcLastName     = COALESCE(@vcLastName, vcLastName),
            vcFirstName    = COALESCE(@vcFirstName, vcFirstName),
            genderId       = CASE WHEN @genderId IS NOT NULL THEN @genderId ELSE genderId END,
            vcEmail        = COALESCE(@vcEmail, vcEmail),
            vcPhoneNumber  = COALESCE(@vcPhoneNumber, vcPhoneNumber),
            vcAddress      = COALESCE(@vcAddress, vcAddress),
            vcPhotoUrl     = COALESCE(@vcPhotoUrl, vcPhotoUrl),
            vcPasswordHash = COALESCE(@vcPasswordHash, vcPasswordHash),
            dtLastUpdated  = SYSUTCDATETIME()
        OUTPUT INSERTED.userId, INSERTED.vcLastName, INSERTED.vcFirstName,
               INSERTED.vcEmail, INSERTED.vcPhoneNumber, INSERTED.dtLastUpdated
        WHERE userId = @userId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*==============================================================================
  7. AFFECTATIONS
==============================================================================*/

/*------------------------------------------------------------------------------
  7.1 sp_AssignUserToStore
      Affecte un utilisateur à une boutique.

      Autorisation : SuperAdmin, Admin de l'entreprise, ou Manager de la
      boutique. Un Manager ne peut affecter que des Caissiers.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_AssignUserToStore
    @userId           int,
    @storeId          int,
    @roleId           int,
    @assignedByUserId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        /* --- Validations d'entrée --- */
        IF @userId IS NULL OR @userId <= 0
            THROW 51220, 'userId est obligatoire et doit être positif.', 1;
        IF @storeId IS NULL OR @storeId <= 0
            THROW 51221, 'storeId est obligatoire et doit être positif.', 1;
        IF @roleId IS NULL OR @roleId <= 0
            THROW 51222, 'roleId est obligatoire et doit être positif.', 1;
        IF @assignedByUserId IS NULL OR @assignedByUserId <= 0
            THROW 51223, 'assignedByUserId est obligatoire et doit être positif.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblUser WHERE userId = @userId AND btIsActive = 1)
            THROW 51220, 'Utilisateur cible introuvable ou inactif.', 1;

        DECLARE @targetCompanyId int;
        DECLARE @targetRoleCode varchar(50);
        DECLARE @isSuperAdmin bit = 0;
        DECLARE @isCompanyAdmin bit = 0;
        DECLARE @isStoreManager bit = 0;

        SELECT @targetCompanyId = companyId
        FROM dbo.tblStore
        WHERE storeId = @storeId AND btEnabled = 1;
        IF @targetCompanyId IS NULL
            THROW 51221, 'Boutique introuvable ou inactive.', 1;

        /* --- Détermination du périmètre de l'auteur --- */
        SELECT @isSuperAdmin = 1
        FROM dbo.vw_UserActiveAuthorizationScope
        WHERE userId = @assignedByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN';

        SELECT @isCompanyAdmin = 1
        FROM dbo.vw_UserActiveAuthorizationScope
        WHERE userId = @assignedByUserId AND scopeType = 'COMPANY'
          AND companyId = @targetCompanyId AND roleCode = 'ADMIN';

        SELECT @isStoreManager = 1
        FROM dbo.vw_UserActiveAuthorizationScope
        WHERE userId = @assignedByUserId AND scopeType = 'STORE'
          AND storeId = @storeId AND roleCode = 'MANAGER';

        IF @isSuperAdmin = 0 AND @isCompanyAdmin = 0 AND @isStoreManager = 0
            THROW 51226, 'Auteur non autorisé pour cette boutique.', 1;

        /* Un Manager ne peut affecter que le rôle CASHIER */
        IF @isStoreManager = 1 AND @isSuperAdmin = 0 AND @isCompanyAdmin = 0
            SET @roleId = (SELECT roleId FROM dbo.tblRefRole WHERE vcCode = 'CASHIER' AND btEnabled = 1);

        /* Validation du rôle cible */
        SELECT @targetRoleCode = vcCode
        FROM dbo.tblRefRole
        WHERE roleId = @roleId AND btEnabled = 1;
        IF @targetRoleCode IS NULL OR @targetRoleCode NOT IN ('MANAGER', 'CASHIER')
            THROW 51225, 'Seuls les rôles MANAGER et CASHIER peuvent être affectés à une boutique.', 1;

        /* Protection : impossible de modifier un compte SuperAdmin ou Admin */
        IF (@isCompanyAdmin = 1 OR @isStoreManager = 1)
           AND EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @userId AND roleCode IN ('SUPER_ADMIN', 'ADMIN')
           )
            THROW 51229, 'Impossible de modifier un compte SuperAdmin ou Admin.', 1;

        /* Restrictions spécifiques au Manager */
        IF @isStoreManager = 1 AND @isSuperAdmin = 0 AND @isCompanyAdmin = 0
        BEGIN
            IF EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @userId AND roleCode = 'MANAGER'
            )
                THROW 51227, 'Un gérant ne peut gérer que des comptes caissier.', 1;

            IF EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @userId AND scopeType = 'STORE'
                  AND roleCode = 'CASHIER' AND storeId <> @storeId
            )
                THROW 51228, 'Un gérant ne peut pas déplacer un caissier vers une autre boutique.', 1;
        END;

        /* --- Insertion de l'affectation --- */
        INSERT INTO dbo.tblUserStore (
            userId, storeId, roleId, assignedByUserId,
            dtStartDate, dtEndDate, btEnabled
        )
        OUTPUT
            INSERTED.userStoreId, INSERTED.userId, INSERTED.storeId,
            INSERTED.roleId, INSERTED.dtStartDate
        VALUES (
            @userId, @storeId, @roleId, @assignedByUserId,
            SYSUTCDATETIME(), NULL, 1
        );
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  7.2 sp_AssignUserToCompany
      Affecte un rôle à un utilisateur dans une entreprise.
      Réservée au SuperAdmin (création de compte Admin).
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_AssignUserToCompany
    @userId          int,
    @companyId       int,
    @roleId          int,
    @createdByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51230, 'userId est obligatoire et doit être positif.', 1;
        IF @companyId IS NULL OR @companyId <= 0
            THROW 51231, 'companyId est obligatoire et doit être positif.', 1;
        IF @roleId IS NULL OR @roleId <= 0
            THROW 51232, 'roleId est obligatoire et doit être positif.', 1;

        /* Contrôle d'autorisation : SuperAdmin uniquement */
        IF @createdByUserId IS NULL OR NOT EXISTS (
            SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
            WHERE userId = @createdByUserId AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN'
        )
            THROW 51234, 'Seul un SuperAdmin peut affecter le rôle ADMIN.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblRefRole WHERE roleId = @roleId AND vcCode = 'ADMIN' AND btEnabled = 1)
            THROW 51235, 'Une affectation entreprise doit utiliser le rôle ADMIN.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.tblUser WHERE userId = @userId AND btIsActive = 1)
            THROW 51230, 'Utilisateur cible introuvable ou inactif.', 1;

        INSERT INTO dbo.tblUserCompany (
            userId, companyId, roleId, createdByUserId,
            dtAssignedAt, dtEndedAt, btEnabled
        )
        OUTPUT
            INSERTED.userCompanyId, INSERTED.userId, INSERTED.companyId,
            INSERTED.roleId, INSERTED.dtAssignedAt
        VALUES (
            @userId, @companyId, @roleId, @createdByUserId,
            SYSUTCDATETIME(), NULL, 1
        );
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*==============================================================================
  8. LISTINGS AVEC CONTRÔLE DE PÉRIMÈTRE
==============================================================================*/

/*------------------------------------------------------------------------------
  8.1 sp_ListUsersByStore
      Liste les utilisateurs affectés à une boutique.
      Si @requestedByUserId est fourni, un contrôle de périmètre garantit
      que l'appelant est habilité à consulter cette boutique.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_ListUsersByStore
    @storeId           int,
    @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @storeId IS NULL OR @storeId <= 0
            THROW 51221, 'storeId est obligatoire et doit être positif.', 1;

        /* --- Contrôle de périmètre --- */
        IF @requestedByUserId IS NOT NULL
        BEGIN
            DECLARE @companyId int = (SELECT companyId FROM dbo.tblStore WHERE storeId = @storeId);
            DECLARE @canAccess bit = 0;

            /* SuperAdmin : accès total */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
                SET @canAccess = 1;

            /* Admin de l'entreprise propriétaire */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'COMPANY'
                         AND companyId = @companyId
                         AND roleCode = 'ADMIN')
                SET @canAccess = 1;

            /* Manager ou Caissier affecté à cette boutique */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'STORE'
                         AND storeId = @storeId
                         AND roleCode IN ('MANAGER', 'CASHIER'))
                SET @canAccess = 1;

            IF @canAccess = 0
                THROW 51282, 'Accès refusé à cette boutique.', 1;
        END;

        SELECT
            userStoreId, userId, vcLastName, vcFirstName, vcEmail,
            vcPhoneNumber, roleId, roleCode, roleName, dtStartDate
        FROM dbo.vw_UserStoreDetails
        WHERE storeId = @storeId AND btEnabled = 1
        ORDER BY vcLastName, vcFirstName;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  8.2 sp_GetStoresByUserId
      Liste les boutiques auxquelles un utilisateur est activement affecté.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_GetStoresByUserId
    @userId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51220, 'userId est obligatoire et doit être positif.', 1;

        SELECT
            userStoreId, storeId, vcStoreCode, vcStoreName, companyId,
            roleId, roleCode, roleName, dtStartDate
        FROM dbo.vw_UserStoreDetails
        WHERE userId = @userId AND btEnabled = 1
        ORDER BY dtStartDate, vcStoreName;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  8.3 sp_GetUserCompanyRoles
      Liste les rôles actifs d'un utilisateur dans une entreprise donnée.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_GetUserCompanyRoles
    @userId int,
    @companyId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userId IS NULL OR @userId <= 0
            THROW 51230, 'userId est obligatoire et doit être positif.', 1;
        IF @companyId IS NULL OR @companyId <= 0
            THROW 51231, 'companyId est obligatoire et doit être positif.', 1;

        SELECT userCompanyId, roleId, roleCode, roleName, dtAssignedAt
        FROM dbo.vw_UserCompanyDetails
        WHERE userId = @userId AND companyId = @companyId AND btEnabled = 1
        ORDER BY dtAssignedAt;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  8.4 sp_ListUsersByCompany
      Liste les utilisateurs ayant une affectation active dans une entreprise.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_ListUsersByCompany
    @companyId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @companyId IS NULL OR @companyId <= 0
            THROW 51231, 'companyId est obligatoire et doit être positif.', 1;

        SELECT
            userCompanyId, userId, vcLastName, vcFirstName, vcEmail,
            vcPhoneNumber, roleId, roleCode, roleName, dtAssignedAt
        FROM dbo.vw_UserCompanyDetails
        WHERE companyId = @companyId AND btEnabled = 1
        ORDER BY vcLastName, vcFirstName;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*==============================================================================
  9. RÉVOCATIONS AVEC CONTRÔLE DE PÉRIMÈTRE
==============================================================================*/

/*------------------------------------------------------------------------------
  9.1 sp_RevokeUserStore
      Révoque une affectation utilisateur / boutique.
      Contrôle de périmètre et protection des comptes Admin / SuperAdmin.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_RevokeUserStore
    @userStoreId       bigint,
    @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userStoreId IS NULL OR @userStoreId <= 0
            THROW 51224, 'userStoreId est obligatoire et doit être positif.', 1;

        /* --- Récupération des informations sur la cible --- */
        DECLARE @targetUserId int, @storeId int, @companyId int, @targetRoleCode varchar(50);

        SELECT
            @targetUserId   = us.userId,
            @storeId        = us.storeId,
            @companyId      = s.companyId,
            @targetRoleCode = r.vcCode
        FROM dbo.tblUserStore AS us
        INNER JOIN dbo.tblStore AS s ON s.storeId = us.storeId
        INNER JOIN dbo.tblRefRole AS r ON r.roleId = us.roleId
        WHERE us.userStoreId = @userStoreId AND us.btEnabled = 1;

        IF @targetUserId IS NULL
            THROW 51224, 'Affectation introuvable ou déjà révoquée.', 1;

        /* --- Protection des comptes Admin / SuperAdmin --- */
        IF @requestedByUserId IS NOT NULL
           AND EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @targetUserId
                  AND roleCode IN ('SUPER_ADMIN', 'ADMIN')
           )
           AND NOT EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @requestedByUserId
                  AND scopeType = 'GLOBAL'
                  AND roleCode = 'SUPER_ADMIN'
           )
            THROW 51285, 'Impossible de révoquer un compte protégé.', 1;

        /* --- Contrôle de périmètre --- */
        IF @requestedByUserId IS NOT NULL
        BEGIN
            DECLARE @canRevoke bit = 0;

            /* SuperAdmin : accès total */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'GLOBAL' AND roleCode = 'SUPER_ADMIN')
                SET @canRevoke = 1;

            /* Admin de l'entreprise */
            IF EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                       WHERE userId = @requestedByUserId
                         AND scopeType = 'COMPANY'
                         AND companyId = @companyId
                         AND roleCode = 'ADMIN')
                SET @canRevoke = 1;

            /* Manager de la boutique : uniquement sur un Caissier */
            IF @targetRoleCode = 'CASHIER'
               AND EXISTS (SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                           WHERE userId = @requestedByUserId
                             AND scopeType = 'STORE'
                             AND storeId = @storeId
                             AND roleCode = 'MANAGER')
                SET @canRevoke = 1;

            IF @canRevoke = 0
                THROW 51286, 'Vous n''êtes pas autorisé à révoquer cette affectation.', 1;
        END;

        UPDATE dbo.tblUserStore
        SET btEnabled = 0,
            dtEndDate = SYSUTCDATETIME()
        WHERE userStoreId = @userStoreId AND btEnabled = 1;

        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

/*------------------------------------------------------------------------------
  9.2 sp_RevokeUserCompany
      Révoque une affectation utilisateur / entreprise.
      Réservée au SuperAdmin.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.sp_RevokeUserCompany
    @userCompanyId     bigint,
    @requestedByUserId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF @userCompanyId IS NULL OR @userCompanyId <= 0
            THROW 51233, 'userCompanyId est obligatoire et doit être positif.', 1;

        /* Contrôle d'autorisation : SuperAdmin uniquement */
        IF @requestedByUserId IS NULL
           OR NOT EXISTS (
                SELECT 1 FROM dbo.vw_UserActiveAuthorizationScope
                WHERE userId = @requestedByUserId
                  AND scopeType = 'GLOBAL'
                  AND roleCode = 'SUPER_ADMIN'
           )
            THROW 51260, 'Réservé au SuperAdmin.', 1;

        UPDATE dbo.tblUserCompany
        SET btEnabled = 0,
            dtEndedAt = SYSUTCDATETIME()
        WHERE userCompanyId = @userCompanyId AND btEnabled = 1;

        SELECT @@ROWCOUNT AS rowsAffected;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

PRINT '>> Module Utilisateur v2.0 installé (5 vues, 19 procédures).';
GO