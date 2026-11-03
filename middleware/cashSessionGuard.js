/**
 * @file cashSessionGuard.js
 * @description Gardes financiers autour de la session de caisse (fidèle au script GestionsBoutiques).
 *
 * Règles métier :
 *  - SUPER_ADMIN : ne vend jamais (403 sur ventes / encaissements / dépenses / recouvrements).
 *  - ADMIN       : vend avec SA session OPEN + rattachement boutique (tblUserStore) ;
 *                  ouvre des sessions ; valide/rejette les rapports SANS session requise.
 *  - MANAGER     : vend et valide les rapports CASHIER uniquement si SA caisse est OPEN.
 *  - CASHIER     : vend uniquement si SA caisse est OPEN.
 *  - Un utilisateur ne peut avoir qu'UNE SEULE session OPEN à la fois.
 *  - Un rapport en attente de validation (PENDING_MANAGER / PENDING_ADMIN) n'empêche
 *    PAS l'ouverture d'une nouvelle session.
 * @module Middleware/CashSessionGuard
 */

const CashSessionDAL = require('../dal/cashSessionDAL');
const asyncHandler = require('./asyncHandler');

/** Extrait le storeId depuis params / query / body. */
function resolveStoreId(req) {
  return req.params.storeId
    || (req.body && req.body.storeId)
    || (req.query && req.query.storeId)
    || null;
}

/**
 * Garde 1 : bloque ventes / encaissements / dépenses / recouvrements
 * si l'utilisateur n'a pas SA session de caisse OPEN.
 * Injecte req.cashSession et req.cashSessionId en cas de succès.
 */
const checkCaisseOuverte = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Utilisateur non authentifié.' });
  }

  // SUPER_ADMIN n'effectue pas de vente
  if (req.user.roleCode === 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Le Super administrateur n\'effectue pas de ventes ni d\'opérations de caisse.'
    });
  }

  const storeId = Number(resolveStoreId(req) || req.user.storeId || 0);
  if (!storeId) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé : votre compte n\'est rattaché à aucune boutique.'
    });
  }

  const session = await CashSessionDAL.getOpenSessionByUserAndStore(req.user.userId, storeId);
  if (!session) {
    return res.status(403).json({
      success: false,
      message: 'Opération impossible : vous devez d\'abord ouvrir votre caisse pour cette boutique.'
    });
  }

  // Injection de la session active pour les handlers suivants
  req.cashSession = session;
  req.cashSessionId = session.cashSessionId;
  next();
});

/**
 * Garde 2 : un utilisateur ne peut avoir qu'UNE SEULE session OPEN à la fois
 * (toutes caisses confondues). Un rapport en attente de validation n'est
 * PAS bloquant — seule une session encore OPEN l'est.
 * Usage : POST /api/cash/sessions/open
 */
const checkSingleOpenSession = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Utilisateur non authentifié.' });
  }
  if (req.user.roleCode === 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Le Super administrateur n\'ouvre pas de session de caisse.'
    });
  }

  const openSession = await CashSessionDAL.getOpenSessionByUser(req.user.userId);

  if (openSession) {
    const s = openSession;
    return res.status(403).json({
      success: false,
      message: `Vous avez déjà une session de caisse ouverte (caisse ${s.vcRegisterCode}, session ${s.cashSessionId}). Clôturez-la d'abord.`
    });
  }
  next();
});

/**
 * Garde 3 (validation de rapports) : le MANAGER doit avoir SA caisse OPEN
 * pour valider/rejeter un rapport. L'ADMIN est exempté (il valide sans session).
 */
const checkManagerCaisseOuverte = asyncHandler(async (req, res, next) => {
  if (req.user.roleCode === 'ADMIN' || req.user.roleCode === 'SUPER_ADMIN') return next();

  // Réutilise la garde 1 pour MANAGER (et tout autre rôle)
  return checkCaisseOuverte(req, res, next);
});

module.exports = { checkCaisseOuverte, checkSingleOpenSession, checkManagerCaisseOuverte };