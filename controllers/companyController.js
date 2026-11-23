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
  // ✅ SÉCURITÉ : Seul le SUPER_ADMIN peut voir toutes les entreprises
  if (req.user.roleCode !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: "Accès refusé. Réservé au Super Admin." });
  }
  res.json({ success: true, data: await CompanyDAL.getAll() });
});

exports.getMine = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await CompanyDAL.getByUserId(req.user.userId) });
});

exports.getOne = asyncHandler(async (req, res) => {
  const companyId = Number(req.params.companyId);
  
  // ✅ SÉCURITÉ : Un utilisateur ne peut voir que SA propre entreprise (sauf Super Admin)
  if (req.user.roleCode !== 'SUPER_ADMIN' && companyId !== Number(req.user.companyId)) {
      return res.status(403).json({ success: false, message: "Accès refusé : vous ne pouvez pas voir une autre entreprise." });
  }

  const company = await CompanyDAL.findById(companyId);
  if (!company) return res.status(404).json({ success: false, message: 'Entreprise introuvable.' });
  res.json({ success: true, data: company });
});

exports.update = asyncHandler(async (req, res) => {
  const companyId = Number(req.params.companyId);

  // ✅ SÉCURITÉ : Un utilisateur ne peut modifier que SA propre entreprise (sauf Super Admin)
  if (req.user.roleCode !== 'SUPER_ADMIN' && companyId !== Number(req.user.companyId)) {
      return res.status(403).json({ success: false, message: "Accès refusé : vous ne pouvez pas modifier une autre entreprise." });
  }

  const company = await CompanyDAL.update(companyId, req.body);
  if (!company) return res.status(404).json({ success: false, message: 'Entreprise introuvable.' });
  res.json({ success: true, data: company });
});

exports.remove = asyncHandler(async (req, res) => {
  const companyId = Number(req.params.companyId);

  // ✅ SÉCURITÉ : Un utilisateur ne peut supprimer que SA propre entreprise (sauf Super Admin)
  if (req.user.roleCode !== 'SUPER_ADMIN' && companyId !== Number(req.user.companyId)) {
      return res.status(403).json({ success: false, message: "Accès refusé : vous ne pouvez pas supprimer une autre entreprise." });
  }

  const ok = await CompanyDAL.softDelete(companyId);
  if (!ok) return res.status(404).json({ success: false, message: 'Entreprise introuvable.' });
  res.json({ success: true, message: 'Entreprise désactivée.' });
});