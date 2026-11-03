/**
 * @file userCompanyDAL.js
 * @description DAL entreprise — ACCES EXCLUSIF par abstraction SQL Server.
 * Affectations : sp_ManageUserScope (@ScopeType='COMPANY').
 * Lectures : sp_GetUserCompanyRoles, sp_ListUsersByCompany (vw_UserCompanyDetails).
 * Revocation : sp_RevokeUserCompany (SuperAdmin requis via @requestedByUserId).
 * INTERDIT : tout acces direct a dbo.tblUserCompany (aucun SQL inline).
 * @module DAL/UserCompany
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class UserCompanyDAL {
  /**
   * Génère une requête liée à une transaction ou au pool (usage interne).
   * NOTE : hors savepoint, sp_ManageUserScope gère sa propre transaction.
   * @private
   */
  static async _getRequest(transaction = null) {
    if (transaction) return new sql.Request(transaction);
    const pool = await poolPromise;
    return pool.request();
  }

  /**
   * Traduit un THROW SQL métier (500xx / 512xx du module user) en Error exploitable.
   * @private
   */
  static _mapSqlError(err) {
    if (err && err.number >= 50000 && err.number < 51300) {
      const clean = new Error(err.message);
      clean.sqlNumber = err.number;
      return clean;
    }
    return err;
  }

  /**
   * Affecte un rôle à un utilisateur dans une entreprise.
   * @param {Object} data - { userId, companyId, roleCode, createdByUserId, transaction }
   */
  static async assign(data) {
    const { userId, companyId, roleCode, createdByUserId = null, transaction = null } = data;

    if (!userId) throw new Error('userId est obligatoire.');
    if (!companyId) throw new Error('companyId est obligatoire.');

    const requestedRole = roleCode || 'ADMIN';
    const role = await RefDAL.getByCode('role', requestedRole);
    if (!role) throw new Error(`Rôle inconnu : ${requestedRole}`);

    const req = await UserCompanyDAL._getRequest(transaction);
    try {
      const result = await req
        .input('Action', sql.VarChar(10), 'GRANT')
        .input('ScopeType', sql.VarChar(10), 'COMPANY')
        .input('UserId', sql.Int, userId)
        .input('ScopeId', sql.Int, companyId)
        .input('roleId', sql.Int, role.roleId)
        .input('assignedByUserId', sql.Int, createdByUserId)
        .execute('dbo.sp_ManageUserScope');

      return result.recordset[0];
    } catch (err) {
      throw UserCompanyDAL._mapSqlError(err);
    }
  }

  /**
   * Rôles actifs d'un utilisateur dans une entreprise via dbo.sp_GetUserCompanyRoles
   * (vw_UserCompanyDetails : userCompanyId, roleId, roleCode, roleName, dtAssignedAt,
   * trié par dtAssignedAt).
   */
  static async getRoles(userId, companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_GetUserCompanyRoles');

      return result.recordset;
    } catch (err) {
      throw UserCompanyDAL._mapSqlError(err);
    }
  }

  /**
   * Liste les utilisateurs d'une entreprise via dbo.sp_ListUsersByCompany
   * (mêmes colonnes que l'ancien SELECT : userCompanyId, userId, nom, contact, rôle).
   */
  static async listUsers(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_ListUsersByCompany');

      return result.recordset;
    } catch (err) {
      throw UserCompanyDAL._mapSqlError(err);
    }
  }

  /**
   * Retire un rôle via dbo.sp_RevokeUserCompany : la SP exige un demandeur
   * SUPER_ADMIN (@requestedByUserId, sinon 51260), met btEnabled = 0 / dtEndedAt
   * et renvoie rowsAffected. Déjà révoquée => 51233 côté SQL.
   * @param {number} userCompanyId - assignmentId (bigint).
   * @param {number|null} [requestedByUserId] - Utilisateur qui révoque (SUPER_ADMIN).
   * @returns {Promise<boolean>} true si une affectation a été révoquée.
   */
  static async revoke(userCompanyId, requestedByUserId = null) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userCompanyId', sql.BigInt, userCompanyId)
        .input('requestedByUserId', sql.Int, requestedByUserId)
        .execute('dbo.sp_RevokeUserCompany');

      return Number(result.recordset[0].rowsAffected) > 0;
    } catch (err) {
      throw UserCompanyDAL._mapSqlError(err);
    }
  }
}

module.exports = UserCompanyDAL;