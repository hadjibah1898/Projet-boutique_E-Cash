/**
 * @file notificationDAL.js
 * @description DAL notifications — ACCÈS EXCLUSIF via les objets du module
 * utils/notification-module.sql. INTERDIT : tout SQL inline sur dbo.tblNotification
 * (filtres d'expiration et transitions de lecture sont délégués aux procédures).
 * Vues : vw_NotificationDetails.
 * Procédures : sp_CreateNotification, sp_GetNotificationsByUser,
 *   sp_CountUnreadNotifications, sp_MarkNotificationAsRead,
 *   sp_MarkAllNotificationsAsRead, sp_DeleteNotification,
 *   sp_GetStoreAlertRecipients.
 * Codes erreur métier : 52600 (userId), 52601 (vcTitle), 52602 (vcMessage),
 *   52603 (notificationTypeId), 52604 (notificationId), 52605 (storeId).
 * @module DAL/Notification
 */

const { sql, poolPromise } = require('../config/db');

class NotificationDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 52600-52605).
   * @private
   */
  static _mapSqlError(err) {
    if (err && err.number >= 52600 && err.number <= 52605) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  /**
   * Crée une notification via dbo.sp_CreateNotification
   * (contrôles 52600-52603, notificationTypeId re-validé côté SQL).
   * @param {Object} data
   * @returns {Promise<Object>} { notificationId, userId, vcTitle, btIsRead, dtCreatedAt }
   */
  static async create(data) {
    const {
      userId,
      companyId = null,
      storeId = null,
      notificationTypeId = null,
      vcTitle,
      vcMessage,
      vcPriority = 'NORMAL',
      vcReferenceType = null,
      referenceId = null,
      vcActionUrl = null,
      dtExpiresAt = null
    } = data;

    if (!userId) throw new Error('userId est obligatoire.');
    if (!vcTitle || !vcTitle.trim()) throw new Error('Le titre (vcTitle) est obligatoire.');
    if (!vcMessage || !vcMessage.trim()) throw new Error('Le message (vcMessage) est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('companyId', sql.Int, companyId)
        .input('storeId', sql.Int, storeId)
        .input('notificationTypeId', sql.Int, notificationTypeId)
        .input('vcTitle', sql.VarChar(100), vcTitle.trim())
        .input('vcMessage', sql.VarChar(500), vcMessage.trim())
        .input('vcPriority', sql.VarChar(20), vcPriority)
        .input('vcReferenceType', sql.VarChar(50), vcReferenceType)
        .input('referenceId', sql.BigInt, referenceId)
        .input('vcActionUrl', sql.VarChar(255), vcActionUrl)
        .input('dtExpiresAt', sql.DateTime2, dtExpiresAt)
        .execute('dbo.sp_CreateNotification');

      return result.recordset[0];
    } catch (err) {
      throw NotificationDAL._mapSqlError(err);
    }
  }

  /**
   * Notifications valides et non expirées via dbo.sp_GetNotificationsByUser
   * (index IX_tblNotification_User_IsRead_CreatedAt, même tri que l'ancien SQL).
   * @param {number} userId
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   * @param {boolean} [options.unreadOnly=false]
   * @returns {Promise<Array>}
   */
  static async getByUserId(userId, { limit = 50, unreadOnly = false } = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('limit', sql.Int, limit)
        .input('unreadOnly', sql.Bit, unreadOnly ? 1 : 0)
        .execute('dbo.sp_GetNotificationsByUser');

      return result.recordset;
    } catch (err) {
      throw NotificationDAL._mapSqlError(err);
    }
  }

  /**
   * Compte des notifications non lues via dbo.sp_CountUnreadNotifications.
   * @param {number} userId
   * @returns {Promise<number>}
   */
  static async countUnread(userId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .execute('dbo.sp_CountUnreadNotifications');

      return result.recordset[0].unreadCount;
    } catch (err) {
      throw NotificationDAL._mapSqlError(err);
    }
  }

  /**
   * Marque une notification comme lue via dbo.sp_MarkNotificationAsRead.
   * @returns {Promise<boolean>} true si la notification était non lue.
   */
  static async markAsRead(notificationId, userId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('notificationId', sql.BigInt, notificationId)
        .input('userId', sql.Int, userId)
        .execute('dbo.sp_MarkNotificationAsRead');

      return Number(result.recordset[0].rowsAffected) > 0;
    } catch (err) {
      throw NotificationDAL._mapSqlError(err);
    }
  }

  /**
   * Marque toutes les notifications non lues comme lues via
   * dbo.sp_MarkAllNotificationsAsRead.
   * @returns {Promise<number>} Nombre de notifications mises à jour.
   */
  static async markAllAsRead(userId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .execute('dbo.sp_MarkAllNotificationsAsRead');

      return Number(result.recordset[0].rowsAffected);
    } catch (err) {
      throw NotificationDAL._mapSqlError(err);
    }
  }

  /**
   * Désactivation logique (soft delete) via dbo.sp_DeleteNotification.
   * @returns {Promise<boolean>} true si la notification existe (lignes affectées).
   */
  static async delete(notificationId, userId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('notificationId', sql.BigInt, notificationId)
        .input('userId', sql.Int, userId)
        .execute('dbo.sp_DeleteNotification');

      return Number(result.recordset[0].rowsAffected) > 0;
    } catch (err) {
      throw NotificationDAL._mapSqlError(err);
    }
  }

  /**
   * Destinataires d'alerte d'une boutique via dbo.sp_GetStoreAlertRecipients :
   * MANAGER + CASHIER rattachés à la boutique, plus les ADMIN de l'entreprise
   * rattachée (UNION gérée en SQL — remplace la requête inline du service).
   * @param {number} storeId
   * @returns {Promise<Array<number>>} Identifiants utilisateurs uniques.
   */
  static async getStoreAlertRecipients(storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetStoreAlertRecipients');

      return result.recordset.map((r) => r.userId);
    } catch (err) {
      throw NotificationDAL._mapSqlError(err);
    }
  }
}

module.exports = NotificationDAL;