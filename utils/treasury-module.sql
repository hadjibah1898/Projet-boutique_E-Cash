/*
================================================================================
  MODULE TRÉSORERIE — SQL Server (v1.0)
================================================================================
  Description : Gestion des comptes de trésorerie (caisses, banques, mobile money)
                et enregistrement des mouvements financiers (entrées/sorties).
                
  Règles métier fondamentales :
    - Chaque compte appartient à une entreprise (et optionnellement à une boutique).
    - Les soldes sont mis à jour de manière atomique (Transaction SQL).
    - Le sens du mouvement (Entrée = +1, Sortie = -1) est dicté par la table de référence.
    - Les opérations sont sécurisées par un verrou (UPDLOCK, HOLDLOCK) pour éviter 
      les conflits si deux caissiers valident en même temps.

  Dépendances : dbo.tblTreasuryAccount, dbo.tblTreasuryMovement,
                dbo.tblRefTreasuryAccountType, dbo.tblRefTreasuryMovementType,
                dbo.tblUser.
================================================================================
*/

USE GestionsBoutiques;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*==============================================================================
  1. VUES (Lecture et dénormalisation pour l'API)
==============================================================================*/

/*------------------------------------------------------------------------------
  vw_TreasuryAccountDetails
  Rôle : Retourne les comptes de trésorerie en incluant le libellé de leur type
         (ex: 'Caisse centrale', 'Orange Money') pour faciliter l'affichage Frontend.
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_TreasuryAccountDetails
AS
	SELECT
		a.treasuryAccountId,
		a.companyId,
		a.storeId,
		a.treasuryAccountTypeId,
		t.vcCode AS typeCode,
		t.vcTreasuryAccountType,
		a.vcAccountName,
		a.mCurrentBalance,
		a.btEnabled,
		a.dtCreatedAt,
		a.dtLastUpdated
	FROM dbo.tblTreasuryAccount AS a
	INNER JOIN dbo.tblRefTreasuryAccountType AS t
		ON t.treasuryAccountTypeId = a.treasuryAccountTypeId;
GO

/*------------------------------------------------------------------------------
  vw_TreasuryMovementDetails
  Rôle : Historique des mouvements enrichi avec le type de mouvement, 
         la direction (+1/-1) et le nom complet de l'opérateur.
------------------------------------------------------------------------------*/
CREATE OR ALTER VIEW dbo.vw_TreasuryMovementDetails
AS
	SELECT
		m.treasuryMovementId,
		m.treasuryAccountId,
		a.companyId,
		a.storeId,
		m.treasuryMovementTypeId,
		t.vcCode AS typeCode,
		t.vcTreasuryMovementType,
		t.direction,
		m.cashReportId,
		m.mAmount,
		m.mBalanceBefore,
		m.mBalanceAfter,
		m.vcDescription,
		m.OperatedByUserId,
		LTRIM(RTRIM(COALESCE(u.vcLastName, '') + ' ' + COALESCE(u.vcFirstName, ''))) AS operatedByName,
		m.btEnabled,
		m.dtCreatedAt,
		m.dtLastUpdated
	FROM dbo.tblTreasuryMovement AS m
	INNER JOIN dbo.tblTreasuryAccount AS a ON a.treasuryAccountId = m.treasuryAccountId
	INNER JOIN dbo.tblRefTreasuryMovementType AS t
		ON t.treasuryMovementTypeId = m.treasuryMovementTypeId
	INNER JOIN dbo.tblUser AS u ON u.userId = m.OperatedByUserId;
GO

/*==============================================================================
  2. PROCÉDURES STOCKÉES (Logique métier)
==============================================================================*/

/*------------------------------------------------------------------------------
  usp_CreateTreasuryAccount
  Rôle : Crée un nouveau compte de trésorerie.
  Sécurité : Vérifie que le type de compte demandé existe bien dans les référentiels.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_CreateTreasuryAccount
	@companyId int,
	@storeId int = NULL,
	@treasuryAccountTypeId int,
	@vcAccountName varchar(50),
	@mCurrentBalance money = 0
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		-- Validations des données d'entrée
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51300, 'companyId est obligatoire et doit etre positif.', 1;
		IF @treasuryAccountTypeId IS NULL OR @treasuryAccountTypeId <= 0
			THROW 51301, 'Le type de compte est obligatoire.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcAccountName)), '') IS NULL
			THROW 51302, 'vcAccountName est obligatoire.', 1;
		IF @mCurrentBalance IS NULL
			THROW 51303, 'Le solde initial ne peut pas etre NULL.', 1;
		IF NOT EXISTS (
			SELECT 1 FROM dbo.tblRefTreasuryAccountType
			WHERE treasuryAccountTypeId = @treasuryAccountTypeId
		)
			THROW 51301, 'Type de compte de tresorerie introuvable.', 1;

		-- Insertion du compte
		INSERT INTO dbo.tblTreasuryAccount (
			companyId, storeId, treasuryAccountTypeId, vcAccountName,
			mCurrentBalance, btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.treasuryAccountId, INSERTED.companyId,
		       INSERTED.storeId, INSERTED.vcAccountName, INSERTED.mCurrentBalance
		VALUES (
			@companyId, @storeId, @treasuryAccountTypeId, LTRIM(RTRIM(@vcAccountName)),
			@mCurrentBalance, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/*------------------------------------------------------------------------------
  usp_GetTreasuryAccounts
  Rôle : Liste tous les comptes d'une entreprise spécifique.
         (Retourne aussi les comptes désactivés pour l'historique).
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_GetTreasuryAccounts
	@companyId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @companyId IS NULL OR @companyId <= 0
			THROW 51300, 'companyId est obligatoire et doit etre positif.', 1;

		SELECT
			treasuryAccountId, companyId, storeId, typeCode,
			vcTreasuryAccountType, vcAccountName, mCurrentBalance, btEnabled
		FROM dbo.vw_TreasuryAccountDetails
		WHERE companyId = @companyId
		ORDER BY vcAccountName;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO

/*------------------------------------------------------------------------------
  usp_RecordTreasuryMovement
  Rôle : Enregistre une entrée ou une sortie d'argent sur un compte.
  
  Logique de sécurité (Transaction) :
    1. On bloque la ligne du compte (UPDLOCK, HOLDLOCK) pour éviter que deux 
       utilisateurs modifient le solde en même temps (problème de concurrence).
    2. On calcule le nouveau solde.
    3. On insère le mouvement.
    4. On met à jour le solde du compte.
    5. Si une erreur survient, le ROLLBACK annule tout.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_RecordTreasuryMovement
	@treasuryAccountId int,
	@treasuryMovementTypeId int,
	@cashReportId int = NULL,
	@mAmount money,
	@vcDescription varchar(150),
	@OperatedByUserId int
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		-- 1. Validations de base
		IF @treasuryAccountId IS NULL OR @treasuryAccountId <= 0
			THROW 51304, 'treasuryAccountId est obligatoire et doit etre positif.', 1;
		IF @treasuryMovementTypeId IS NULL OR @treasuryMovementTypeId <= 0
			THROW 51305, 'Le type de mouvement est obligatoire.', 1;
		IF @mAmount IS NULL OR @mAmount <= 0
			THROW 51306, 'mAmount doit etre strictement superieur a zero.', 1;
		IF NULLIF(LTRIM(RTRIM(@vcDescription)), '') IS NULL
			THROW 51307, 'vcDescription est obligatoire.', 1;
		IF @OperatedByUserId IS NULL OR @OperatedByUserId <= 0
			THROW 51308, 'OperatedByUserId est obligatoire.', 1;

		-- 2. Récupération de la direction (+1 pour entrée, -1 pour sortie)
		DECLARE @direction smallint;
		SELECT @direction = direction
		FROM dbo.tblRefTreasuryMovementType
		WHERE treasuryMovementTypeId = @treasuryMovementTypeId;
		IF @direction IS NULL OR @direction NOT IN (-1, 1)
			THROW 51305, 'Type de mouvement absent ou direction invalide.', 1;

		-- 3. Début de la transaction sécurisée
		BEGIN TRANSACTION;

		DECLARE @balanceBefore money;
		-- On verrouille la ligne du compte pour empêcher toute modification simultanée
		SELECT @balanceBefore = mCurrentBalance
		FROM dbo.tblTreasuryAccount WITH (UPDLOCK, HOLDLOCK)
		WHERE treasuryAccountId = @treasuryAccountId;
		
		IF @balanceBefore IS NULL
			THROW 51309, 'Compte de tresorerie introuvable.', 1;

		-- Calcul du nouveau solde
		DECLARE @balanceAfter money = @balanceBefore + (@direction * @mAmount);
		
		-- Table temporaire pour stocker l'ID généré et le renvoyer à l'API
		DECLARE @inserted table (
			treasuryMovementId int,
			mBalanceAfter money
		);

		-- 4. Insertion du mouvement
		INSERT INTO dbo.tblTreasuryMovement (
			treasuryAccountId, treasuryMovementTypeId, cashReportId,
			mAmount, mBalanceBefore, mBalanceAfter, vcDescription,
			OperatedByUserId, btEnabled, dtCreatedAt, dtLastUpdated
		)
		OUTPUT INSERTED.treasuryMovementId, INSERTED.mBalanceAfter
			INTO @inserted (treasuryMovementId, mBalanceAfter)
		VALUES (
			@treasuryAccountId, @treasuryMovementTypeId, @cashReportId,
			@mAmount, @balanceBefore, @balanceAfter, LTRIM(RTRIM(@vcDescription)),
			@OperatedByUserId, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
		);

		-- 5. Mise à jour du solde du compte
		UPDATE dbo.tblTreasuryAccount
		SET mCurrentBalance = @balanceAfter,
			dtLastUpdated = SYSUTCDATETIME()
		WHERE treasuryAccountId = @treasuryAccountId;

		-- 6. Validation de la transaction
		COMMIT TRANSACTION;
		
		-- Renvoi des données à l'API Node.js
		SELECT treasuryMovementId, mBalanceAfter FROM @inserted;
	END TRY
	BEGIN CATCH
		-- En cas d'erreur, on annule tout (le solde ne bouge pas)
		IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
		THROW;
	END CATCH;
END;
GO

/*------------------------------------------------------------------------------
  usp_GetTreasuryMovements
  Rôle : Récupère l'historique des N derniers mouvements d'un compte.
  Note : Limité à 1000 par défaut pour éviter de saturer la mémoire.
------------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE dbo.usp_GetTreasuryMovements
	@treasuryAccountId int,
	@limit int = 100
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	BEGIN TRY
		IF @treasuryAccountId IS NULL OR @treasuryAccountId <= 0
			THROW 51304, 'treasuryAccountId est obligatoire et doit etre positif.', 1;
		
		-- Sécurité sur la limite
		IF @limit IS NULL OR @limit < 1 OR @limit > 1000 SET @limit = 100;

		SELECT TOP (@limit)
			treasuryMovementId, treasuryAccountId, typeCode,
			vcTreasuryMovementType, direction, cashReportId,
			mAmount, mBalanceBefore, mBalanceAfter, vcDescription,
			OperatedByUserId, operatedByName, dtCreatedAt
		FROM dbo.vw_TreasuryMovementDetails
		WHERE treasuryAccountId = @treasuryAccountId
		ORDER BY dtCreatedAt DESC, treasuryMovementId DESC;
	END TRY
	BEGIN CATCH
		THROW;
	END CATCH;
END;
GO