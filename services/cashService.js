/**
 * @file cashService.js
 * @description Service métier caisse — adaptation du caisseService Mongoose au site SQL.
 * Architecture 3-tiers : App -> API (routes -> controllers -> services -> dal) -> SQL Server.
 *  - Le service ne connaît ni req ni res (sauf pour l'audit optionnel).
 *  - Toute persistance passe par les DAL : aucune requête SQL directe dans ce service.
 * Correspondances :
 *  - OuvertureCaisse  -> tblCashSession (+ tblRefCashSessionStatus OPEN/CLOSED)
 *  - RapportCaisse    -> tblCashReport (+ tblRefCashReportStatus PENDING_MANAGER/_ADMIN/APPROVED/REJECTED)
 *  - Vente            -> tblSale + tblSalePayment (SaleDAL.getSessionTotals)
 *  - Depense          -> tblExpense (ExpenseDAL.getSessionSummary / getBySession)
 *  - DebtPayment      -> tblDebtPayment (recouvrements de la session)
 *  - CaisseAdmin      -> tblTreasuryAccount + tblTreasuryMovement (type CASH_REPORT_IN)

 *  totalRapportsValides, VALIDE_PAR_GERANT, CaisseAdmin Mongoose, sync offline.
 * @module Services/Cash
 */

const CashSessionDAL = require('../dal/cashSessionDAL');
const CashReportDAL = require('../dal/cashReportDAL');
const DebtPaymentDAL = require('../dal/debtPaymentDAL');
const ThirdPartyAccountDAL = require('../dal/thirdPartyAccountDAL');
const SaleDAL = require('../dal/saleDAL');
const ExpenseDAL = require('../dal/expenseDAL');
const StoreDAL = require('../dal/storeDAL');
const TreasuryDAL = require('../dal/treasuryDAL');
const saleService = require('./saleService');
const { notifyMany, getStoreAlertRecipients } = require('./notificationService');
const { logAction } = require('./auditLogService');

/** Convertit MONEY/DECIMAL/SQL en nombre sûr (équivalent du safeNum Mongoose). */
function safeNum(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
  const n = parseFloat(val);
  return Number.isNaN(n) ? 0 : n;
}

/** Recouvrements détaillés d'une session (SP sp_GetSessionRecoveryLines). */
async function _sessionRecoveryLines(cashSessionId) {
  return DebtPaymentDAL.getSessionRecoveryLines(cashSessionId);
}

/** Dettes accordées (CUSTOMER_DEBT) sur les ventes d'une session (SP sp_GetSessionDebtsGranted). */
async function _sessionDebtsGranted(cashSessionId) {
  return ThirdPartyAccountDAL.getSessionDebtsGranted(cashSessionId);
}

/**
 * Recouvrements (dettes clients/fournisseurs) encaissés sur une session.
 * @private
 */
async function _sessionRecoveries(cashSessionId) {
  const row = await DebtPaymentDAL.getSessionRecoveryTotals(cashSessionId);
  return {
    mTotalRecoveries: safeNum(row.mTotalRecoveries),
    mMobileRecoveries: safeNum(row.mMobileRecoveries),
    nbRecoveries: Number(row.nbRecoveries || 0),
  };
}

/**
 * Bilan complet d'une session (équivalent calculerBilansSession).
 * cashEnCaisse = espèces ventes + espèces recouvrements - dépenses approuvées.
 */
async function calculerBilansSession(cashSessionId) {
  if (!cashSessionId) throw new Error('cashSessionId est obligatoire.');
  const [totals, expenses, recoveries] = await Promise.all([
    SaleDAL.getSessionTotals(cashSessionId),
    ExpenseDAL.getSessionSummary(cashSessionId),
    _sessionRecoveries(cashSessionId),
  ]);

  const totalVentes = safeNum(totals.mTotalSales);
  const totalCashSales = safeNum(totals.mTotalCash);
  const totalMobileSales = safeNum(totals.mTotalMobileMoney);
  const totalDettesAccordees = safeNum(totals.mTotalCredit);
  const totalDepenses = safeNum(expenses.mTotalExpenses);
  const totalDepensesApprouvees = safeNum(expenses.mTotalApproved);
  const totalRecouvrement = recoveries.mTotalRecoveries;
  const cashRecouvrement = totalRecouvrement - recoveries.mMobileRecoveries;
  const cashEnCaisse = Math.round(totalCashSales + cashRecouvrement - totalDepensesApprouvees);

  return {
    totalVentes, totalVentesCash: Math.round(totalCashSales),
    totalVentesPaid: safeNum(totals.mTotalPaid), // pour rapprochement
    totalMobileMoneySales: Math.round(totalMobileSales),
    totalMobileMoneyRecoveries: Math.round(recoveries.mMobileRecoveries),
    totalMobileMoney: Math.round(totalMobileSales + recoveries.mMobileRecoveries),
    totalDettesAccordees: Math.round(totalDettesAccordees),
    totalDepenses: Math.round(totalDepenses),
    totalDepensesApprouvees: Math.round(totalDepensesApprouvees),
    totalRecouvrement: Math.round(totalRecouvrement),
    nbRecouvrements: recoveries.nbRecoveries,
    nombreVentes: Number(totals.nbVentes ?? totals.nbSales ?? 0),
    cashEnCaisse,
  };
}

/**
 * Ouvre une session de caisse (équivalent ouvrirCaisse).
 * Unicité déjà garantie : middleware checkSingleOpenSession + verrou DAL.
 */
async function ouvrirCaisse({ cashRegisterId, userId, mOpeningCaisse = 0, storeId = null, req = null }) {
  const amount = typeof mOpeningCaisse === 'string'
    ? parseFloat(mOpeningCaisse.replace(/[^0-9.]+/g, '')) || 0
    : Number(mOpeningCaisse) || 0;
  if (amount < 0) throw new Error('CK_CashSession_Amounts : mOpeningCaisse doit être >= 0.');
  const session = await CashSessionDAL.openSession({ cashRegisterId, userId, mOpeningCaisse: amount });
  await logAction({
    req, user: { userId, storeId }, action: 'CASH_SESSION_OPEN',
    entity: 'tblCashSession', entityId: session.cashSessionId,
    status: 'SUCCESS', details: { cashRegisterId, mOpeningCaisse: amount },
  });
  return session;
}

/**
 * Clôture complète : brouillons annulés, bilan, rapport PENDING_MANAGER,
 * alerte CASH_DIFFERENCE si écart, puis session CLOSED.
 * (équivalent fermerCaisseEtCreerRapport)
 */
async function fermerCaisseEtCreerRapport({ cashSessionId, mClosingAmount, user, managerComment = null, req = null }) {
  const session = await CashSessionDAL.getById(cashSessionId);
  if (!session) throw new Error('Caisse introuvable.');
  if (session.statusCode !== 'OPEN') throw new Error('Cette session de caisse est déjà clôturée.');
  const finalAmount = Number(mClosingAmount);
  if (!Number.isFinite(finalAmount) || finalAmount < 0) {
    throw new Error('mClosingAmount (montant compté) est obligatoire et >= 0.');
  }
  const existing = await CashReportDAL.getBySession(cashSessionId);
  if (existing.length) {
    await CashSessionDAL.closeSession(cashSessionId, finalAmount).catch(() => null);
    return { report: existing[0], draftsCancelled: 0, draftSaleIds: [], alreadyExisted: true };
  }
  const cleanup = await saleService.annulerVentesBrouillon(cashSessionId, user.userId)
    .catch(() => ({ cancelled: 0, saleIds: [] }));
  const bilan = await calculerBilansSession(cashSessionId);
  // sp_CreateCashReport exige une session CLOSED : clôture AVANT création du rapport.
  const closed = await CashSessionDAL.closeSession(cashSessionId, finalAmount);
  const report = await CashReportDAL.create({
    cashSessionId, mClosingAmount: finalAmount,
    recoveries: { mTotalRecoveries: bilan.totalRecouvrement },
  });
  if (Number(report.mDifferenceAmount) !== 0) {
    const recipients = await getStoreAlertRecipients(session.storeId).catch(() => []);
    await notifyMany(recipients.filter((id) => id !== user.userId), {
      storeId: session.storeId, typeCode: 'CASH_DIFFERENCE',
      title: `Écart de caisse (session ${cashSessionId})`,
      message: `Écart à la clôture : ${report.mDifferenceAmount} (théorique : ${report.mTheoreticalBalance}, compté : ${finalAmount}).`,
      priority: 'HIGH', referenceType: 'CASH_REPORT', referenceId: report.cashReportId,
      actionUrl: '/cash/reports',
    });
  }
  await logAction({
    req, user, action: 'CASH_SESSION_CLOSE', entity: 'tblCashSession', entityId: cashSessionId,
    status: 'SUCCESS',
    details: { mClosingAmount: finalAmount, mTheoreticalBalance: report.mTheoreticalBalance, mDifferenceAmount: report.mDifferenceAmount, draftsCancelled: cleanup.cancelled },
  });
  return { report, session: closed, bilan, draftsCancelled: cleanup.cancelled, draftSaleIds: cleanup.saleIds, managerComment };
}

/** Valide un rapport puis comptabilise en trésorerie (niveau ADMIN). */
async function validerRapport({ cashReportId, level, userId, comment = null, treasuryAccountId = null, req = null }) {
  const report = await CashReportDAL.getById(cashReportId);
  if (!report) throw new Error('Rapport introuvable.');
  const expected = level === 'MANAGER' ? 'PENDING_MANAGER' : 'PENDING_ADMIN';
  if (report.statusCode !== expected) {
    throw new Error(`Opération impossible : ce rapport est « ${report.statusCode} » (attendu : ${expected}).`);
  }
  const approved = await CashReportDAL.approve(cashReportId, level, userId, true, comment);
  let treasury = null;
  if (level === 'ADMIN') {
    try {
      let accountId = treasuryAccountId;
      if (!accountId) {
        const accounts = await TreasuryDAL.getAccounts((await StoreDAL.findById(report.storeId)).companyId);
        const match = accounts.find((a) => a.storeId === report.storeId && a.typeCode === 'STORE_CASH')
          || accounts.find((a) => a.typeCode === 'CENTRAL_CASH') || accounts[0];
        if (!match) throw new Error('Aucun compte de trésorerie pour ce rapport.');
        accountId = match.treasuryAccountId;
      }
      treasury = await TreasuryDAL.recordMovement({
        treasuryAccountId: accountId, typeCode: 'CASH_REPORT_IN',
        mAmount: Math.abs(Number(report.mClosingAmount)),
        cashReportId, vcDescription: `Validation rapport session ${report.cashSessionId}`.slice(0, 150),
        operatedByUserId: userId,
      });
    } catch (err) { console.error('[CashService] Trésorerie non comptabilisée :', err.message); }
  }
  await logAction({
    req, user: { userId }, action: 'CASH_REPORT_APPROVE', entity: 'tblCashReport',
    entityId: cashReportId, status: 'SUCCESS',
    details: { level, treasuryMovementId: treasury ? treasury.treasuryMovementId : null },
  });
  return { report: approved, treasury };
}

/** Rejette un rapport (REJECTED), quel que soit le niveau. */
async function rejeterRapport({ cashReportId, level, userId, comment = null, req = null }) {
  const report = await CashReportDAL.getById(cashReportId);
  if (!report) throw new Error('Rapport introuvable.');
  const expected = level === 'MANAGER' ? 'PENDING_MANAGER' : 'PENDING_ADMIN';
  if (report.statusCode !== expected) {
    throw new Error(`Opération impossible : ce rapport est « ${report.statusCode} » (attendu : ${expected}).`);
  }
  const rejected = await CashReportDAL.approve(cashReportId, level, userId, false, comment);
  await logAction({
    req, user: { userId }, action: 'CASH_REPORT_REJECT', entity: 'tblCashReport',
    entityId: cashReportId, status: 'SUCCESS', details: { level, comment },
  });
  return rejected;
}

/** Détail complet d'un rapport : ventes + lignes + paiements + dépenses. */
async function getReportDetails(cashReportId) {
  const report = await CashReportDAL.getById(cashReportId);
  if (!report) throw new Error('Rapport introuvable.');
  const [ventes, depenses, remboursements, dettesAccordees] = await Promise.all([
    SaleDAL.getBySession(report.cashSessionId),
    ExpenseDAL.getBySession(report.cashSessionId),
    _sessionRecoveryLines(report.cashSessionId),
    _sessionDebtsGranted(report.cashSessionId),
  ]);
  const details = await Promise.all((ventes || []).map(async (v) => ({
    ...v,
    lines: await SaleDAL.getDetails(v.saleId).catch(() => []),
    payments: await SaleDAL.getPayments(v.saleId).catch(() => []),
  })));
  return { rapport: report, ventes: details, depenses, remboursements, dettesAccordees };
}

/** Statistiques temps réel de MA session (modale de clôture). */
async function getStatistiquesSession(user) {
  const session = await CashSessionDAL.getOpenSessionByUser(user.userId);
  if (!session) return { soldeTheorique: 0, totalVentes: 0, totalRecouvrement: 0, session: null };
  const bilan = await calculerBilansSession(session.cashSessionId);
  const soldeTheorique = Math.round(safeNum(session.mOpeningCaisse) + bilan.cashEnCaisse);
  return { fondInitial: Math.round(safeNum(session.mOpeningCaisse)), ...bilan, soldeTheorique, session };
}

/** Statut de caisse : session OPEN + bilan + espèces réelles estimées. */
async function getStatutCaisse(user) {
  const session = await CashSessionDAL.getOpenSessionByUser(user.userId);
  if (!session) return null;
  const bilan = await calculerBilansSession(session.cashSessionId);
  return {
    ...session,
    session: { ...bilan, cashReelActuel: Math.max(0, Math.round(safeNum(session.mOpeningCaisse) + bilan.cashEnCaisse)) },
  };
}

/** Dépenses paginées (session prioritaire, sinon boutique). */
async function listerDepenses({ storeId = null, cashSessionId = null, page = 1, limit = 10 } = {}) {
  const rows = cashSessionId ? await ExpenseDAL.getBySession(cashSessionId)
    : storeId ? await ExpenseDAL.getByStore(storeId) : [];
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  return {
    data: rows.slice((pageNum - 1) * limitNum, pageNum * limitNum),
    totalPages: Math.max(1, Math.ceil(rows.length / limitNum)),
    currentPage: pageNum, totalCount: rows.length,
  };
}

/** Rapports paginés (boutique + filtres gérant / dates). */
async function listerRapports({ storeId = null, gerantId = null, startDate = null, endDate = null, page = 1, limit = 10 } = {}) {
  const list = await CashReportDAL.listFiltered({ storeId, gerantId, startDate, endDate });
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  return {
    data: list.slice((pageNum - 1) * limitNum, pageNum * limitNum),
    totalPages: Math.max(1, Math.ceil(list.length / limitNum)),
    currentPage: pageNum, totalCount: list.length,
  };
}

/** Crée une dépense avec contrôle de fonds disponibles. */
async function creerDepense({ cashSessionId, storeId, expenseCategoryId, mAmount, vcReason, vcProofUrl = null, createdByUserId, req = null }) {
  const montant = Number(mAmount);
  if (!Number.isFinite(montant) || montant <= 0) {
    throw new Error('Le montant de la dépense doit être un nombre positif.');
  }
  const session = await CashSessionDAL.getById(cashSessionId);
  if (!session) throw new Error('Session de caisse introuvable.');
  if (session.statusCode !== 'OPEN') throw new Error('Session de caisse fermée : dépense impossible.');
  const bilan = await calculerBilansSession(cashSessionId);
  const dispo = safeNum(session.mOpeningCaisse) + bilan.cashEnCaisse;
  if (montant > dispo) {
    throw new Error(`Fonds insuffisants. Disponible : ${Math.floor(dispo).toLocaleString()} (fond : ${session.mOpeningCaisse}, espèces session : ${bilan.cashEnCaisse}).`);
  }
  const expense = await ExpenseDAL.create({
    cashSessionId, storeId: storeId || session.storeId, expenseCategoryId,
    mAmount: montant, vcReason, vcProofUrl, vcStatusCode: 'PENDING', createdByUserId,
  });
  await logAction({
    req, user: { userId: createdByUserId, storeId: storeId || session.storeId },
    action: 'EXPENSE_CREATE', entity: 'tblExpense', entityId: expense.expenseId,
    status: 'SUCCESS', details: { mAmount: montant, cashSessionId },
  });
  return expense;
}

module.exports = {
  safeNum, calculerBilansSession, ouvrirCaisse, fermerCaisseEtCreerRapport,
  validerRapport, rejeterRapport, getReportDetails, getStatistiquesSession,
  getStatutCaisse, listerDepenses, listerRapports, creerDepense,
};
