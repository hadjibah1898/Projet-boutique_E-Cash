/**
 * @file authMiddleware.js
 * @description Authentification JWT + habilitations — ACCES EXCLUSIF par abstraction SQL.
 * Lecture : vw_UserProfile / sp_GetUserContext / sp_ManageUser(@Action='GET').
 * INTERDIT : tout acces direct a dbo.tblUser / tblUserCompany / tblUserStore.
 * @module Middleware/Auth
 */

const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const UserDAL = require('../dal/userDAL');
const { checkMustChangePassword } = require('./passwordMiddleware');

/**
 * Vérifie le token JWT et charge le contexte utilisateur (entreprise, boutique, rôle).
 */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token manquant.' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalide ou expiré.' });
  }

  // Profil réel en base via sp_ManageUser(@Action='GET') -> vw_UserProfile
  // (btIsActive rechargé à chaque requête : la désactivation est effective immédiatement)
  const profile = await UserDAL.findById(payload.userId);
  if (!profile || !profile.btIsActive) {
    return res.status(401).json({ success: false, message: 'Compte introuvable ou désactivé.' });
  }

  // Contexte d'habilitation via sp_GetUserContext (1 seul aller-retour)
  const context = await UserDAL.getContext(profile.userId);

  req.user = {
    userId: profile.userId,
    vcLastName: profile.vcLastName,
    vcFirstName: profile.vcFirstName,
    vcEmail: profile.vcEmail,
    companyId: payload.companyId || null,
    storeId: payload.storeId || null,
    roleCode: payload.roleCode || null,
    roleId: payload.roleId || null,
    // Boutiques autorisées (vw_UserScopeAssignment actives) — pour requireStoreAccess
    stores: context.stores.map((s) => s.storeId),
    // Flag « changement de mot de passe obligatoire » rechargé à chaque requête
    mustChangePassword: profile.mustChangePassword === true
  };

  // Garde de sécurité : bloque l'accès tant que le mot de passe doit être changé
  return checkMustChangePassword(req, res, next);
});

/**
 * Restreint l'accès aux rôles listés (codes de tblRefRole : SUPER_ADMIN, ADMIN, MANAGER, CASHIER).
 * @param {...string} roleCodes
 */
const requireRole = (...roleCodes) => (req, res, next) => {
  if (!req.user || !req.user.roleCode || !roleCodes.includes(req.user.roleCode)) {
    return res.status(403).json({ success: false, message: 'Accès refusé pour ce rôle.' });
  }
  next();
};

module.exports = { protect, requireRole };

