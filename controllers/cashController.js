/**
 * @file cashController.js
 * @description Contrôleur caisse (STRICTEMENT ZERO SQL).
 */

const asyncHandler = require('../middleware/asyncHandler');
const CashSessionDAL = require('../dal/cashSessionDAL');
const CashAdminDAL = require('../dal/cashAdminDAL');
const CashReportDAL = require('../dal/cashReportDAL');
const ExpenseDAL = require('../dal/expenseDAL');
const TreasuryDAL = require('../dal/treasuryDAL');
const DebtPaymentDAL = require('../dal/debtPaymentDAL');
const cashService = require('../services/cashService');

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
    
    if (!session) {
        return res.status(200).json({ success: true, data: { isOpen: false, session: null } });
    }

    const totals = await CashSessionDAL.getSessionTotals(session.cashSessionId);
    const totalDepenses = await ExpenseDAL.getTotalApprovedBySession(session.cashSessionId); 
    
    const totalRapportsValides = totals?.mTotalCashierReports || 0;
    const v = totals?.mTotalSales || 0;
    const d = totals?.mTotalCredit || 0;
    const m_sales = totals?.mTotalMobileMoney || 0; 
    const r = totals?.mTotalRecoveries || 0;
    
    const m_rec = 0;
    const totalRecouvrementCash = Math.round(r - m_rec);
    const totalVentesCash = Math.round(v - d - m_sales);
    const fondInitial = session.mOpeningCaisse ?? 0;
    const soldeTheorique = Math.round(fondInitial + totalVentesCash + totalRecouvrementCash - totalDepenses);

    res.status(200).json({ 
        success: true, 
        data: {
            isOpen: true,
            session: {
                ...session,
                fondInitial: fondInitial,
                totalVentes: v,
                totalDettesAccordees: d,
                totalMobileMoney: m_sales, 
                totalRecouvrement: r,
                totalDepenses: totalDepenses,
                totalRapportsValides: totalRapportsValides,
                totalVentesCash: totalVentesCash,
                totalVentesFintech: m_sales,
                totalRecouvrementCash: totalRecouvrementCash,
                totalMobileMoneyRecoveries: m_rec, 
                soldeTheorique: soldeTheorique,
            }
        } 
    });
});

exports.getCashStatus = asyncHandler(async (req, res) => {
    const session = await CashSessionDAL.getOpenSessionByUserAndStore(req.user.userId, req.user.storeId);
    
    if (!session) {
        return res.status(200).json({ success: true, data: null });
    }

    const totals = await CashSessionDAL.getSessionTotals(session.cashSessionId);
    const totalDepenses = await ExpenseDAL.getTotalApprovedBySession(session.cashSessionId); 
    
    const totalRapportsValides = totals?.mTotalCashierReports || 0;

    const v = totals?.mTotalSales || 0;
    const d = totals?.mTotalCredit || 0;
    const m_sales = totals?.mTotalMobileMoney || 0; 
    const r = totals?.mTotalRecoveries || 0;
    
    const m_rec = 0;
    const totalRecouvrementCash = Math.round(r - m_rec);
    const totalVentesCash = Math.round(v - d - m_sales);
    const fondInitial = session.mOpeningCaisse ?? 0;
    const soldeTheorique = Math.round(fondInitial + totalVentesCash + totalRecouvrementCash - totalDepenses);

    const responseData = {
        ...session,
        fondInitial: fondInitial,
        session: {
            ...session,
            fondInitial: fondInitial,
            totalVentes: v,
            totalDettesAccordees: d,
            totalMobileMoney: m_sales, 
            totalRecouvrement: r,
            totalDepenses: totalDepenses,
            totalRapportsValides: totalRapportsValides,
            totalVentesCash: totalVentesCash,
            totalVentesFintech: m_sales,
            totalRecouvrementCash: totalRecouvrementCash,
            totalMobileMoneyRecoveries: m_rec, 
            soldeTheorique: soldeTheorique,
        },
    };

    res.status(200).json({ success: true, data: responseData });
});

// ==========================================
// 3. GESTION DES SESSIONS (OPEN/CLOSE)
// ==========================================
exports.openSession = asyncHandler(async (req, res) => {
    const { fondInitial } = req.body;
    const userId = req.user.userId;
    const userStoreId = req.user.storeId; 

    if (!userStoreId) return res.status(400).json({ success: false, message: "Aucune boutique assignée." });

    try {
        const existingSession = await CashSessionDAL.getOpenSessionByUser(userId);
        if (existingSession) return res.status(200).json({ success: true, message: "Session déjà ouverte.", data: existingSession });

        let registers = await CashSessionDAL.getRegisters(userStoreId);
        let availableRegisterId = null;

        for (let reg of registers) {
            const openSessionOnReg = await CashSessionDAL.getOpenSession(reg.cashRegisterId);
            if (!openSessionOnReg) {
                availableRegisterId = reg.cashRegisterId;
                break;
            }
        }

        if (!availableRegisterId) {
            const newRegCode = `CAISSE-${registers.length + 1}`;
            const newRegister = await CashSessionDAL.createRegister({
                storeId: userStoreId,
                vcRegisterCode: newRegCode,
                vcRegisterName: `Caisse ${registers.length + 1}`
            });
            availableRegisterId = newRegister.cashRegisterId;
        }

        const nouvelleSession = await CashSessionDAL.openSession({
            cashRegisterId: availableRegisterId,
            userId,
            mOpeningCaisse: parseFloat(fondInitial) || 0
        });

        res.status(201).json({ success: true, data: nouvelleSession });
    } catch (error) {
        console.error(`[CAISSE] ❌ ERREUR :`, error.message);
        res.status(400).json({ success: false, message: error.message });
    }
});

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
    const isAdmin = req.user.roleCode === 'ADMIN' || req.user.roleCode === 'SUPER_ADMIN';
    const filterStoreId = isAdmin ? null : req.user.storeId;

    const startDate = req.query.startDate ? String(req.query.startDate) : null;
    const endDate = req.query.endDate ? String(req.query.endDate) : null;
    const gerantId = req.query.gerant ? parseInt(req.query.gerant, 10) : null;

    let rapports = await CashReportDAL.listReports(
        req.user.userId, 
        req.user.roleCode, 
        filterStoreId,
        req.user.companyId || null,
        { startDate, endDate, gerantId } 
    );

    if (isAdmin) {
        rapports = rapports.filter(r => {
            const role = String(r.creatorRoleCode || '').toUpperCase();
            return role !== 'CASHIER'; 
        });
    }

    const validReports = rapports.filter(r => {
        const status = String(r.statut || '').toUpperCase();
        return r.cashReportStatusId === 3 || status.includes('VAL') || status.includes('APPROUV');
    });

    const salesEncaissements = validReports.reduce((acc, r) => acc + Number(r.mClosingAmount || r.montantCloture || 0), 0);
    const fintechSales = validReports.reduce((acc, r) => acc + Number(r.mTotalMobileMoney || r.totalMobileMoney || 0), 0);
    
    let totalDebts = 0;
    let fintechDebts = 0;
    
    if (isAdmin) {
        totalDebts = await DebtPaymentDAL.getTotalDebtPayments(
            req.user.companyId, 
            { startDate, endDate, storeId: null }
        );
        fintechDebts = await DebtPaymentDAL.getFintechDebtPaymentsTotal(
            req.user.companyId, 
            { startDate, endDate, storeId: null }
        );
    }

    const stats = {
        totalEncaissements: salesEncaissements + totalDebts,
        totalFintech: fintechSales + fintechDebts,
        totalTheorique: validReports.reduce((acc, r) => acc + Number(r.mTheoreticalBalance || r.soldeTheorique || 0), 0),
        totalEcarts: validReports.reduce((acc, r) => acc + Number(r.mDifferenceAmount || r.ecart || 0), 0),
    };

    res.status(200).json({ 
        success: true, 
        data: {
            list: rapports,
            stats: stats
        } 
    });
});

exports.listCashierReports = asyncHandler(async (req, res) => {
    const managerId = req.user.userId;
    const filterStoreId = req.user.storeId;

    const startDate = req.query.startDate ? String(req.query.startDate) : null;
    const endDate = req.query.endDate ? String(req.query.endDate) : null;
    const gerantId = req.query.gerant ? parseInt(req.query.gerant, 10) : null;

    let rapports = await CashReportDAL.listReports(
        req.user.userId, 
        req.user.roleCode, 
        filterStoreId,
        req.user.companyId || null,
        { startDate, endDate, gerantId }
    );

    rapports = rapports.filter(r => {
        const role = String(r.creatorRoleCode || '').toUpperCase();
        const isCashier = role === 'CASHIER';
        const isNotManager = Number(r.userId) !== Number(managerId);
        return isCashier && isNotManager; 
    });

    res.status(200).json({ success: true, data: rapports });
});

exports.getMyReports = asyncHandler(async (req, res) => {
    const rapports = await CashReportDAL.getMyReports(req.user.userId);
    res.status(200).json({ success: true, data: rapports });
});

exports.getReports = asyncHandler(async (req, res) => {
    const rapports = await CashReportDAL.getReportsBySession(req.params.cashSessionId);
    res.status(200).json({ success: true, data: rapports });
});

exports.getReportDetails = asyncHandler(async (req, res) => {
    const details = await CashReportDAL.getReportDetails(req.params.cashReportId);
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

// ==========================================
// ✅ CORRECTION CRUCIALE : Appel du Service pour la validation
// ==========================================
exports.approveReport = asyncHandler(async (req, res) => {
    const { cashReportId } = req.params;
    const { commentairesAdmin, comment } = req.body;
    const finalComment = commentairesAdmin || comment || null;

    const isAdmin = req.user.roleCode === 'ADMIN' || req.user.roleCode === 'SUPER_ADMIN';
    const level = isAdmin ? 'ADMIN' : 'MANAGER';

    try {
        // ✅ On passe le companyId explicitement pour éviter l'erreur "Cannot read properties of null"
        const result = await cashService.validerRapport({
            cashReportId: parseInt(cashReportId, 10),
            level,
            userId: req.user.userId,
            comment: finalComment,
            companyId: req.user.companyId, // ✅ L'ID de l'entreprise est passé ici
            req
        });
        res.status(200).json({ success: true, data: result.report, treasury: result.treasury });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

exports.rejectReport = asyncHandler(async (req, res) => {
    const { cashReportId } = req.params;
    const { commentairesAdmin, comment } = req.body;
    const finalComment = commentairesAdmin || comment || null;

    const isAdmin = req.user.roleCode === 'ADMIN' || req.user.roleCode === 'SUPER_ADMIN';
    const level = isAdmin ? 'ADMIN' : 'MANAGER';

    try {
        const result = await cashService.rejeterRapport({
            cashReportId: parseInt(cashReportId, 10),
            level,
            userId: req.user.userId,
            comment: finalComment,
            companyId: req.user.companyId, // ✅ Passé aussi pour le rejet
            req
        });
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ==========================================
// 5. ADMIN : CAISSE CENTRALE
// ==========================================
exports.getCaisseAdmin = asyncHandler(async (req, res) => {
    const caisse = await CashAdminDAL.getOrCreateByUser(req.user.userId, req.user.companyId);
    
    const movements = await TreasuryDAL.getRecentMovementsByCompany(req.user.companyId, 50);
    
    if (caisse) {
        caisse.historique = movements;
    }

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
        
        const categories = await ExpenseDAL.listCategories(companyId);
        let categorieTrouvee = categories ? categories.find(c => c.vcExpenseCategoryCode === codeCategorie) : null;

        if (!categorieTrouvee) {
            categorieTrouvee = await ExpenseDAL.createCategory({
                companyId: companyId,
                vcExpenseCategoryCode: codeCategorie,
                vcExpenseCategory: codeCategorie === 'DIVERS' ? 'Dépenses Diverses' : 'Commissions'
            });
        }

        const expense = await ExpenseDAL.create({
            cashSessionId: session.cashSessionId,
            storeId: storeId,
            expenseCategoryId: categorieTrouvee.expenseCategoryId,
            mAmount: parseFloat(montant),
            vcReason: motif,
            vcStatusCode: 'APPROVED',
            createdByUserId: userId
        });
        
        res.status(201).json({ success: true, data: expense });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || "Erreur lors de l'enregistrement." });
    }
});

exports.correctReport = asyncHandler(async (req, res) => {
    const reportId = req.body.reportId || req.body.cashReportId || req.body.id;
    const newAmount = req.body.newAmount || req.body.montant || req.body.amount;
    const comment = req.body.comment || req.body.reason || req.body.description || 'Correction administrative';

    if (!reportId || newAmount === undefined) {
        return res.status(400).json({ success: false, message: "reportId et newAmount sont obligatoires." });
    }

    try {
        const result = await CashReportDAL.correctReport({
            reportId, newAmount, comment, adminUserId: req.user.userId 
        });
        res.status(200).json({ success: true, message: "Le rapport de caisse a été corrigé avec succès.", data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || "Erreur de correction." });
    }
});

// ==========================================
// 7. TRÉSORERIE (COMPTES MULTI-PARTIES)
// ==========================================
exports.getTreasuryAccounts = asyncHandler(async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({ success: false, message: "companyId est obligatoire." });
    }
    const accounts = await TreasuryDAL.getAccounts(companyId);
    res.status(200).json({ success: true, data: accounts });
});