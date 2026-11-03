/**
 * @file auditHelper.js
 * @description Adaptateur d'écriture du journal d'audit. Délègue intégralement à
 * services/auditLogService.logAction (-> dal/auditLogDAL -> dbo.sp_CreateAuditLog) :
 * AUCUN SQL inline, aucune écriture directe sur dbo.tblAuditLog.
 * @module Utils/AuditHelper
 */

const { logAction } = require('../services/auditLogService');

/**
 * Enregistre une entrée d'audit. N'échoue jamais l'opération métier appelante :
 * logAction avale et logue les erreurs côté serveur.
 *
 * @param {Object} entry
 * @param {number|null} [entry.userId]
 * @param {number|null} [entry.companyId]
 * @param {number|null} [entry.storeId]
 * @param {string} entry.actionName  - ex: 'SALE_CANCEL'
 * @param {string} entry.tableName   - ex: 'tblSale'
 * @param {string|number|null} [entry.recordId]
 * @param {Object|null} [entry.oldValues]
 * @param {Object|null} [entry.newValues]
 * @param {Object} [req] - Objet Express pour extraire IP / User-Agent.
 * @returns {Promise<void>}
 */
async function writeAuditLog(entry, req = null) {
  const {
    userId = null,
    companyId = null,
    storeId = null,
    actionName,
    tableName,
    recordId = null,
    oldValues = null,
    newValues = null
  } = entry || {};

  await logAction({
    req,
    user: (userId != null || companyId != null || storeId != null)
      ? { userId, companyId, storeId }
      : null,
    action: actionName,
    entity: tableName,
    entityId: recordId,
    oldValues,
    newValues
  });
}

module.exports = { writeAuditLog };

