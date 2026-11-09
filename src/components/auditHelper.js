/**
 * @file auditHelper.js
 * @description Composant React.
 */

const { logAction } = require('../services/auditLogService');

/**
 * Utilitaire pour simplifier et standardiser les entrées dans le journal d'audit.
 */
const auditHelper = {
    /**
     * Enregistre une action réussie.
     */
    logSuccess: async (req, user, action, entity, entityId, details = {}) => {
        return logAction({
            req,
            user,
            action,
            entity,
            entityId,
            details,
            status: 'SUCCESS'
        }).catch(err => console.error(`[Audit Error] Échec du log Success pour ${action}:`, err.message));
    },

    /**
     * Enregistre une tentative échouée ou une erreur technique.
     */
    logFailure: async (req, user, action, entity, entityId, error, details = {}) => {
        return logAction({
            req,
            user,
            action,
            entity,
            entityId,
            details,
            status: 'FAILURE',
            errorMessage: error.message || error
        }).catch(err => console.error(`[Audit Error] Échec du log Failure pour ${action}:`, err.message));
    }
};

module.exports = auditHelper;