/**
 * @file auditController.js
 * @description Journal d'audit — lecture paginée pour le frontend
 * (GET /api/audit). Format de réponse { logs, totalPages } SANS wrapper
 * `success` : l'intercepteur Axios du frontend dé-wrape `data` uniquement
 * si `success === true`, et la vue s'attend à `res.data.logs`.
 * @module Controllers/AuditLog
 */

const AuditLogDAL = require('../dal/auditLogDAL');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * Parse une valeur JSON stockée en base en objet JS, sinon null.
 */
function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * GET /api/audit
 * Query : user, action, startDate, endDate, page, limit
 * (limit = 0 => export complet, borné à 5000 lignes par la procédure).
 */
exports.getLogs = asyncHandler(async (req, res) => {
  const { user, action, startDate, endDate, page, limit } = req.query;

  const result = await AuditLogDAL.list({
    userId: user ? Number(user) : null,
    action: action || null,
    startDate: startDate || null,
    endDate: endDate || null,
    page: page || 1,
    limit: limit !== undefined ? Number(limit) : 20
  });

  // 🟢 SÉCURITÉ : On s'assure que 'result.logs' existe et est un tableau
  const rawLogs = (result && Array.isArray(result.logs)) 
      ? result.logs 
      : (Array.isArray(result) ? result : []);

  // Mapping vers la forme "legacy" attendue par AuditLogView.js
  const logs = rawLogs.map((row) => ({
    _id: row.auditLogId,
    userId: row.userId,
    userName: row.userName || 'Système',
    action: row.vcActionName,
    entity: row.tableName,
    entityId: row.vcRecordId != null ? String(row.vcRecordId) : null,
    details: parseJson(row.vcNewValuesJson) || parseJson(row.vcOldValuesJson),
    ipAddress: row.vcIpAddress || 'N/A',
    status: 'SUCCESS',
    createdAt: row.dtCreatedAt || new Date().toISOString()
  }));

  // Pas de wrapper { success, data } : l'intercepteur frontend lit res.data.logs
  res.json({ 
    logs, 
    totalPages: (result && result.totalPages) ? result.totalPages : 1, 
    totalRows: (result && result.totalRows) ? result.totalRows : logs.length 
  });
});