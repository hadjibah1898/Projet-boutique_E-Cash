/**
 * @file expenseController.js
 * @description Dépenses (tblExpenseCategory + tblExpense).
 * @module Controllers/Expense
 */

const ExpenseDAL = require('../dal/expenseDAL');
const cashService = require('../services/cashService');
const asyncHandler = require('../middleware/asyncHandler');

exports.createCategory = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await ExpenseDAL.createCategory(req.body) });
});

exports.listCategories = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await ExpenseDAL.listCategories(req.params.companyId) });
});

exports.create = asyncHandler(async (req, res) => {
  // Contrôle de fonds disponibles via le service (équivalent creerDepense Mongoose).
  const expense = await cashService.creerDepense({
    cashSessionId: req.cashSessionId || req.body.cashSessionId,
    storeId: req.body.storeId || req.user.storeId,
    expenseCategoryId: req.body.expenseCategoryId,
    mAmount: req.body.mAmount,
    vcReason: req.body.vcReason,
    vcProofUrl: req.body.vcProofUrl || null,
    createdByUserId: req.user.userId,
    req,
  });
  res.status(201).json({ success: true, data: expense });
});

exports.getByStore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await ExpenseDAL.getByStore(req.params.storeId) });
});

/** Dépenses de la session de caisse (GET /expenses/session/:cashSessionId). */
exports.getBySession = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await ExpenseDAL.getBySession(req.params.cashSessionId) });
});

/** Dépenses paginées (filtres query : storeId / cashSessionId / page / limit). */
exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await cashService.listerDepenses(req.query) });
});

exports.approve = asyncHandler(async (req, res) => {
  const expense = await ExpenseDAL.approve(req.params.expenseId, req.user.userId, req.body.vcStatusCode);
  if (!expense) return res.status(404).json({ success: false, message: 'Dépense introuvable.' });
  res.json({ success: true, data: expense });
});
