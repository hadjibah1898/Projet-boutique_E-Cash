/**
 * @file userController.js
 * @description Gestion des utilisateurs (profil, activation) + affectations rôles.
 * @module Controllers/User
 */

const UserDAL = require('../dal/userDAL');
const UserCompanyDAL = require('../dal/userCompanyDAL');
const UserStoreDAL = require('../dal/userStoreDAL');
const asyncHandler = require('../middleware/asyncHandler');

exports.createCashier = asyncHandler(async (req, res) => {
  // Si c'est un manager, il doit avoir un storeId dans son token
  if (req.user.roleCode === 'MANAGER' && !req.user.storeId) {
    return res.status(403).json({ success: false, message: 'Le gérant doit être connecté à sa boutique.' });
  }
  
  // Si c'est un Admin ou SuperAdmin, on récupère le storeId depuis le body
  const storeId = req.user.storeId || req.body.storeId;
  if (!storeId) {
    return res.status(400).json({ success: false, message: 'storeId est obligatoire.' });
  }

  const data = await UserDAL.createCashier(req.body, req.user.userId, storeId);
  res.status(201).json({ success: true, data });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const user = await UserDAL.update(req.user.userId, req.body);
  if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });

  // Changement de mot de passe effectué -> on lève l'obligation
  let mustChangePassword = req.user.mustChangePassword === true;
  if (req.body && req.body.password) {
    await UserDAL.setMustChangePassword(req.user.userId, false);
    mustChangePassword = false;
  }

  res.json({ success: true, data: { ...user, mustChangePassword } });
});

exports.getOne = asyncHandler(async (req, res) => {
  const user = await UserDAL.findById(req.params.userId);
  if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
  res.json({ success: true, data: user });
});

exports.setActive = asyncHandler(async (req, res) => {
  // ✅ CORRECTION ICI : On passe req.user.userId pour que SQL Server puisse 
  // vérifier les règles (empêcher l'auto-désactivation, protéger le SuperAdmin)
  const user = await UserDAL.setActive(
    req.params.userId, 
    !!req.body.btIsActive, 
    req.user.userId 
  );
  
  if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
  res.json({ success: true, data: user });
});

exports.assignCompanyRole = asyncHandler(async (req, res) => {
  const data = await UserCompanyDAL.assign({ ...req.body, userId: req.params.userId, createdByUserId: req.user.userId });
  res.status(201).json({ success: true, data });
});

exports.assignStoreRole = asyncHandler(async (req, res) => {
  const data = await UserStoreDAL.assign({ ...req.body, userId: req.params.userId, assignedByUserId: req.user.userId });
  res.status(201).json({ success: true, data });
});