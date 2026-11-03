/**
 * @file dashboardDAL.js
 * @description DAL statistiques du tableau de bord.
 * @module DAL/Dashboard
 */

'use strict';

const { poolPromise, sql } = require('../config/db');

class DashboardDAL {
  /**
   * Statistiques globales pour le tableau de bord.
   * @param {number|null} companyId - Filtre par entreprise (Admin).
   * @param {number|null} storeId - Filtre par boutique (Gérant).
   * @param {string} range - Période (monthly, yearly, etc.)
   */
  static async getSuperAdminStats(companyId = null, storeId = null, range = 'monthly') {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('companyId', sql.Int, companyId)
      .input('storeId', sql.Int, storeId) // ✅ On ajoute le filtre boutique
      .input('range', sql.VarChar(20), range) // ✅ On ajoute la période
      .execute('dbo.usp_GetSuperAdminDashboardStats');

    const counters = (result.recordsets && result.recordsets[0] && result.recordsets[0][0]) || {};
    const entreprises = (result.recordsets && result.recordsets[1]) || [];

    return { ...counters, entreprises };
  }
}

module.exports = DashboardDAL;