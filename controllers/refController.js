/**
 * @file refController.js
 * @description Lecture des tables de référence (tblRef*).
 * @module Controllers/Ref
 */

const RefDAL = require('../dal/refDAL');
const asyncHandler = require('../middleware/asyncHandler');

exports.listRefs = asyncHandler(async (req, res) => {
  res.json({ success: true, data: RefDAL.listRefs() });
});

exports.getAll = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await RefDAL.getAll(req.params.refKey) });
});

exports.getByCode = asyncHandler(async (req, res) => {
  const row = await RefDAL.getByCode(req.params.refKey, req.params.code);
  if (!row) return res.status(404).json({ success: false, message: 'Code introuvable.' });
  res.json({ success: true, data: row });
});
