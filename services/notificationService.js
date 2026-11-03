/**
 * @file notificationService.js
 * @description Service métier de création de notifications (tblNotification + tblRefNotificationType).
 * Respecte fidèlement : userId obligatoire, notificationTypeId résolu par vcCode,
 * CK_tblNotification_Read (btIsRead=1 => dtReadAt renseigné), CK_tblNotification_Priority,
 * CK_tblNotification_Expiration (dtExpiresAt >= dtCreatedAt).
 * @module Services/Notification
 */

const RefDAL = require('../dal/refDAL');
const NotificationDAL = require('../dal/notificationDAL');

/** Codes valides de priorité (CK_tblNotification_Priority). */
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

/**
 * Résout notificationTypeId depuis tblRefNotificationType via vcCode.
 * @param {string} typeCode - ex: 'LOW_STOCK', 'CASH_DIFFERENCE'...
 * @returns {Promise<number|null>}
 */
async function resolveTypeId(typeCode) {
  if (!typeCode) return null;
  const row = await RefDAL.getByCode('notificationType', typeCode);
  return row ? row.notificationTypeId : null;
}

/**
 * Crée une notification.
 *
 * @param {Object} data
 * @param {number} data.userId                 - Destinataire (obligatoire, FK tblUser).
 * @param {number|null} [data.companyId]
 * @param {number|null} [data.storeId]
 * @param {string} [data.typeCode='NORMAL']    - vcCode de tblRefNotificationType.
 * @param {string} data.title                  - vcTitle (obligatoire).
 * @param {string} data.message                - vcMessage (obligatoire).
 * @param {string} [data.priority='NORMAL']    - LOW | NORMAL | HIGH | URGENT.
 * @param {string|null} [data.referenceType]
 * @param {number|null} [data.referenceId]
 * @param {string|null} [data.actionUrl]
 * @param {Date|null} [data.expiresAt]
 * @returns {Promise<Object>} Notification créée.
 */
async function createNotification(data) {
  const {
    userId,
    companyId = null,
    storeId = null,
    typeCode = null,
    title,
    message,
    priority = 'NORMAL',
    referenceType = null,
    referenceId = null,
    actionUrl = null,
    expiresAt = null
  } = data;

  if (!userId) throw new Error('Le destinataire (userId) est obligatoire.');
  if (!title || !title.trim()) throw new Error('Le titre de la notification est obligatoire.');
  if (!message || !message.trim()) throw new Error('Le message de la notification est obligatoire.');
  if (!PRIORITIES.includes(priority)) {
    throw new Error(`Priorité invalide. Valeurs autorisées : ${PRIORITIES.join(', ')}.`);
  }

  const notificationTypeId = await resolveTypeId(typeCode);
  if (typeCode && !notificationTypeId) {
    throw new Error(`Type de notification inconnu : ${typeCode}.`);
  }

  return NotificationDAL.create({
    userId, companyId, storeId, notificationTypeId,
    vcTitle: title.trim(), vcMessage: message.trim(), vcPriority: priority,
    vcReferenceType: referenceType, referenceId,
    vcActionUrl: actionUrl, dtExpiresAt: expiresAt,
  });
}

/**
 * Crée plusieurs notifications en silence (fire-and-forget) pour une liste d'utilisateurs.
 * @param {Array<number>} userIds
 * @param {Object} data - Mêmes champs que createNotification (sans userId).
 * @returns {Promise<void>}
 */
async function notifyMany(userIds, data) {
  for (const userId of userIds || []) {
    try {
      await createNotification({ ...data, userId });
    } catch (err) {
      console.error('[Notification] Échec pour userId', userId, ':', err.message);
    }
  }
}

/**
 * Destinataires d'alerte d'une boutique : MANAGER + CASHIER (tblUserStore via
 * vw_UserScopeAssignment) + ADMIN (tblUserCompany via vw_UserScopeAssignment).
 * Accès exclusif par abstraction : aucun FROM dbo.tblUserStore / tblUserCompany / tblUser.
 * @param {number} storeId
 * @returns {Promise<Array<number>>} Identifiants utilisateurs uniques.
 */
async function getStoreAlertRecipients(storeId) {
  return NotificationDAL.getStoreAlertRecipients(storeId);
}

/**
 * Alerte de stock faible / rupture (tblRefNotificationType : LOW_STOCK / OUT_OF_STOCK).
 * Fire-and-forget : n'échoue jamais la vente.
 *
 * @param {Object} data - { storeId, productId, productName, dcAvailableQuantity, threshold }
 * @returns {Promise<void>}
 */
async function notifyLowStock(data) {
  const {
    storeId, productId, productName,
    dcAvailableQuantity = 0, threshold = 0
  } = data;

  try {
    const outOfStock = Number(dcAvailableQuantity) <= 0;
    const typeCode = outOfStock ? 'OUT_OF_STOCK' : 'LOW_STOCK';
    const recipients = await getStoreAlertRecipients(storeId);
    if (!recipients.length) return;

    await notifyMany(recipients, {
      storeId,
      typeCode,
      title: outOfStock ? `Rupture de stock : ${productName}` : `Stock faible : ${productName}`,
      message: outOfStock
        ? `Le produit « ${productName} » est en rupture de stock dans la boutique (quantité : ${dcAvailableQuantity}).`
        : `Le produit « ${productName} » est sous le seuil d'alerte (quantité : ${dcAvailableQuantity} / seuil : ${threshold}).`,
      priority: outOfStock ? 'HIGH' : 'NORMAL',
      referenceType: 'PRODUCT',
      referenceId: productId,
      actionUrl: '/products'
    });
  } catch (err) {
    console.error('[Notification] Alerte stock non envoyée :', err.message);
  }
}

module.exports = {
  createNotification,
  notifyMany,
  resolveTypeId,
  getStoreAlertRecipients,
  notifyLowStock,
  PRIORITIES
};


