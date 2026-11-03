/**
 * @file purchaseController.js
 * @description Approvisionnements (tblPurchase + tblPurchaseDetail).
 * @module Controllers/Purchase
 */

const PurchaseDAL = require('../dal/purchaseDAL');
const asyncHandler = require('../middleware/asyncHandler');

exports.create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await PurchaseDAL.create({ ...req.body, createdByUserId: req.user.userId }) });
});

exports.getByStore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await PurchaseDAL.getByStore(req.params.storeId) });
});

exports.getDetails = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await PurchaseDAL.getDetails(req.params.purchaseId) });
});

exports.receive = asyncHandler(async (req, res) => {
  const result = await PurchaseDAL.receive(req.params.purchaseId, req.body.receptions || [], req.user.userId);
  res.json({ success: true, data: result });
});

exports.cancel = asyncHandler(async (req, res) => {
  const ok = await PurchaseDAL.cancel(req.params.purchaseId);
  if (!ok) return res.status(400).json({ success: false, message: 'Achat non annulable (statut ou introuvable).' });
  res.json({ success: true, message: 'Achat annulé.' });
});
