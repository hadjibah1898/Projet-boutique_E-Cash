
/**
 * @file cashService.js
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

function safeNum(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
  const n = parseFloat(val);
  return Number.isNaN(n) ? 0 : n;
}

async function _sessionRecoveryLines(cashSessionId) {
  return DebtPaymentDAL.getSessionRecoveryLines(cashSessionId);
}

async function _sessionDebtsGranted(cashSessionId) {
  return ThirdPartyAccountDAL.getSessionDebtsGranted(cashSessionId);
}

async function _sessionRecoveries(cashSessionId) {
  const row = await DebtPaymentDAL.getSessionRecoveryTotals(cashSessionId);
  return {
    mTotalRecoveries: safeNum(row.mTotalRecoveries),
    mMobileRecoveries: safeNum(row.mMobileRecoveries),
    nbRecoveries: Number(row.nbRecoveries || 0),
  };
}

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
  const cashEnCaisse = Math.round(
    totalCashSales + cashRecouvrement - totalDepensesApprouvees
  );

  return {
    totalVentes,
    totalVentesCash: Math.round(totalCashSales),
    totalVentesPaid: safeNum(totals.mTotalPaid),
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

async function ouvrirCaisse({
  cashRegisterId,
  userId,
  mOpeningCaisse = 0,
  storeId = null,
  req = null
}) {
  const amount = typeof mOpeningCaisse === 'string'
    ? parseFloat(mOpeningCaisse.replace(/[^0-9.]+/g, '')) || 0
    : Number(mOpeningCaisse) || 0;

  if (amount < 0) {
    throw new Error('CK_CashSession_Amounts : mOpeningCaisse doit être >= 0.');
  }

  const session = await CashSessionDAL.openSession({
    cashRegisterId,
    userId,
    mOpeningCaisse: amount
  });

  await logAction({
    req,
    user: { userId, storeId },
    action: 'CASH_SESSION_OPEN',
    entity: 'tblCashSession',
    entityId: session.cashSessionId,
    status: 'SUCCESS',
    details: { cashRegisterId, mOpeningCaisse: amount },
  });

  return session;
}

async function fermerCaisseEtCreerRapport({
  cashSessionId,
  mClosingAmount,
  user,
  managerComment = null,
  req = null
}) {
  const session = await CashSessionDAL.getById(cashSessionId);

  if (!session) throw new Error('Caisse introuvable.');
  if (session.statusCode !== 'OPEN') {
    throw new Error('Cette session de caisse est déjà clôturée.');
  }

  const finalAmount = Number(mClosingAmount);

  if (!Number.isFinite(finalAmount) || finalAmount < 0) {
    throw new Error('mClosingAmount (montant compté) est obligatoire et >= 0.');
  }

  const existing = await CashReportDAL.getReportsBySession(cashSessionId);

  if (existing.length) {
    await CashSessionDAL.closeSession(cashSessionId, finalAmount).catch(() => null);
    return {
      report: existing[0],
      draftsCancelled: 0,
      draftSaleIds: [],
      alreadyExisted: true
    };
  }

  const cleanup = await saleService.annulerVentesBrouillon(
    cashSessionId,
    user.userId
  ).catch(() => ({ cancelled: 0, saleIds: [] }));

  const bilan = await calculerBilansSession(cashSessionId);
  const closed = await CashSessionDAL.closeSession(cashSessionId, finalAmount);

  const report = await CashReportDAL.createReport({
    cashSessionId,
    mDeclaredClosingAmount: finalAmount,
    vcManagerComment: managerComment,
  });

  if (Number(report.mDifferenceAmount) !== 0) {
    const recipients = await getStoreAlertRecipients(session.storeId).catch(() => []);

    await notifyMany(recipients.filter((id) => id !== user.userId), {
      storeId: session.storeId,
      typeCode: 'CASH_DIFFERENCE',
      title: `Écart de caisse (session ${cashSessionId})`,
      message: `Écart à la clôture : ${report.mDifferenceAmount} (théorique : ${report.mTheoreticalBalance}, compté : ${finalAmount}).`,
      priority: 'HIGH',
      referenceType: 'CASH_REPORT',
      referenceId: report.cashReportId,
      actionUrl: '/cash/reports',
    });
  }

  await logAction({
    req,
    user,
    action: 'CASH_SESSION_CLOSE',
    entity: 'tblCashSession',
    entityId: cashSessionId,
    status: 'SUCCESS',
    details: {
      mClosingAmount: finalAmount,
      mTheoreticalBalance: report.mTheoreticalBalance,
      mDifferenceAmount: report.mDifferenceAmount,
      draftsCancelled: cleanup.cancelled
    },
  });

  return {
    report,
    session: closed,
    bilan,
    draftsCancelled: cleanup.cancelled,
    draftSaleIds: cleanup.saleIds,
    managerComment
  };
}

async function validerRapport({
  cashReportId,
  level,
  userId,
  comment = null,
  treasuryAccountId = null,
  companyId = null,
  req = null
}) {
  const reportDetails = await CashReportDAL.getReportDetails(cashReportId);
  const report = reportDetails?.rapport;

  if (!report) throw new Error('Rapport introuvable.');

  const currentStatus = Number(report.cashReportStatusId);

  if (level === 'MANAGER' && currentStatus !== 1) {
    throw new Error(
      `Le gérant ne peut valider que les rapports en attente (statut 1). Statut actuel : ${currentStatus}.`
    );
  }

  if (level === 'ADMIN' && currentStatus !== 1 && currentStatus !== 2) {
    throw new Error(`Ce rapport a déjà été traité (statut ${currentStatus}).`);
  }

  const approved = await CashReportDAL.decideReport(
    cashReportId,
    level,
    userId,
    true,
    comment
  );

  let treasury = null;

  if (level === 'ADMIN') {
    try {
      const targetCompanyId = companyId || req?.user?.companyId;

      if (!targetCompanyId) {
        throw new Error('Impossible de trouver le companyId.');
      }

      const accounts = await TreasuryDAL.getAccounts(targetCompanyId);

      // IMPORTANT :
      // Ne pas utiliser report.mClosingAmount pour alimenter la trésorerie.
      // Ce montant est le montant compté à la fermeture.
      // Les encaissements réels sont récupérés par moyen de paiement
      // dans le breakdown ci-dessous.

      const breakdown = await SaleDAL.getSessionFintechBreakdown(
        report.cashSessionId
      );

      console.log(
        `🔍 [CashService] Breakdown session ${report.cashSessionId} :`,
        breakdown
      );

      const mappingCode = {
        CASH: 'CENTRAL_CASH',
        ORANGE_MONEY: 'ORANGE_MONEY',
        MTN_MOMO: 'MTN_MOMO',
        CARD: 'BANK',
        BANK_TRANSFER: 'BANK'
      };

      const totalsByAccount = {};

      for (const item of breakdown) {
        const montantFintech = parseFloat(item.totalAmount);

        if (!Number.isNaN(montantFintech) && montantFintech > 0) {
          const targetTypeCode =
            mappingCode[item.typeCode] || item.typeCode;

          if (!totalsByAccount[targetTypeCode]) {
            totalsByAccount[targetTypeCode] = 0;
          }

          totalsByAccount[targetTypeCode] += montantFintech;
        }
      }

      for (const [targetTypeCode, totalAmount] of Object.entries(totalsByAccount)) {
        const targetAccount = accounts.find(
          a => a.typeCode === targetTypeCode
        );

        if (targetAccount && totalAmount > 0) {
          await TreasuryDAL.recordMovement({
            treasuryAccountId: targetAccount.treasuryAccountId,
            typeCode: 'CASH_REPORT_IN',
            mAmount: totalAmount,
            cashReportId,
            vcDescription: `Validation rapport session ${report.cashSessionId} (${targetTypeCode})`.slice(0, 150),
            operatedByUserId: userId,
          });
        } else if (!targetAccount) {
          console.warn(
            `[CashService] ⚠️ Compte introuvable pour le code : ${targetTypeCode}`
          );
        }
      }

    } catch (err) {
      console.error(
        '[CashService] ❌ Trésorerie non comptabilisée :',
        err.message
      );
    }
  }

  await logAction({
    req,
    user: { userId },
    action: 'CASH_REPORT_APPROVE',
    entity: 'tblCashReport',
    entityId: cashReportId,
    status: 'SUCCESS',
    details: {
      level,
      treasuryMovementId: treasury ? treasury.treasuryMovementId : null
    },
  });

  return { report: approved, treasury };
}

async function rejeterRapport({
  cashReportId,
  level,
  userId,
  comment = null,
  req = null
}) {
  const reportDetails = await CashReportDAL.getReportDetails(cashReportId);
  const report = reportDetails?.rapport;

  if (!report) throw new Error('Rapport introuvable.');

  const currentStatus = Number(report.cashReportStatusId);

  if (level === 'MANAGER' && currentStatus !== 1) {
    throw new Error(
      `Le gérant ne peut rejeter que les rapports en attente (statut 1). Statut actuel : ${currentStatus}.`
    );
  }

  if (level === 'ADMIN' && currentStatus !== 1 && currentStatus !== 2) {
    throw new Error(`Ce rapport a déjà été traité (statut ${currentStatus}).`);
  }

  const rejected = await CashReportDAL.decideReport(
    cashReportId,
    level,
    userId,
    false,
    comment
  );

  await logAction({
    req,
    user: { userId },
    action: 'CASH_REPORT_REJECT',
    entity: 'tblCashReport',
    entityId: cashReportId,
    status: 'SUCCESS',
    details: { level, comment },
  });

  return rejected;
}

async function getReportDetails(cashReportId) {
  const reportDetails = await CashReportDAL.getReportDetails(cashReportId);
  const report = reportDetails?.rapport;

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

  return {
    rapport: report,
    ventes: details,
    depenses,
    remboursements,
    dettesAccordees
  };
}

async function getStatistiquesSession(user) {
  const session = await CashSessionDAL.getOpenSessionByUser(user.userId);

  if (!session) {
    return {
      soldeTheorique: 0,
      totalVentes: 0,
      totalRecouvrement: 0,
      session: null
    };
  }

  const bilan = await calculerBilansSession(session.cashSessionId);
  const soldeTheorique = Math.round(
    safeNum(session.mOpeningCaisse) + bilan.cashEnCaisse
  );

  return {
    fondInitial: Math.round(safeNum(session.mOpeningCaisse)),
    ...bilan,
    soldeTheorique,
    session
  };
}

async function getStatutCaisse(user) {
  const session = await CashSessionDAL.getOpenSessionByUser(user.userId);

  if (!session) return null;

  const bilan = await calculerBilansSession(session.cashSessionId);

  return {
    ...session,
    session: {
      ...bilan,
      cashReelActuel: Math.max(
        0,
        Math.round(safeNum(session.mOpeningCaisse) + bilan.cashEnCaisse)
      ),
    },
  };
}

async function listerDepenses({
  storeId = null,
  cashSessionId = null,
  page = 1,
  limit = 10
} = {}) {
  const rows = cashSessionId
    ? await ExpenseDAL.getBySession(cashSessionId)
    : storeId
      ? await ExpenseDAL.getByStore(storeId)
      : [];

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);

  return {
    data: rows.slice((pageNum - 1) * limitNum, pageNum * limitNum),
    totalPages: Math.max(1, Math.ceil(rows.length / limitNum)),
    currentPage: pageNum,
    totalCount: rows.length,
  };
}

async function listerRapports({
  storeId = null,
  gerantId = null,
  startDate = null,
  endDate = null,
  page = 1,
  limit = 10
} = {}) {
  const list = await CashReportDAL.listFiltered({
    storeId,
    gerantId,
    startDate,
    endDate
  });

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);

  return {
    data: list.slice((pageNum - 1) * limitNum, pageNum * limitNum),
    totalPages: Math.max(1, Math.ceil(list.length / limitNum)),
    currentPage: pageNum,
    totalCount: list.length,
  };
}

async function creerDepense({
  cashSessionId,
  storeId,
  expenseCategoryId,
  mAmount,
  vcReason,
  vcProofUrl = null,
  createdByUserId,
  req = null
}) {
  const montant = Number(mAmount);

  if (!Number.isFinite(montant) || montant <= 0) {
    throw new Error('Le montant de la dépense doit être un nombre positif.');
  }

  const session = await CashSessionDAL.getById(cashSessionId);

  if (!session) throw new Error('Session de caisse introuvable.');
  if (session.statusCode !== 'OPEN') {
    throw new Error('Session de caisse fermée : dépense impossible.');
  }

  const bilan = await calculerBilansSession(cashSessionId);
  const dispo = safeNum(session.mOpeningCaisse) + bilan.cashEnCaisse;

  if (montant > dispo) {
    throw new Error(
      `Fonds insuffisants. Disponible : ${Math.floor(dispo).toLocaleString()} (fond : ${session.mOpeningCaisse}, espèces session : ${bilan.cashEnCaisse}).`
    );
  }

  const expense = await ExpenseDAL.create({
    cashSessionId,
    storeId: storeId || session.storeId,
    expenseCategoryId,
    mAmount: montant,
    vcReason,
    vcProofUrl,
    vcStatusCode: 'PENDING',
    createdByUserId,
  });

  await logAction({
    req,
    user: {
      userId: createdByUserId,
      storeId: storeId || session.storeId
    },
    action: 'EXPENSE_CREATE',
    entity: 'tblExpense',
    entityId: expense.expenseId,
    status: 'SUCCESS',
    details: { mAmount: montant, cashSessionId },
  });

  return expense;
}

async function enregistrerEncaissementDetteAdmin({
  companyId,
  montant,
  userId,
  description,
  modePaiement
}) {
  try {
    let accountTypeCode = 'CENTRAL_CASH';
    const mode = String(modePaiement).toUpperCase();

    if (mode.includes('ORANGE') || mode === 'OM') {
      accountTypeCode = 'ORANGE_MONEY';
    } else if (mode.includes('MTN') || mode.includes('MOBI')) {
      accountTypeCode = 'MTN_MOMO';
    } else if (
      mode.includes('VIREMENT') ||
      mode.includes('CARTE') ||
      mode.includes('BANK')
    ) {
      accountTypeCode = 'BANK';
    }

    const accounts = await TreasuryDAL.getAccounts(companyId);
    const targetAccount = accounts.find(
      a => a.typeCode === accountTypeCode
    );

    if (!targetAccount) {
      console.warn(
        `[CashService] Attention: Aucun compte ${accountTypeCode} trouvé pour l'entreprise ${companyId}.`
      );
      return null;
    }

    const treasuryMovement = await TreasuryDAL.recordMovement({
      treasuryAccountId: targetAccount.treasuryAccountId,
      typeCode: 'MANUAL_IN',
      mAmount: Number(montant),
      cashReportId: null,
      vcDescription: (
        description || `Encaissement dette client (${modePaiement})`
      ).slice(0, 150),
      operatedByUserId: userId,
    });

    return treasuryMovement;

  } catch (err) {
    console.error(
      '[CashService] Erreur comptabilisation dette Admin:',
      err.message
    );
    throw err;
  }
}

module.exports = {
  safeNum,
  calculerBilansSession,
  ouvrirCaisse,
  fermerCaisseEtCreerRapport,
  validerRapport,
  rejeterRapport,
  getReportDetails,
  getStatistiquesSession,
  getStatutCaisse,
  listerDepenses,
  listerRapports,
  creerDepense,
  enregistrerEncaissementDetteAdmin
};
