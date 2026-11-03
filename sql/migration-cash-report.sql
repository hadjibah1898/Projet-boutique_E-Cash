/*
 * ===============================================================================
 *  Migration : Objets manquants pour le module Caisse / Rapports de caisse
 *  SGBD        : Microsoft SQL Server
 *  Base        : GestionsBoutiques
 *  Description : Crée la table dbo.tblCashReport (si absente), les vues et
 *                les procédures stockées référencées par cashReportDAL.js et
 *                cashService.js, ainsi que les données de référence requises.
 * ===============================================================================
 */

USE GestionsBoutiques;
GO

/*-----------------------------------------------------------------------------
  1. TABLE dbo.tblCashReport (si absente)
-----------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.tblCashReport', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblCashReport (
        cashReportId            INT IDENTITY(1,1) NOT NULL,
        cashSessionId           INT NOT NULL,
        cashReportStatusId      INT NOT NULL,
        mOpeningCashReport      MONEY NOT NULL,
        mTotalSales             MONEY NOT NULL,
        mTotalCash              MONEY NOT NULL,
        mTotalMobileMoney       MONEY NOT NULL,
        mTotalCredit            MONEY NOT NULL,
        mTotalRecoveries        MONEY NOT NULL,
        mTotalApprovedExpenses  MONEY NOT NULL,
        mTheoreticalBalance     MONEY NOT NULL,
        mClosingAmount          MONEY NOT NULL,
        mDifferenceAmount       MONEY NOT NULL,
        managerApprovedByUserId INT NULL,
        dtManagerApprovedAt     DATETIME NULL,
        adminApprovedByUserId   INT NULL,
        dtAdminApprovedAt       DATETIME NULL,
        vcManagerComment        VARCHAR(250) NULL,
        vcAdminComment          VARCHAR(250) NULL,
        btEnabled               BIT NOT NULL DEFAULT 1,
        dtCreatedAt             DATETIME NOT NULL DEFAULT GETDATE(),
        dtLastUpdated           DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_CashReport PRIMARY KEY (cashReportId),
        CONSTRAINT FK_CashReport_CashSession FOREIGN KEY (cashSessionId)
            REFERENCES dbo.tblCashSession(cashSessionId),
        CONSTRAINT FK_CashReport_Status FOREIGN KEY (cashReportStatusId)
            REFERENCES dbo.tblRefCashReportStatus(cashReportStatusId),
        CONSTRAINT FK_CashReport_ManagerApprovedBy FOREIGN KEY (managerApprovedByUserId)
            REFERENCES dbo.tblUser(userId),
        CONSTRAINT FK_CashReport_AdminApprovedBy FOREIGN KEY (adminApprovedByUserId)
            REFERENCES dbo.tblUser(userId),
        CONSTRAINT UQ_CashReport_CashSession UNIQUE (cashSessionId)
    );
END;
GO

/*-----------------------------------------------------------------------------
  2. DONNÉES DE RÉFÉRENCE : tblRefCashReportStatus
-----------------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM dbo.tblRefCashReportStatus WHERE vcCode = 'PENDING_MANAGER')
    INSERT INTO dbo.tblRefCashReportStatus (vcCode, vcCashReportStatus)
    VALUES ('PENDING_MANAGER', 'En attente validation gérant');

IF NOT EXISTS (SELECT 1 FROM dbo.tblRefCashReportStatus WHERE vcCode = 'PENDING_ADMIN')
    INSERT INTO dbo.tblRefCashReportStatus (vcCode, vcCashReportStatus)
    VALUES ('PENDING_ADMIN', 'En attente validation admin');

IF NOT EXISTS (SELECT 1 FROM dbo.tblRefCashReportStatus WHERE vcCode = 'APPROVED')
    INSERT INTO dbo.tblRefCashReportStatus (vcCode, vcCashReportStatus)
    VALUES ('APPROVED', 'Approuvé');

IF NOT EXISTS (SELECT 1 FROM dbo.tblRefCashReportStatus WHERE vcCode = 'REJECTED')
    INSERT INTO dbo.tblRefCashReportStatus (vcCode, vcCashReportStatus)
    VALUES ('REJECTED', 'Rejeté');
GO
/*-----------------------------------------------------------------------------
  3. VUE : vw_CashReportDetails (rapport enrichi avec boutique, caisse, utilisateur)
-----------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.vw_CashReportDetails', 'V') IS NOT NULL
    DROP VIEW dbo.vw_CashReportDetails;
GO

CREATE VIEW dbo.vw_CashReportDetails AS
SELECT
    cr.cashReportId,
    cr.cashSessionId,
    cr.cashReportStatusId,
    st.vcCode AS statusCode,
    st.vcCashReportStatus,
    cr.mOpeningCashReport,
    cr.mTotalSales,
    cr.mTotalCash,
    cr.mTotalMobileMoney,
    cr.mTotalCredit,
    cr.mTotalRecoveries,
    cr.mTotalApprovedExpenses,
    cr.mTheoreticalBalance,
    cr.mClosingAmount,
    cr.mDifferenceAmount,
    cr.managerApprovedByUserId,
    cr.dtManagerApprovedAt,
    cr.adminApprovedByUserId,
    cr.dtAdminApprovedAt,
    cr.vcManagerComment,
    cr.vcAdminComment,
    cr.btEnabled,
    cr.dtCreatedAt,
    cr.dtLastUpdated,
    cs.userId AS sessionUserId,
    cs.mOpeningCaisse,
    cs.dtOpenedAt,
    cs.dtClosedAt,
    cs.mDeclaredClosingAmount,
    crg.cashRegisterId,
    crg.vcRegisterCode,
    crg.vcRegisterName,
    s.storeId,
    s.vcStoreCode,
    s.vcStoreName,
    s.companyId,
    u.vcLastName AS sessionUserLastName,
    u.roleCode AS roleCode,
    u.vcFirstName AS sessionUserFirstName
FROM dbo.tblCashReport cr
INNER JOIN dbo.tblCashSession cs ON cr.cashSessionId = cs.cashSessionId
INNER JOIN dbo.tblCashRegister crg ON cs.cashRegisterId = crg.cashRegisterId
INNER JOIN dbo.tblStore s ON crg.storeId = s.storeId
INNER JOIN dbo.tblRefCashReportStatus st ON cr.cashReportStatusId = st.cashReportStatusId
INNER JOIN dbo.tblUser u ON cs.userId = u.userId;
GO
/*-----------------------------------------------------------------------------
  4. VUE : vw_CashSessionReportTotals (agrégats par session)
-----------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.vw_CashSessionReportTotals', 'V') IS NOT NULL
    DROP VIEW dbo.vw_CashSessionReportTotals;
GO

CREATE VIEW dbo.vw_CashSessionReportTotals AS
SELECT
    cs.cashSessionId,
    cs.cashRegisterId,
    cs.userId,
    crg.vcRegisterCode,
    crg.vcRegisterName,
    s.storeId,
    s.vcStoreCode,
    s.vcStoreName,
    cs.mOpeningCaisse,
    cs.dtOpenedAt,
    cs.dtClosedAt,
    COUNT(cr.cashReportId) AS reportCount,
    ISNULL(SUM(cr.mClosingAmount), 0) AS totalClosingAmount,
    ISNULL(SUM(cr.mDifferenceAmount), 0) AS totalDifferenceAmount
FROM dbo.tblCashSession cs
LEFT JOIN dbo.tblCashReport cr ON cs.cashSessionId = cr.cashSessionId
INNER JOIN dbo.tblCashRegister crg ON cs.cashRegisterId = crg.cashRegisterId
INNER JOIN dbo.tblStore s ON crg.storeId = s.storeId
GROUP BY
    cs.cashSessionId, cs.cashRegisterId, cs.userId,
    crg.vcRegisterCode, crg.vcRegisterName,
    s.storeId, s.vcStoreCode, s.vcStoreName,
    cs.mOpeningCaisse, cs.dtOpenedAt, cs.dtClosedAt;
GO
/*-----------------------------------------------------------------------------
  5. PROCÉDURE : sp_GetCashReportById (rapport par identifiant)
-----------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.sp_GetCashReportById', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_GetCashReportById;
GO

CREATE PROCEDURE dbo.sp_GetCashReportById
    @cashReportId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT *
    FROM dbo.vw_CashReportDetails
    WHERE cashReportId = @cashReportId;
END;
GO
/*-----------------------------------------------------------------------------
  6. PROCÉDURE : sp_GetCashReportsBySession (rapports d'une session)
-----------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.sp_GetCashReportsBySession', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_GetCashReportsBySession;
GO

CREATE PROCEDURE dbo.sp_GetCashReportsBySession
    @cashSessionId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT *
    FROM dbo.vw_CashReportDetails
    WHERE cashSessionId = @cashSessionId
    ORDER BY dtCreatedAt DESC;
END;
GO
/*-----------------------------------------------------------------------------
  7. PROCÉDURE : sp_GetCashReportsFiltered (liste filtrée et paginable)
-----------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.sp_GetCashReportsFiltered', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_GetCashReportsFiltered;
GO

CREATE PROCEDURE dbo.sp_GetCashReportsFiltered
    @storeId    INT = NULL,
    @gerantId   INT = NULL,
    @startDate  DATETIME = NULL,
    @endDate    DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT *
    FROM dbo.vw_CashReportDetails
    WHERE (@storeId IS NULL OR storeId = @storeId)
      AND (@gerantId IS NULL OR sessionUserId = @gerantId)
      AND (@startDate IS NULL OR dtCreatedAt >= @startDate)
      AND (@endDate IS NULL OR dtCreatedAt <= @endDate)
    ORDER BY dtCreatedAt DESC;
END;
GO
/*-----------------------------------------------------------------------------
  8. PROCÉDURE : sp_CreateCashReport (création d'un rapport de caisse)
-----------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.sp_CreateCashReport', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_CreateCashReport;
GO

CREATE PROCEDURE dbo.sp_CreateCashReport
    @cashSessionId             INT,
    @cashReportStatusId        INT,
    @mClosingAmount            MONEY,
    @mTotalRecoveriesOverride  MONEY = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @mOpeningCashReport MONEY;
    DECLARE @mTotalSales MONEY;
    DECLARE @mTotalCash MONEY;
    DECLARE @mTotalMobileMoney MONEY;
    DECLARE @mTotalCredit MONEY;
    DECLARE @mTotalRecoveries MONEY;
    DECLARE @mTotalApprovedExpenses MONEY;
    DECLARE @mTheoreticalBalance MONEY;
    DECLARE @mDifferenceAmount MONEY;

    SELECT @mOpeningCashReport = mOpeningCaisse
    FROM dbo.tblCashSession
    WHERE cashSessionId = @cashSessionId;

    -- Total des ventes (mNetAmount depuis tblSale)
    SELECT @mTotalSales = ISNULL(SUM(s.mNetAmount), 0)
    FROM dbo.tblSale s
    WHERE s.cashSessionId = @cashSessionId;

    -- Répartition par moyen de paiement (jointure tblSale -> tblSalePayment)
    -- Codes : 1=CASH, 2=ORANGE_MONEY, 3=MTN_MOMO, 4=CARD, 5=BANK_TRANSFER
    SELECT
        @mTotalCash = ISNULL(SUM(CASE WHEN sp.paymentMethodId = 1 THEN sp.mAmount ELSE 0 END), 0),
        @mTotalMobileMoney = ISNULL(SUM(CASE WHEN sp.paymentMethodId IN (2, 3) THEN sp.mAmount ELSE 0 END), 0),
        @mTotalCredit = ISNULL(SUM(CASE WHEN sp.paymentMethodId = 4 THEN sp.mAmount ELSE 0 END), 0)
    FROM dbo.tblSale s
    INNER JOIN dbo.tblSalePayment sp ON s.saleId = sp.saleId
    WHERE s.cashSessionId = @cashSessionId;

    -- Recouvrements de dettes
    SELECT @mTotalRecoveries = ISNULL(SUM(mAmount), 0)
    FROM dbo.tblDebtPayment
    WHERE cashSessionId = @cashSessionId;

    -- Dépenses de la session (aucune colonne btEnabled sur tblExpense)
    SELECT @mTotalApprovedExpenses = ISNULL(SUM(mAmount), 0)
    FROM dbo.tblExpense
    WHERE cashSessionId = @cashSessionId;

    IF @mTotalRecoveriesOverride IS NOT NULL
        SET @mTotalRecoveries = @mTotalRecoveriesOverride;

    SET @mTheoreticalBalance = @mOpeningCashReport + @mTotalSales + @mTotalRecoveries - @mTotalApprovedExpenses;
    SET @mDifferenceAmount = @mClosingAmount - @mTheoreticalBalance;

    INSERT INTO dbo.tblCashReport (
        cashSessionId, cashReportStatusId, mOpeningCashReport,
        mTotalSales, mTotalCash, mTotalMobileMoney, mTotalCredit,
        mTotalRecoveries, mTotalApprovedExpenses, mTheoreticalBalance,
        mClosingAmount, mDifferenceAmount, dtCreatedAt, dtLastUpdated
    )
    OUTPUT inserted.*
    VALUES (
        @cashSessionId, @cashReportStatusId, @mOpeningCashReport,
        @mTotalSales, @mTotalCash, @mTotalMobileMoney, @mTotalCredit,
        @mTotalRecoveries, @mTotalApprovedExpenses, @mTheoreticalBalance,
        @mClosingAmount, @mDifferenceAmount, GETDATE(), GETDATE()
    );
END;
GO
/*-----------------------------------------------------------------------------
  9. PROCÉDURE : sp_ApproveCashReport (approbation / rejet à deux niveaux)
-----------------------------------------------------------------------------*/
IF OBJECT_ID('dbo.sp_ApproveCashReport', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_ApproveCashReport;
GO

CREATE PROCEDURE dbo.sp_ApproveCashReport
    @cashReportId INT,
    @level        VARCHAR(10),
    @userId       INT,
    @isApproved   BIT,
    @comment      VARCHAR(250) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @currentStatus VARCHAR(20);
    DECLARE @newStatusId INT;

    SELECT @currentStatus = vcCode
    FROM dbo.tblCashReport cr
    INNER JOIN dbo.tblRefCashReportStatus st ON cr.cashReportStatusId = st.cashReportStatusId
    WHERE cr.cashReportId = @cashReportId;

    IF @level = 'MANAGER'
    BEGIN
        IF @currentStatus <> 'PENDING_MANAGER'
            THROW 53209, 'Seul un rapport en attente validation gérant peut être traité par un gérant.', 1;

        IF @isApproved = 1
            SELECT @newStatusId = cashReportStatusId FROM dbo.tblRefCashReportStatus WHERE vcCode = 'PENDING_ADMIN';
        ELSE
            SELECT @newStatusId = cashReportStatusId FROM dbo.tblRefCashReportStatus WHERE vcCode = 'REJECTED';
    END
    ELSE IF @level = 'ADMIN'
    BEGIN
        IF @currentStatus <> 'PENDING_ADMIN'
            THROW 53210, 'Seul un rapport en attente validation admin peut être traité par un admin.', 1;

        IF @isApproved = 1
            SELECT @newStatusId = cashReportStatusId FROM dbo.tblRefCashReportStatus WHERE vcCode = 'APPROVED';
        ELSE
            SELECT @newStatusId = cashReportStatusId FROM dbo.tblRefCashReportStatus WHERE vcCode = 'REJECTED';
    END
    ELSE
        THROW 50001, 'Niveau invalide : MANAGER ou ADMIN attendu.', 1;

    UPDATE dbo.tblCashReport
    SET cashReportStatusId = @newStatusId,
        vcManagerComment = CASE WHEN @level = 'MANAGER' THEN @comment ELSE vcManagerComment END,
        vcAdminComment = CASE WHEN @level = 'ADMIN' THEN @comment ELSE vcAdminComment END,
        managerApprovedByUserId = CASE WHEN @level = 'MANAGER' AND @isApproved = 1 THEN @userId ELSE managerApprovedByUserId END,
        dtManagerApprovedAt = CASE WHEN @level = 'MANAGER' AND @isApproved = 1 THEN GETDATE() ELSE dtManagerApprovedAt END,
        adminApprovedByUserId = CASE WHEN @level = 'ADMIN' AND @isApproved = 1 THEN @userId ELSE adminApprovedByUserId END,
        dtAdminApprovedAt = CASE WHEN @level = 'ADMIN' AND @isApproved = 1 THEN GETDATE() ELSE dtAdminApprovedAt END,
        dtLastUpdated = GETDATE()
    WHERE cashReportId = @cashReportId;

    SELECT *
    FROM dbo.vw_CashReportDetails
    WHERE cashReportId = @cashReportId;
END;
GO

PRINT 'Migration cash-report terminée avec succès.';
