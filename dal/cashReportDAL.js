/**
 * @file cashReportDAL.js
 * @description DAL pour les rapports de caisse.
 * @module DAL/CashReport
 */

const { sql, poolPromise } = require('../config/db');

class CashReportDAL {
  static _mapSqlError(err) {
    if (err && err.number >= 50000 && err.number < 54000) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  static async createReport({ cashSessionId, userId, storeId, mDeclaredClosingAmount, vcManagerComment }) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .input('mDeclaredClosingAmount', sql.Money, mDeclaredClosingAmount)
        .input('vcManagerComment', sql.NVarChar(500), vcManagerComment || null)
        .execute('dbo.sp_CreateCashReport');

      return result.recordset ? result.recordset[0] : null;
    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  static async listReports() {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .execute('dbo.sp_GetCashReportsFiltered');
      return result.recordset;
    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  /**
   * Liste filtree des rapports de caisse.
   * @param {Object} filters - { storeId, gerantId, startDate, endDate }
   */
  static async listFiltered(filters = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, filters.storeId || null)
        .input('gerantId', sql.Int, filters.gerantId || null)
        .input('startDate', sql.DateTime, filters.startDate || null)
        .input('endDate', sql.DateTime, filters.endDate || null)
        .execute('dbo.sp_GetCashReportsFiltered');
      return result.recordset;
    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  /**
   * ✅ CORRECTION : Récupère les 3 recordsets (rapport, ventes, dépenses)
   */
  static async getReportDetails(cashReportId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashReportId', sql.Int, cashReportId)
        .execute('dbo.sp_GetCashReportById');
      
      // ✅ On extrait les 3 tableaux
      return {
        rapport: result.recordsets[0]?.[0] || null,
        ventes: result.recordsets[1] || [],
        depenses: result.recordsets[2] || []
      };
    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  /**
   * Rapports d'une session de caisse via sp_GetCashReportsBySession.
   * @param {number} cashSessionId
   */
  static async getReportsBySession(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetCashReportsBySession');
      return result.recordset;
    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  /**
   * Approuve ou rejette un rapport de caisse via sp_ApproveCashReport.
   */
  static async decideReport(cashReportId, level, userId, isApproved, comment = null) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashReportId', sql.Int, cashReportId)
        .input('level', sql.VarChar(10), level)
        .input('userId', sql.Int, userId)
        .input('isApproved', sql.Bit, isApproved ? 1 : 0)
        .input('comment', sql.VarChar(250), comment)
        .execute('dbo.sp_ApproveCashReport');
      return result.recordset[0] || null;
    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }
}

module.exports = CashReportDAL;