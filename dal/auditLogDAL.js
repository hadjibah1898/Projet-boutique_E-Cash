/**
 * @file auditLogDAL.js
 * @description DAL journal d'audit — ACCÈS EXCLUSIF via procédures stockées SQL Server.
 * Vues : vw_AuditLogDetails
 * Procédures : usp_CreateAuditLog, usp_GetAuditLogs
 * INTERDIT : tout accès direct en SQL inline à dbo.tblAuditLog.
 * @module DAL/AuditLog
 */

const { sql, poolPromise } = require('../config/db');

class AuditLogDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000).
   * @private
   */
  static _mapSqlError(err) {
    if (err && err.number >= 50000 && err.number < 54000) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  /**
   * Insère une entrée d'audit de manière immuable via dbo.sp_CreateAuditLog.
   * @param {Object} logData - Données de journalisation
   * @param {number|null} [logData.userId] - ID de l'utilisateur
   * @param {number|null} [logData.companyId] - ID de l'entreprise
   * @param {number|null} [logData.storeId] - ID de la boutique
   * @param {string} logData.vcActionName - Nom ou code de l'action
   * @param {string} logData.tableName - Nom de la table ciblée
   * @param {string|number|null} [logData.vcRecordId] - Identifiant de l'enregistrement
   * @param {Object|string|null} [logData.vcOldValuesJson] - Anciennes valeurs (objet ou JSON string)
   * @param {Object|string|null} [logData.vcNewValuesJson] - Nouvelles valeurs (objet ou JSON string)
   * @param {string|null} [logData.vcIpAddress] - Adresse IP source
   * @param {string|null} [logData.vcUserAgent] - User-Agent du client
   * @returns {Promise<Object>} Résumé renvoyé par dbo.sp_CreateAuditLog
   *   (auditLogId, userId, vcActionName, tableName, vcRecordId, dtCreatedAt).
   */
  static async log(logData = {}) {
    const {
      userId = null,
      companyId = null,
      storeId = null,
      vcActionName,
      tableName,
      vcRecordId = null,
      vcOldValuesJson = null,
      vcNewValuesJson = null,
      vcIpAddress = null,
      vcUserAgent = null
    } = logData;

    if (!vcActionName || !String(vcActionName).trim()) {
      throw new Error("Le nom d'action (vcActionName) est obligatoire.");
    }
    if (!tableName || !String(tableName).trim()) {
      throw new Error('Le nom de table (tableName) est obligatoire.');
    }

    // Sérialisation/validation des JSON AVANT toute connexion (échec rapide et clair).
    const oldJson = AuditLogDAL._toJson(vcOldValuesJson);
    const newJson = AuditLogDAL._toJson(vcNewValuesJson);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('companyId', sql.Int, companyId)
        .input('storeId', sql.Int, storeId)
        .input('vcActionName', sql.VarChar(100), AuditLogDAL._truncate(vcActionName, 100))
        .input('tableName', sql.NVarChar(128), AuditLogDAL._truncate(String(tableName).trim(), 128))
        .input('vcRecordId', sql.VarChar(100), vcRecordId != null ? AuditLogDAL._truncate(vcRecordId, 100) : null)
        .input('vcOldValuesJson', sql.VarChar(sql.MAX), oldJson)
        .input('vcNewValuesJson', sql.VarChar(sql.MAX), newJson)
        .input('vcIpAddress', sql.VarChar(30), vcIpAddress != null ? AuditLogDAL._truncate(vcIpAddress, 30) : null)
        .input('vcUserAgent', sql.VarChar(150), vcUserAgent != null ? AuditLogDAL._truncate(vcUserAgent, 150) : null)
        .execute('dbo.usp_CreateAuditLog');

      return result.recordset[0];
    } catch (err) {
      throw AuditLogDAL._mapSqlError(err);
    }
  }

  /**
   * Historique paginé du journal d'audit via dbo.usp_GetAuditLogs
   * (lecture de dbo.vw_AuditLogDetails — jamais de SQL inline sur tblAuditLog).
   * @param {Object} [filters]
   * @param {number|null} [filters.companyId] - Filtre multi-tenant (entreprise).
   * @param {number|null} [filters.storeId] - Filtre multi-tenant (boutique).
   * @param {number|null} [filters.userId] - Filtre par utilisateur.
   * @param {string|null} [filters.tableName] - Filtre par table ciblée (sysname).
   * @param {string|number|null} [filters.vcRecordId] - Filtre par identifiant d'enregistrement.
   * @param {string|null} [filters.action] - Filtre par nom d'action (vcActionName).
   * @param {string|Date|null} [filters.startDate] - Date de début (inclusive).
   * @param {string|Date|null} [filters.endDate] - Date de fin (exclusive).
   * @param {number} [filters.page=1] - Page (1-based).
   * @param {number} [filters.limit=50] - Taille de page (0 = tous, borné à 5000).
   * @returns {Promise<Object>} { logs: Array, totalPages: number, totalRows: number }
   */
  static async list(filters = {}) {
    const {
      companyId = null,
      storeId = null,
      userId = null,
      tableName = null,
      vcRecordId = null,
      action = null,
      startDate = null,
      endDate = null,
      page = 1,
      limit = 50
    } = filters;

    const pageNum = Number.isFinite(Number(page)) && Number(page) >= 1 ? Math.trunc(Number(page)) : 1;
    const limitNum = Number.isFinite(Number(limit)) && Number(limit) >= 0 ? Math.trunc(Number(limit)) : 50;

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('storeId', sql.Int, storeId)
        .input('userId', sql.Int, userId)
        .input('tableName', sql.NVarChar(128), tableName != null ? AuditLogDAL._truncate(String(tableName).trim(), 128) : null)
        .input('vcRecordId', sql.VarChar(100), vcRecordId != null ? AuditLogDAL._truncate(vcRecordId, 100) : null)
        .input('vcActionName', sql.VarChar(100), action != null && String(action).trim() !== '' ? AuditLogDAL._truncate(String(action).trim(), 100) : null)
        .input('dtStartDate', sql.DateTime, AuditLogDAL._toDate(startDate))
        .input('dtEndDate', sql.DateTime, AuditLogDAL._toDate(endDate))
        .input('page', sql.Int, pageNum)
        .input('limit', sql.Int, limitNum)
        .execute('dbo.usp_GetAuditLogs');

      // RS1 : décompte total ; RS2 : page de lignes
      const summary = (result.recordsets && result.recordsets[0] && result.recordsets[0][0]) || { totalRows: 0 };
      const logs = (result.recordsets && result.recordsets[1]) || [];
      const totalRows = Number(summary.totalRows) || 0;
      const effectiveLimit = limitNum > 0 ? limitNum : Math.max(totalRows, 1);
      const totalPages = Math.max(1, Math.ceil(totalRows / effectiveLimit));

      return { logs, totalPages, totalRows };
    } catch (err) {
      throw AuditLogDAL._mapSqlError(err);
    }
  }

  /**
   * Convertit une date (string/Date) en objet Date valide pour SQL, sinon null.
   * @private
   */
  static _toDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /**
   * Tronque une valeur convertible en chaîne à la longueur maximale de la colonne.
   * @private
   */
  static _truncate(value, max) {
    const str = String(value);
    return str.length > max ? str.slice(0, max) : str;
  }

  /**
   * Sérialise une valeur JSON pour SQL Server : objet -> JSON.stringify,
   * chaîne -> contrôlée puis telle quelle, null/undefined -> null.
   * @private
   */
  static _toJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return JSON.stringify(value);

    try {
      JSON.parse(value);
    } catch {
      throw new Error('Le contenu JSON transmis au journal d’audit est invalide.');
    }
    return value;
  }
}

module.exports = AuditLogDAL;