/**
 * @file cashController.js
 * @description Contrôleur caisse (STRICTEMENT ZERO SQL).
 */

const asyncHandler = require('../middleware/asyncHandler');
const CashSessionDAL = require('../dal/cashSessionDAL');
const CashAdminDAL = require('../dal/cashAdminDAL');
const CashReportDAL = require('../dal/cashReportDAL');
const ExpenseDAL = require('../dal/expenseDAL');
const { sql, poolPromise } = require('../config/db');

// ==========================================
// 1. CAISSES (REGISTERS)
// ==========================================
exports.getRegisters = asyncHandler(async (req, res) => {
    const storeId = req.params.storeId;
    const registers = await CashSessionDAL.getRegisters(storeId);
    res.status(200).json({ success: true, data: registers });
});

exports.createRegister = asyncHandler(async (req, res) => {
    const { storeId, vcRegisterCode, vcRegisterName } = req.body;
    const register = await CashSessionDAL.createRegister({ storeId, vcRegisterCode, vcRegisterName });
    res.status(201).json({ success: true, data: register });
});

// ==========================================
// 2. SESSIONS (STATUTS & HISTORIQUE)
// ==========================================
exports.myOpenSession = asyncHandler(async (req, res) => {
    const session = await CashSessionDAL.getOpenSessionByUser(req.user.userId);
    res.status(200).json({ success: true, data: session });
});

exports.myHistory = asyncHandler(async (req, res) => {
    const { limit } = req.query;
    const history = await CashSessionDAL.getHistoryByUser(req.user.userId, { limit: parseInt(limit) || 50 });
    res.status(200).json({ success: true, data: history });
});

exports.getSessions = asyncHandler(async (req, res) => {
    const sessions = await CashSessionDAL.getSessions(req.params.cashRegisterId);
    res.status(200).json({ success: true, data: sessions });
});

exports.getSessionStats = asyncHandler(async (req, res) => {
    const session = await CashSessionDAL.getOpenSessionByUser(req.user.userId);
    res.status(200).json({ success: true, data: { isOpen: !!session, session } });
});

exports.getCashStatus = asyncHandler(async (req, res) => {
    const session = await CashSessionDAL.getOpenSessionByUserAndStore(req.user.userId, req.user.storeId);
    
    if (!session) {
        return res.status(200).json({ success: true, data: null });
    }

    const totals = await CashSessionDAL.getSessionTotals(session.cashSessionId);
    const expenses = await ExpenseDAL.getBySession(session.cashSessionId);
    const totalDepenses = (expenses || []).reduce((sum, exp) => sum + (exp.mAmount || 0), 0);

    // ✅ NOUVEAU : On récupère les rapports des caissiers validés par le gérant
    const pool = await poolPromise;
    const cashierReportsResult = await pool.request()
        .input('storeId', sql.Int, req.user.storeId)
        .input('userId', sql.Int, req.user.userId)
        .query(`
            SELECT COALESCE(SUM(r.mTheoreticalBalance), 0) AS totalRapportsValides
            FROM dbo.tblCashReport r
            INNER JOIN dbo.tblCashSession cs ON cs.cashSessionId = r.cashSessionId
            INNER JOIN dbo.tblCashRegister cr ON cr.cashRegisterId = cs.cashRegisterId
            WHERE cr.storeId = @storeId
              AND cs.userId != @userId -- On ne prend pas la propre caisse du gérant
              AND r.cashReportStatusId IN (2, 3) -- 2 = En attente admin, 3 = Validé par admin
        `);
        
    const totalRapportsValides = cashierReportsResult.recordset[0]?.totalRapportsValides || 0;

    const responseData = {
        ...session,
        // ✅ AJOUT : On expose le fond initial pour React
        fondInitial: session.mOpeningCaisse ?? 0,
        
        session: {
            ...session,
            fondInitial: session.mOpeningCaisse ?? 0,
            totalVentes: totals?.mTotalSales || 0,
            nombreVentes: totals?.nbVentes || 0,
            totalDettesAccordees: totals?.mTotalCredit || 0,
            totalCash: totals?.mTotalCash || 0,
            totalMobileMoney: totals?.mTotalMobileMoney || 0,
            totalMobileMoneySales: totals?.mTotalMobileMoney || 0,
            totalOther: totals?.mTotalOther || 0,
            totalRecouvrement: totals?.mTotalCashRecovery || 0, 
            totalMobileMoneyRecoveries: totals?.mTotalFintechRecovery || 0, 
            totalDepenses: totalDepenses,
            totalRapportsValides: totalRapportsValides, // ✅ On l'injecte ici
        },
        
        totalVentes: totals?.mTotalSales || 0,
        nombreVentes: totals?.nbVentes || 0,
        totalDettesAccordees: totals?.mTotalCredit || 0,
        totalCash: totals?.mTotalCash || 0,
        totalMobileMoney: totals?.mTotalMobileMoney || 0,
        totalMobileMoneySales: totals?.mTotalMobileMoney || 0,
        totalOther: totals?.mTotalOther || 0,
        totalRecouvrement: totals?.mTotalCashRecovery || 0,
        totalMobileMoneyRecoveries: totals?.mTotalFintechRecovery || 0,
        totalDepenses: totalDepenses,
        totalRapportsValides: totalRapportsValides, // ✅ Et ici aussi
    };

    res.status(200).json({ success: true, data: responseData });
});

// ==========================================
// 3. GESTION DES SESSIONS (OPEN/CLOSE)
// ==========================================
exports.openSession = asyncHandler(async (req, res) => {
    const { fondInitial, storeId } = req.body;
    const userId = req.user.userId;
    const userStoreId = storeId || req.user.storeId;

    if (!userStoreId) return res.status(400).json({ success: false, message: "Aucune boutique assignée." });

    let registers = await CashSessionDAL.getRegisters(userStoreId);
    
    if (registers.length === 0) {
        try {
            const newRegister = await CashSessionDAL.createRegister({
                storeId: userStoreId,
                vcRegisterCode: 'CAISSE-01',
                vcRegisterName: 'Caisse Principale'
            });
            registers = [newRegister];
        } catch (err) {
            return res.status(500).json({ success: false, message: "Impossible de créer la caisse automatiquement.", error: err.message });
        }
    }
    
    const cashRegisterId = registers[0].cashRegisterId;

    const existingSession = await CashSessionDAL.getOpenSessionByUser(userId);
    if (existingSession) {
        return res.status(200).json({ success: true, message: "Session déjà ouverte.", data: existingSession });
    }

    try {
        const nouvelleSession = await CashSessionDAL.openSession({
            cashRegisterId,
            userId,
            mOpeningCaisse: parseFloat(fondInitial) || 0
        });
        res.status(201).json({ success: true, data: nouvelleSession });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// ✅ Interception de l'écart de caisse (Erreur 50002)
exports.closeMySession = asyncHandler(async (req, res) => {
    const { montantCloture, commentairesGérant } = req.body; 
    const userId = req.user.userId;

    const session = await CashSessionDAL.getOpenSessionByUser(userId);
    if (!session) return res.status(400).json({ success: false, message: "Aucune session ouverte." });

    try {
        const closedSession = await CashSessionDAL.closeSession(
            session.cashSessionId, 
            parseFloat(montantCloture),
            commentairesGérant
        );
        
        const rapport = await CashReportDAL.createReport({
            cashSessionId: session.cashSessionId,
            userId: userId,
            storeId: session.storeId,
            mDeclaredClosingAmount: parseFloat(montantCloture),
            vcManagerComment: commentairesGérant
        });

        res.status(201).json({ success: true, message: "Caisse fermée et rapport généré.", data: rapport });
    } catch (error) {
        if (error.sqlNumber === 50002) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

exports.closeSession = asyncHandler(async (req, res) => {
    const { cashSessionId } = req.params;
    const { montantCloture, commentairesGérant } = req.body;

    try {
        const closedSession = await CashSessionDAL.closeSession(
            parseInt(cashSessionId), 
            parseFloat(montantCloture),
            commentairesGérant
        );
        res.status(200).json({ success: true, message: "Session fermée.", data: closedSession });
    } catch (error) {
        if (error.sqlNumber === 50002) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// 4. RAPPORTS
// ==========================================
exports.listReports = asyncHandler(async (req, res) => {
    // 1) On récupère TOUS les rapports (la SP renvoie déjà roleCode du créateur)
    const rapports = await CashReportDAL.listReports();

    // 2) Filtrage métier côté Node.js selon le rôle de l'utilisateur connecté
    const userRole = req.user?.roleCode;
    const isAdmin  = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    let data = rapports || [];

    // ✅ Un ADMIN ne voit QUE les rapports créés par des Gérants (roleCode = 'MANAGER')
    if (isAdmin) {
        data = data.filter(r =>
            r.roleCode === 'MANAGER'   // roleCode du créateur du rapport
        );
    }

    // (Caissier / Gérant : on laisse la SP gérer leur périmètre)
    res.status(200).json({ success: true, data });
});

// ✅ SÉCURISATION ICI : On vérifie que l'ID est valide
exports.getReports = asyncHandler(async (req, res) => {
    const cashSessionId = parseInt(req.params.cashSessionId, 10);
    
    if (isNaN(cashSessionId)) {
        return res.status(400).json({ success: false, message: "ID de session invalide." });
    }

    const rapports = await CashReportDAL.getReportsBySession(cashSessionId);
    res.status(200).json({ success: true, data: rapports });
});

// ✅ SÉCURISATION ICI : On vérifie que l'ID est valide
exports.getReportDetails = asyncHandler(async (req, res) => {
    const cashReportId = parseInt(req.params.cashReportId, 10);
    
    if (isNaN(cashReportId)) {
        return res.status(400).json({ success: false, message: "ID de rapport invalide." });
    }

    const details = await CashReportDAL.getReportDetails(cashReportId);
    if (!details) return res.status(404).json({ success: false, message: 'Rapport de caisse introuvable.' });
    res.status(200).json({ success: true, data: details });
});

exports.createReport = asyncHandler(async (req, res) => {
    const { cashSessionId, storeId, mDeclaredClosingAmount, vcManagerComment } = req.body;
    const rapport = await CashReportDAL.createReport({
        cashSessionId,
        userId: req.user.userId,
        storeId,
        mDeclaredClosingAmount,
        vcManagerComment
    });
    res.status(201).json({ success: true, data: rapport });
});

// ✅ MODIFIÉ : Détection automatique du rôle (Admin ou Gérant)
exports.approveReport = asyncHandler(async (req, res) => {
    const { cashReportId } = req.params;
    const { commentairesAdmin, comment } = req.body;
    const finalComment = commentairesAdmin || comment || null;

    // Détection automatique
    const isAdmin = req.user.roleCode === 'ADMIN' || req.user.roleCode === 'SUPER_ADMIN';
    const level = isAdmin ? 'ADMIN' : 'MANAGER';

    try {
        const rapport = await CashReportDAL.decideReport(
          parseInt(cashReportId, 10),
          level,
          req.user.userId,
          true,
          finalComment
        );
        res.status(200).json({ success: true, data: rapport });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ✅ MODIFIÉ : Détection automatique du rôle (Admin ou Gérant)
exports.rejectReport = asyncHandler(async (req, res) => {
    const { cashReportId } = req.params;
    const { commentairesAdmin, comment } = req.body;
    const finalComment = commentairesAdmin || comment || null;

    // Détection automatique
    const isAdmin = req.user.roleCode === 'ADMIN' || req.user.roleCode === 'SUPER_ADMIN';
    const level = isAdmin ? 'ADMIN' : 'MANAGER';

    try {
        const rapport = await CashReportDAL.decideReport(
          parseInt(cashReportId, 10),
          level,
          req.user.userId,
          false,
          finalComment
        );
        res.status(200).json({ success: true, data: rapport });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ==========================================
// 5. ADMIN : CAISSE CENTRALE
// ==========================================
exports.getCaisseAdmin = asyncHandler(async (req, res) => {
    const caisse = await CashAdminDAL.getOrCreateByUser(req.user.userId);
    res.status(200).json({ success: true, data: caisse });
});

// ==========================================
// 6. DEPENSES (EXPENSES)
// ==========================================
exports.getMyExpenses = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const session = await CashSessionDAL.getOpenSessionByUser(userId);
    
    if (!session) {
        return res.status(200).json({ success: true, data: [] });
    }

    const expenses = await ExpenseDAL.getBySession(session.cashSessionId);
    res.status(200).json({ success: true, data: expenses });
});

exports.createExpense = asyncHandler(async (req, res) => {
    const { montant, motif, typeDepense } = req.body;
    const userId = req.user.userId;
    const storeId = req.user.storeId;
    const companyId = req.user.companyId;
    
    const session = await CashSessionDAL.getOpenSessionByUser(userId);
    if (!session) {
        return res.status(400).json({ success: false, message: "Aucune caisse ouverte pour enregistrer une dépense." });
    }

    try {
        const codeCategorie = typeDepense === 'COMMISSION' ? 'COMMISSION' : 'DIVERS';
        
        const pool = await poolPromise;
        const catResult = await pool.request()
            .input('companyId', sql.Int, companyId)
            .input('vcCode', sql.VarChar(20), codeCategorie)
            .query(`
                SELECT TOP 1 expenseCategoryId 
                FROM tblExpenseCategory 
                WHERE companyId = @companyId AND vcExpenseCategoryCode = @vcCode AND btEnabled = 1
            `);

        if (catResult.recordset.length === 0) {
            return res.status(400).json({ success: false, message: "Catégorie de dépense introuvable pour cette entreprise." });
        }

        const expenseCategoryId = catResult.recordset[0].expenseCategoryId;

        const expense = await ExpenseDAL.create({
            cashSessionId: session.cashSessionId,
            storeId: storeId,
            expenseCategoryId: expenseCategoryId,
            mAmount: parseFloat(montant),
            vcReason: motif,
            vcStatusCode: 'APPROVED',
            createdByUserId: userId
        });
        
        res.status(201).json({ success: true, data: expense });
    } catch (err) {
        console.error("Erreur création dépense:", err);
        res.status(400).json({ success: false, message: "Erreur lors de l'enregistrement de la dépense." });
    }
});