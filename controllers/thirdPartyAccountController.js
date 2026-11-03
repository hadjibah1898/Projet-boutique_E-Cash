/**
 * @file thirdPartyAccountController.js
 * @description Comptes tiers et paiements de dettes (tblThirdPartyAccount + tblDebtPayment).
 * @module Controllers/ThirdPartyAccount
 */

const ThirdPartyAccountDAL = require('../dal/thirdPartyAccountDAL');
const DebtPaymentDAL = require('../dal/debtPaymentDAL');
const asyncHandler = require('../middleware/asyncHandler');

exports.getOrCreate = asyncHandler(async (req, res) => {
  const account = await ThirdPartyAccountDAL.getOrCreate(req.body);
  res.status(201).json({ success: true, data: account });
});

exports.payDebt = asyncHandler(async (req, res) => {
  // Le recouvrement est rattaché à la session de caisse ouverte (injectée par checkCaisseOuverte).
  const result = await DebtPaymentDAL.create({
    ...req.body,
    cashSessionId: req.cashSessionId || req.body.cashSessionId,
    operatedByUserId: req.user.userId
  });
  res.status(201).json({ success: true, data: result });
});

exports.getDebtHistory = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await DebtPaymentDAL.getByAccount(req.params.thirdPartyAccountId) });
});

/** Compte tiers d'un client (avec solde) — GET /by-customer/:customerId?companyId=. */
exports.getByCustomer = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || req.user.companyId;
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId obligatoire (query ou token).' });
  }
  const account = await ThirdPartyAccountDAL.getByCustomer(Number(companyId), req.params.customerId);
  if (!account) return res.status(404).json({ success: false, message: 'Aucun compte tiers pour ce client.' });
  res.json({ success: true, data: account });
});
