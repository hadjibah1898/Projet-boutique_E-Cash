/**
 * @file passwordMiddleware.js
 * @description Middleware de vérification du changement obligatoire de mot de passe.
 * Adapté au site GestionsBoutiques (SQL Server, tblUser).
 * Périmètre : ADMIN, MANAGER et CASHIER. Le SUPER_ADMIN n'est JAMAIS bloqué.
 *  - `req.user.mustChangePassword` provient de la base (colonne btMustChangePassword si elle
 *    existe, sinon repli automatique sur « première connexion » = dtLastLoginAt IS NULL).
 *  - Les routes indispensables au changement de mot de passe restent accessibles
 *    (allowlist) pour éviter un blocage définitif du compte.
 *  - Toute tentative bloquée est journalisée dans dbo.tblAuditLog via auditLogService.
 * @module Middleware/Password
 */

const { logAction } = require('../services/auditLogService');

/**
 * Routes autorisées même quand un changement de mot de passe est requis.
 * (Sinon l'utilisateur ne pourrait jamais changer son mot de passe.)
 */
const ALLOWED_PATHS = [
  { method: 'GET', path: '/api/auth/me' },
  { method: 'PUT', path: '/api/users/me' },
  { method: 'PATCH', path: '/api/users/me' }
];

/** Vérifie si la requête cible une route autorisée (comparaison sur le chemin, sans query). */
function isAllowed(req) {
  const path = (req.originalUrl || req.path || '').split('?')[0];
  return ALLOWED_PATHS.some((rule) => rule.method === req.method && rule.path === path);
}

/**
 * Bloque l'accès si l'utilisateur doit changer son mot de passe.
 * À utiliser APRÈS `protect` (dépend de req.user).
 */
  /** Bloque l'accès si l'utilisateur doit changer son mot de passe.
   *  Concerné : ADMIN, MANAGER, CASHIER. Le SUPER_ADMIN n'est jamais bloqué.
   */
async function checkMustChangePassword(req, res, next) {
  if (!req.user) return next();

  // Le SuperAdmin est exempté : il gère les comptes, il n'est pas soumis à cette règle
  if (req.user.roleCode === 'SUPER_ADMIN') return next();

  if (!req.user.mustChangePassword) return next();
  if (isAllowed(req)) return next();

  // Journalisation de l'accès bloqué (mesure de sécurité)
  await logAction({
    req,
    user: req.user,
    action: 'ACCESS_BLOCKED_PWD_CHANGE_REQUIRED',
    entity: 'tblUser',
    entityId: req.user.userId,
    status: 'FAILURE',
    errorMessage: 'Accès refusé : changement de mot de passe obligatoire non effectué.',
    details: { path: req.originalUrl, method: req.method }
  });

  return res.status(403).json({
    success: false,
    message: "Accès refusé : vous devez changer votre mot de passe par défaut avant de pouvoir effectuer cette opération.",
    mustChangePassword: true
  });
}

module.exports = { checkMustChangePassword, ALLOWED_PATHS };
