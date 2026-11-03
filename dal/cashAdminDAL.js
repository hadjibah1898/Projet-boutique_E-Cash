/**
 * @file cashAdminDAL.js
 * @description DAL pour la caisse centrale des administrateurs (ZERO SQL).
 * @module DAL/CashAdmin
 */

const { sql, poolPromise } = require('../config/db');

class CashAdminDAL {
  static _mapSqlError(err) {
    if (err && err.number >= 50000 && err.number < 54000) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  /**
   * Récupère ou crée la caisse centrale et ses 50 derniers mouvements.
   * @param {number} userId 
   */
  static async getOrCreateByUser(userId) {
    try {
      const pool = await poolPromise;
      
      // ✅ Appel de la procédure stockée (Zéro SQL)
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .execute('dbo.sp_GetCashAdminData');

      if (!result.recordsets || result.recordsets.length === 0) return null;
      
      // On récupère le premier recordset (les infos du compte)
      const caisse = result.recordsets[0][0];
      
      if (caisse) {
        // On récupère le deuxième recordset (les mouvements)
        caisse.movements = result.recordsets[1] || [];
      }
      
      return caisse;
    } catch (err) {
      throw CashAdminDAL._mapSqlError(err);
    }
  }
}

module.exports = CashAdminDAL;