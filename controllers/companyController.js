/**
 * @file companyController.js
 * @description Gestion des entreprises (tblCompany).
 * @module Controllers/Company
 */

const CompanyDAL = require('../dal/companyDAL');
const asyncHandler = require('../middleware/asyncHandler');

exports.create = asyncHandler(async (req, res) => {
  const company = await CompanyDAL.create(req.body);
  res.status(201).json({ success: true, data: company });
});

exports.getAll = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await CompanyDAL.getAll() });
});

exports.getMine = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await CompanyDAL.getByUserId(req.user.userId) });
});

exports.getOne = asyncHandler(async (req, res) => {
  const company = await CompanyDAL.findById(req.params.companyId);
  if (!company) return res.status(404).json({ success: false, message: 'Entreprise introuvable.' });
  res.json({ success: true, data: company });
});

exports.update = asyncHandler(async (req, res) => {
  const company = await CompanyDAL.update(req.params.companyId, req.body);
  if (!company) return res.status(404).json({ success: false, message: 'Entreprise introuvable.' });
  res.json({ success: true, data: company });
});

exports.remove = asyncHandler(async (req, res) => {
  const ok = await CompanyDAL.softDelete(req.params.companyId);
  if (!ok) return res.status(404).json({ success: false, message: 'Entreprise introuvable.' });
  res.json({ success: true, message: 'Entreprise désactivée.' });
});
