/**
 * @file cashSessionDAL.js
 * @description DAL caisses et sessions — ACCÈS EXCLUSIF via les objets du module
 * utils/cash-session-module.sql. INTERDIT : tout SQL inline sur dbo.tblCashRegister
 * et dbo.tblCashSession (unicité des sessions OPEN et transitions de statut sont
 * déléguées au SQL).
 * Vues : vw_CashRegisterDetails, vw_CashSessionDetails.
 * Procédures : sp_CreateCashRegister, sp_GetCashRegistersByStore, sp_OpenCashSession,
 *   sp_GetOpenCashSessionByRegister, sp_GetOpenCashSessionByUser,
 *   sp_GetOpenCashSessionByUserAndStore, sp_GetCashSessionById,
 *   sp_GetCashSessionHistoryByUser, sp_CloseCashSession, sp_GetCashSessionsByRegister.
 * @module DAL/CashSession
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class CashSessionDAL {
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
   * Crée une caisse active via dbo.sp_CreateCashRegister
   */
  static async createRegister({ storeId, vcRegisterCode, vcRegisterName }) {
    if (!vcRegisterCode || !vcRegisterName) {
      throw new Error('vcRegisterCode et vcRegisterName sont obligatoires.');
    }

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('vcRegisterCode', sql.VarChar(20), vcRegisterCode)
        .input('vcRegisterName', sql.VarChar(50), vcRegisterName)
        .execute('dbo.sp_CreateCashRegister');

      return result.recordset[0];
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * Caisses actives d'une boutique via dbo.sp_GetCashRegistersByStore
   */
  static async getRegisters(storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetCashRegistersByStore');

      return result.recordset;
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * Ouvre une session via dbo.sp_OpenCashSession
   */
  static async openSession({ cashRegisterId, userId, mOpeningCaisse = 0 }) {
    if (mOpeningCaisse < 0) {
      throw new Error('CK_CashSession_Amounts : mOpeningCaisse doit être >= 0.');
    }

    const status = await RefDAL.getByCode('cashSessionStatus', 'OPEN');
    if (!status) {
      throw new Error('Statut de session inconnu : OPEN (tblRefCashSessionStatus).');
    }

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashRegisterId', sql.Int, cashRegisterId)
        .input('userId', sql.Int, userId)
        .input('cashSessionStatusId', sql.Int, status.cashSessionStatusId)
        .input('mOpeningCaisse', sql.Money, mOpeningCaisse)
        .execute('dbo.sp_OpenCashSession');

      return result.recordset[0];
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * Session ouverte d'une caisse via dbo.sp_GetOpenCashSessionByRegister
   */
  static async getOpenSession(cashRegisterId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashRegisterId', sql.Int, cashRegisterId)
        .execute('dbo.sp_GetOpenCashSessionByRegister');

      return result.recordset[0] || null;
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * Session ouverte d'un utilisateur via dbo.sp_GetOpenCashSessionByUser.
   */
  static async getOpenSessionByUser(userId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .execute('dbo.sp_GetOpenCashSessionByUser');

      return result.recordset[0] || null;
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * Session ouverte d'un utilisateur POUR UNE boutique via dbo.sp_GetOpenCashSessionByUserAndStore
   */
  static async getOpenSessionByUserAndStore(userId, storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetOpenCashSessionByUserAndStore');

      return result.recordset[0] || null;
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * Récupère les statistiques (totaux des ventes, recouvrements, etc.) d'une session.
   */
  static async getSessionTotals(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetSaleSessionTotals'); 

      return result.recordset[0] || { totalVentes: 0, nombreVentes: 0 };
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * Session par identifiant via dbo.sp_GetCashSessionById
   */
  static async getById(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetCashSessionById');

      return result.recordset[0] || null;
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * Historique des sessions d'un utilisateur via dbo.sp_GetCashSessionHistoryByUser
   */
  static async getHistoryByUser(userId, { limit = 50 } = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('limit', sql.Int, limit)
        .execute('dbo.sp_GetCashSessionHistoryByUser');

      return result.recordset;
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * ✅ CORRECTION : Clôture une session ouverte via dbo.sp_CloseCashSession.
   * Accepte désormais une justification obligatoire en cas d'écart de caisse.
   * @param {number} cashSessionId
   * @param {number} mDeclaredClosingAmount
   * @param {string} [vcJustification=null]
   * @returns {Promise<Object|null>}
   */
  static async closeSession(cashSessionId, mDeclaredClosingAmount, vcJustification = null) {
    if (mDeclaredClosingAmount === undefined || mDeclaredClosingAmount === null || mDeclaredClosingAmount < 0) {
      throw new Error('CK_CashSession_Amounts : mDeclaredClosingAmount est obligatoire et >= 0.');
    }

    const status = await RefDAL.getByCode('cashSessionStatus', 'CLOSED');
    if (!status) {
      throw new Error('Statut de session inconnu : CLOSED (tblRefCashSessionStatus).');
    }

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .input('cashSessionStatusId', sql.Int, status.cashSessionStatusId)
        .input('mDeclaredClosingAmount', sql.Money, mDeclaredClosingAmount)
        .input('vcJustification', sql.VarChar(250), vcJustification) // 👈 LE PARAMÈTRE EST AJOUTÉ ICI
        .execute('dbo.sp_CloseCashSession');

      return result.recordset[0] || null;
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }

  /**
   * Sessions d'une caisse, plus récentes d'abord, via dbo.sp_GetCashSessionsByRegister
   */
  static async getSessions(cashRegisterId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashRegisterId', sql.Int, cashRegisterId)
        .execute('dbo.sp_GetCashSessionsByRegister');

      return result.recordset;
    } catch (err) {
      throw CashSessionDAL._mapSqlError(err);
    }
  }
}

module.exports = CashSessionDAL;