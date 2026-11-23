/**
 * @file dashboardDAL.js
 * @description DAL statistiques du tableau de bord.
 * @module DAL/Dashboard
 */

'use strict';

const { poolPromise, sql } = require('../config/db');

// ✅ Fonction pour extraire et parser le JSON renvoyé par SQL Server
const extractJson = (recordset) => {
  if (!recordset || recordset.length === 0) return null;
  const row = recordset[0];
  if (!row) return null;
  const keys = Object.keys(row);
  if (keys.length === 0) return null;
  const val = row[keys[0]];
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { return null; }
  }
  return val;
};

class DashboardDAL {
  static async getStats(companyId = null, storeId = null, range = 'monthly') {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId || null)
        .input('storeId', sql.Int, storeId || null)
        .input('range', sql.VarChar(20), range || 'monthly')
        .execute('dbo.usp_GetSuperAdminDashboardStats');

      // 1. Compteurs globaux (Recordset 0)
      const counters = (result.recordsets?.[0]?.[0]) || {};
      
      // 2. On extrait les JSON
      const detailedSales = extractJson(result.recordsets?.[1]) || [];
      
      let salesProfit = extractJson(result.recordsets?.[2]) || { categories: [], series: [] };
      if (Array.isArray(salesProfit) && salesProfit.length > 0) salesProfit = salesProfit[0];

      let productSalesRaw = extractJson(result.recordsets?.[3]) || [];
      let productSales = { labels: [], series: [] };
      if (Array.isArray(productSalesRaw)) {
          productSales.labels = productSalesRaw.map(p => p.label);
          productSales.series = productSalesRaw.map(p => p.value);
      }

      const performanceBoutiques = extractJson(result.recordsets?.[4]) || [];
      const performanceGerants = extractJson(result.recordsets?.[5]) || [];

      return { 
        ...counters, 
        detailedSales, 
        salesProfit, 
        productSales, 
        performanceBoutiques, 
        performanceGerants 
      };
    } catch (err) {
      console.error("❌ Erreur DAL Dashboard :", err.message);
      throw err;
    }
  }
}

module.exports = DashboardDAL;