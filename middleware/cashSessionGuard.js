
/**
 * @file cashSessionGuard.js
 * @description Gardes financiers autour des sessions de caisse.
 * @module Middleware/CashSessionGuard
 *
 * RÈGLES :
 *
 * SUPER_ADMIN :
 * - Ne vend pas.
 * - N'encaisse pas de dette.
 * - N'ouvre pas de caisse.
 *
 * ADMIN :
 * - Session OPEN obligatoire pour les ventes.
 * - Session facultative pour les remboursements de dettes.
 * - Validation des rapports sans session obligatoire.
 *
 * MANAGER :
 * - Session OPEN obligatoire pour les ventes.
 * - Session OPEN obligatoire pour les remboursements.
 * - Session OPEN obligatoire pour valider/rejeter
 *   les rapports des caissiers.
 *
 * CASHIER :
 * - Session OPEN obligatoire pour les ventes.
 * - Session OPEN obligatoire pour les remboursements.
 *
 * Une seule session OPEN par utilisateur.
 *
 * Aucun SQL inline : utilisation de CashSessionDAL.
 */

const CashSessionDAL = require('../dal/cashSessionDAL');
const asyncHandler = require('./asyncHandler');

/**
 * Convertit une valeur en identifiant positif valide.
 */
function positiveId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

/**
 * Récupère la boutique demandée.
 */
function resolveStoreId(req) {
  return (
    req.params?.storeId ??
    req.body?.storeId ??
    req.body?.boutiqueId ??
    req.query?.storeId ??
    null
  );
}

/**
 * GARDE 1
 *
 * Vérifie qu'une session de caisse est ouverte.
 *
 * Utilisée pour les ventes et les opérations
 * financières nécessitant une caisse.
 */
const checkCaisseOuverte = asyncHandler(async (req, res, next) => {

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Utilisateur non authentifié.'
    });
  }

  const role = String(req.user.roleCode || '').toUpperCase();

  if (role === 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message:
        "Le Super administrateur n'effectue pas d'opérations de caisse."
    });
  }

  const storeId = positiveId(
    resolveStoreId(req) ?? req.user.storeId
  );

  if (!storeId) {
    return res.status(403).json({
      success: false,
      message:
        "Accès refusé : aucune boutique valide n'est associée à cette opération."
    });
  }

  const session =
    await CashSessionDAL.getOpenSessionByUserAndStore(
      req.user.userId,
      storeId
    );

  if (!session?.cashSessionId) {
    return res.status(403).json({
      success: false,
      code: 'CASH_SESSION_REQUIRED',
      message:
        "Opération impossible : vous devez d'abord ouvrir votre caisse pour cette boutique."
    });
  }

  req.cashSession = session;
  req.cashSessionId = session.cashSessionId;

  return next();
});

/**
 * GARDE 2
 *
 * Empêche un utilisateur d'ouvrir plusieurs
 * sessions de caisse simultanément.
 *
 * Les rapports en attente de validation
 * ne bloquent pas une nouvelle ouverture.
 */
const checkSingleOpenSession = asyncHandler(async (req, res, next) => {

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Utilisateur non authentifié.'
    });
  }

  const role = String(req.user.roleCode || '').toUpperCase();

  if (role === 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message:
        "Le Super administrateur n'ouvre pas de session de caisse."
    });
  }

  const openSession =
    await CashSessionDAL.getOpenSessionByUser(
      req.user.userId
    );

  if (openSession) {
    return res.status(403).json({
      success: false,
      code: 'CASH_SESSION_ALREADY_OPEN',
      message:
        `Vous avez déjà une session de caisse ouverte ` +
        `(caisse ${openSession.vcRegisterCode || 'inconnue'}, ` +
        `session ${openSession.cashSessionId}). ` +
        `Clôturez-la d'abord.`
    });
  }

  return next();
});

/**
 * GARDE 3
 *
 * Validation et rejet des rapports de caisse.
 *
 * ADMIN :
 * - Pas de session obligatoire.
 *
 * MANAGER :
 * - Session OPEN obligatoire.
 *
 * Les autorisations de validation des rapports
 * doivent également être vérifiées par les routes
 * et les procédures stockées correspondantes.
 */
const checkManagerCaisseOuverte = asyncHandler(async (req, res, next) => {

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Utilisateur non authentifié.'
    });
  }

  const role = String(req.user.roleCode || '').toUpperCase();

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return next();
  }

  return checkCaisseOuverte(req, res, next);
});

/**
 * GARDE 4
 *
 * Encaissement des remboursements de dettes.
 *
 * ADMIN :
 * - Autorisé sans session ouverte.
 *
 * MANAGER :
 * - Sa boutique uniquement.
 * - Sa session OPEN obligatoire.
 *
 * CASHIER :
 * - Sa boutique uniquement.
 * - Sa session OPEN obligatoire.
 *
 * SUPER_ADMIN :
 * - Interdit.
 *
 * ZÉRO SQL INLINE.
 */
const checkDebtCollection = asyncHandler(async (req, res, next) => {

  // ========================================
  // 1. AUTHENTIFICATION
  // ========================================

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentification obligatoire.'
    });
  }

  const role = String(
    req.user.roleCode || ''
  ).toUpperCase();

  const userId = positiveId(req.user.userId);
  const companyId = positiveId(req.user.companyId);

  if (!userId || !companyId) {
    return res.status(403).json({
      success: false,
      message:
        'Contexte utilisateur ou entreprise invalide.'
    });
  }

  // ========================================
  // 2. SUPER ADMIN / RÔLES NON AUTORISÉS
  // ========================================

  if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(role)) {
    return res.status(403).json({
      success: false,
      message:
        "Votre rôle ne permet pas d'encaisser une dette."
    });
  }

  // ========================================
  // 3. ADMIN : SESSION FACULTATIVE
  // ========================================

  if (role === 'ADMIN') {

    req.debtCashContext = {
      userId,
      companyId,
      roleCode: 'ADMIN',
      storeId: null,
      cashSessionId: null
    };

    return next();
  }

  // ========================================
  // 4. BOUTIQUE DU MANAGER / CASHIER
  // ========================================

  const storeId = positiveId(req.user.storeId);

  if (!storeId) {
    return res.status(403).json({
      success: false,
      message:
        "Aucune boutique valide n'est associée à votre compte."
    });
  }

  // ========================================
  // 5. CONTRÔLE DE LA BOUTIQUE DEMANDÉE
  // ========================================

  const requestedStore = resolveStoreId(req);

  if (
    requestedStore !== null &&
    positiveId(requestedStore) !== storeId
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Vous ne pouvez encaisser une dette que dans votre propre boutique."
    });
  }

  // ========================================
  // 6. VÉRIFICATION DE LA SESSION OUVERTE
  // ========================================

  const session =
    await CashSessionDAL.getOpenSessionByUserAndStore(
      userId,
      storeId
    );

  if (!session?.cashSessionId) {
    return res.status(403).json({
      success: false,
      code: 'CASH_SESSION_REQUIRED',
      message:
        "Vous devez ouvrir votre caisse dans votre boutique avant d'encaisser une dette."
    });
  }

  // ========================================
  // 7. CONTEXTE FINANCIER VÉRIFIÉ
  // ========================================

  req.debtCashContext = {
    userId,
    companyId,
    roleCode: role,
    storeId,
    cashSessionId: session.cashSessionId
  };

  req.cashSession = session;
  req.cashSessionId = session.cashSessionId;

  return next();
});

module.exports = {
  checkCaisseOuverte,
  checkSingleOpenSession,
  checkManagerCaisseOuverte,
  checkDebtCollection
};
