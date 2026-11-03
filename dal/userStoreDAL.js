/**
 * @file userStoreDAL.js
 * @description DAL boutique — ACCES EXCLUSIF par abstraction SQL Server.
 * @module DAL/UserStore
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class UserStoreDAL {
  static async _getRequest(transaction = null) {
    if (transaction) return new sql.Request(transaction);
    const pool = await poolPromise;
    return pool.request();
  }

  static _mapSqlError(err) {
    if (err && err.number >= 50000 && err.number < 51300) {
      const clean = new Error(err.message);
      clean.sqlNumber = err.number;
      return clean;
    }
    return err;
  }

  static async assign(data) {
    const { userId, storeId, roleCode, assignedByUserId, transaction = null } = data;

    if (!userId) throw new Error('userId est obligatoire.');
    if (!storeId) throw new Error('storeId est obligatoire.');
    if (!assignedByUserId) throw new Error('assignedByUserId est obligatoire.');

    const requestedRole = roleCode || 'CASHIER';
    const role = await RefDAL.getByCode('role', requestedRole);
    if (!role) throw new Error(`Rôle inconnu : ${requestedRole}`);

    const req = await UserStoreDAL._getRequest(transaction);
    try {
      const result = await req
        .input('userId', sql.Int, userId)
        .input('storeId', sql.Int, storeId)
        .input('roleId', sql.Int, role.roleId)
        .input('assignedByUserId', sql.Int, assignedByUserId)
        .execute('dbo.usp_AssignUserToStore');

      const row = result.recordset[0] || null;
      if (!row) return null;
      
      return {
        userStoreId: row.userStoreId,
        userId: row.userId,
        storeId: row.storeId,
        roleId: row.roleId,
        dtStartDate: row.dtStartDate
      };
    } catch (err) {
      throw UserStoreDAL._mapSqlError(err);
    }
  }

  static async listUsers(storeId, requestedByUserId = null) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('requestedByUserId', sql.Int, requestedByUserId)
        .execute('dbo.usp_ListUsersByStore'); // ✅ Appel de la procédure qu'on vient de créer

      return result.recordset;
    } catch (err) {
      throw UserStoreDAL._mapSqlError(err);
    }
  }

  static async getStoresByUserId(userId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .execute('dbo.usp_GetStoresByUserId');

      return result.recordset;
    } catch (err) {
      throw UserStoreDAL._mapSqlError(err);
    }
  }

  static async revoke(userStoreId, requestedByUserId = null) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userStoreId', sql.BigInt, userStoreId)
        .input('requestedByUserId', sql.Int, requestedByUserId)
        .execute('dbo.usp_RevokeUserStore'); // ✅ Appel de la procédure existante

      return result.recordset && result.recordset[0] ? Number(result.recordset[0].rowsAffected) > 0 : false;
    } catch (err) {
      throw UserStoreDAL._mapSqlError(err);
    }
  }

  /**
   * ✅ Synchronisation des gérants (ajout/suppression).
   */
  static async syncManagers(storeId, managerIds, assignedByUserId) {
    if (!Array.isArray(managerIds)) return;

    try {
      // 1. Récupérer les utilisateurs actuellement affectés à cette boutique
      const currentUsers = await UserStoreDAL.listUsers(storeId, assignedByUserId);
      const currentUserIds = currentUsers.map(u => u.userId);

      // 2. Révoquer ceux qui ont été décochés
      for (const user of currentUsers) {
        if (!managerIds.includes(user.userId) && user.userStoreId) {
          await UserStoreDAL.revoke(user.userStoreId, assignedByUserId);
        }
      }

      // 3. Ajouter les nouveaux
      for (const userId of managerIds) {
        if (!currentUserIds.includes(userId)) {
          await UserStoreDAL.assign({
            userId: Number(userId),
            storeId: Number(storeId),
            roleCode: 'MANAGER',
            assignedByUserId: Number(assignedByUserId)
          });
        }
      }
    } catch (err) {
      throw UserStoreDAL._mapSqlError(err);
    }
  }
}

module.exports = UserStoreDAL;