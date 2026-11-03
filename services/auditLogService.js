/**
 * @file auditLogService.js
 * @description Service de journalisation d'audit — façade métier au-dessus de dal/auditLogDAL.js.
 * Adapte l'appel type `logAction({ req, user, action, entity, entityId, status, errorMessage, details })`
 * aux colonnes réelles de dbo.tblAuditLog du script GestionsBoutiques :
 *   vcActionName, tableName, vcRecordId, vcOldValuesJson, vcNewValuesJson,
 *   vcIpAddress, vcUserAgent (+ userId, companyId, storeId).
 * Les champs `status` / `errorMessage` / `details` sont sérialisés dans vcNewValuesJson
 * (le script ne prévoit pas de colonnes dédiées).
 * @module Services/AuditLog
 */

const AuditLogDAL = require('../dal/auditLogDAL');

/** Longueurs maximales imposées par le script. */
const MAX_ACTION = 100;
const MAX_RECORD_ID = 100;
const MAX_IP = 30;
const MAX_USER_AGENT = 150;

function truncate(value, max) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str.length > max ? str.slice(0, max) : str;
}

/**
 * Enregistre une action d'audit. Ne fait JAMAIS échouer l'opération métier :
 * toute erreur est loguée côté serveur puis avalée.
 *
 * @param {Object} entry
 * @param {Object|null} [entry.req]          - Objet Express (IP + User-Agent).
 * @param {Object|null} [entry.user]         - Utilisateur (req.user) : userId, companyId, storeId.
 * @param {string} entry.action              - Nom d'action (ex: 'ACCESS_BLOCKED_PWD_CHANGE_REQUIRED').
 * @param {string} entry.entity              - Nom de la table métier (ex: 'tblUser').
 * @param {string|number|null} [entry.entityId]
 * @param {string} [entry.status='SUCCESS']  - 'SUCCESS' | 'FAILURE' (stocké dans le JSON).
 * @param {string|null} [entry.errorMessage]
 * @param {Object|null} [entry.details]      - Contexte additionnel (path, method, payload...).
 * @param {Object|null} [entry.oldValues]
 * @param {Object|null} [entry.newValues]
 * @returns {Promise<Object|null>} Entrée d'audit créée ou null en cas d'échec silencieux.
 */
async function logAction(entry = {}) {
  try {
    const {
      req = null,
      user = null,
      action,
      entity,
      entityId = null,
      status = 'SUCCESS',
      errorMessage = null,
      details = null,
      oldValues = null,
      newValues = null
    } = entry;

    if (!action || !entity) {
      throw new Error('`action` et `entity` sont obligatoires pour la journalisation.');
    }

    // Regroupe status / errorMessage / details dans le JSON (colonnes absentes du script)
    const payload = {
      status,
      errorMessage,
      details: details || undefined,
      ...(newValues || {})
    };

    return await AuditLogDAL.log({
      userId: user ? (user.userId ?? null) : null,
      companyId: user ? (user.companyId ?? null) : null,
      storeId: user ? (user.storeId ?? null) : null,
      vcActionName: truncate(action, MAX_ACTION),
      tableName: entity,
      vcRecordId: entityId != null ? truncate(entityId, MAX_RECORD_ID) : null,
      vcOldValuesJson: oldValues,
      vcNewValuesJson: payload,
      vcIpAddress: req ? truncate(req.ip || req.connection?.remoteAddress || null, MAX_IP) : null,
      vcUserAgent: req ? truncate(req.headers?.['user-agent'] || null, MAX_USER_AGENT) : null
    });
  } catch (err) {
    console.error('[AuditService] Échec de journalisation :', err.message);
    return null;
  }
}

module.exports = { logAction };
