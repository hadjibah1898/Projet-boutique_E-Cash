/**
 * @file storeAccess.js
 * @description Contrôle d'appartenance : vérifie que l'utilisateur est autorisé sur
 * la boutique ciblée (tblUserStore), et sur la session de caisse ciblée — accès
 * session uniquement via CashSessionDAL (dbo.sp_GetCashSessionById), aucun SQL inline.
 * @module Middleware/StoreAccess
 */

const CashSessionDAL = require('../dal/cashSessionDAL');
const asyncHandler = require('./asyncHandler');

/** Extrait le storeId depuis params / query / body. */
function extractStoreId(req) {
  return req.params.storeId
    || req.body.storeId
    || req.query.storeId
    || null;
}

/**
 * Vérifie que l'utilisateur connecté est rattaché à la boutique ciblée.
 * SUPER_ADMIN bypass. S'applique quand un storeId est fourni (params/query/body).
 */
const requireStoreAccess = asyncHandler(async (req, res, next) => {
  if (req.user.roleCode === 'SUPER_ADMIN') return next();

  const storeId = Number(extractStoreId(req));
  if (!storeId) return next(); // pas de boutique ciblée -> rien à vérifier ici

  if (!Array.isArray(req.user.stores) || !req.user.stores.includes(storeId)) {
    return res.status(403).json({ success: false, message: 'Boutique non autorisée pour cet utilisateur.' });
  }
  next();
});

/**
 * Vérifie que la session de caisse ciblée (params.cashSessionId) appartient
 * à l'utilisateur connecté (ck Cashier/Manager : uniquement sa propre session).
 * SUPER_ADMIN bypass.
 */
const requireOwnCashSession = asyncHandler(async (req, res, next) => {
  if (req.user.roleCode === 'SUPER_ADMIN') return next();

  const cashSessionId = Number(req.params.cashSessionId || req.body.cashSessionId || 0);
  if (!cashSessionId) return next();

  const session = await CashSessionDAL.getById(cashSessionId);

  if (!session) {
    return res.status(404).json({ success: false, message: 'Session de caisse introuvable.' });
  }
  if (session.userId !== req.user.userId) {
    return res.status(403).json({ success: false, message: 'Cette session de caisse ne vous appartient pas.' });
  }
  next();
});

module.exports = { requireStoreAccess, requireOwnCashSession };
