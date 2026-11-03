/**
 * @file storeController.js
 * @description Gestion des boutiques (tblStore) et de leurs utilisateurs (tblUserStore).
 * @module Controllers/Store
 */

const StoreDAL = require('../dal/storeDAL');
const UserStoreDAL = require('../dal/userStoreDAL');
const asyncHandler = require('../middleware/asyncHandler');

exports.create = asyncHandler(async (req, res) => {
  const store = await StoreDAL.create({ ...req.body, createdByUserId: req.user.userId });
  res.status(201).json({ success: true, data: store });
});

exports.getByCompany = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await StoreDAL.getByCompanyId(req.params.companyId) });
});

exports.getOne = asyncHandler(async (req, res) => {
  const store = await StoreDAL.findById(req.params.storeId);
  if (!store) return res.status(404).json({ success: false, message: 'Boutique introuvable.' });
  res.json({ success: true, data: store });
});

exports.update = asyncHandler(async (req, res) => {
  const store = await StoreDAL.update(req.params.storeId, req.body);
  if (!store) return res.status(404).json({ success: false, message: 'Boutique introuvable.' });
  res.json({ success: true, data: store });
});

exports.remove = asyncHandler(async (req, res) => {
  const ok = await StoreDAL.softDelete(req.params.storeId);
  if (!ok) return res.status(404).json({ success: false, message: 'Boutique introuvable.' });
  res.json({ success: true, message: 'Boutique désactivée.' });
});

exports.listUsers = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await UserStoreDAL.listUsers(req.params.storeId) });
});

exports.assignUser = asyncHandler(async (req, res) => {
  const data = await UserStoreDAL.assign({
    storeId: req.params.storeId,
    userId: req.body.userId,
    roleCode: req.body.roleCode,
    assignedByUserId: req.user.userId
  });
  res.status(201).json({ success: true, data });
});
