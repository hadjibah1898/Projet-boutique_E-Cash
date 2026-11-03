/**
 * @file storeStockDAL.js
 * @description DAL stock par boutique — ACCÈS EXCLUSIF via les objets du module
 * utils/store-stock-module.sql. INTERDIT : tout SQL inline sur dbo.tblStoreStock
 * (MERGE atomique, deltas et seuils sont délégués aux procédures).
 * Vues : vw_StoreStockDetails.
 * Procédures : sp_GetOrCreateStoreStock, sp_ApplyStoreStockDeltaForStore,
 *   sp_GetStoreStockByStore, sp_GetLowStoreStock.
 * Codes erreur métier : 51600 (storeId), 51601 (productId), 51602 (delta nul),
 *   51603 (ligne absente), 51604 (stock insuffisant).
 * @module DAL/StoreStock
 */

const { sql, poolPromise } = require('../config/db');

class StoreStockDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 51600-51604).
   * @private
   */
  static _mapSqlError(err) {
    if (err && err.number >= 51600 && err.number <= 51604) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  /**
   * Lit le stock d'un produit dans une boutique ou l'initialise à 0 de façon
   * atomique via dbo.sp_GetOrCreateStoreStock (MERGE + HOLDLOCK côté SQL,
   * thread-safe contre la double insertion).
   * @param {number} storeId
   * @param {number} productId
   * @param {Object|null} [transaction] - Transaction appelante optionnelle.
   * @returns {Promise<Object>} { storeStockId, storeId, productId,
   *   dcAvailableQuantity, dcReservedQuantity, dtUpdatedAt }
   */
  static async getOrCreate(storeId, productId, transaction = null) {
    try {
      const pool = await poolPromise;
      const request = transaction ? new sql.Request(transaction) : pool.request();
      const result = await request
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .execute('dbo.sp_GetOrCreateStoreStock');

      return result.recordset[0];
    } catch (err) {
      throw StoreStockDAL._mapSqlError(err);
    }
  }

  /**
   * Applique un delta atomique via dbo.sp_ApplyStoreStockDeltaForStore
   * (delta > 0 = entrée, < 0 = sortie ; refus si le stock passerait négatif —
   * 51604 — ou si la ligne n'existe pas — 51603).
   * @param {number} storeId
   * @param {number} productId
   * @param {number} delta
   * @param {Object|null} [transaction] - Transaction appelante optionnelle.
   * @returns {Promise<{before: number, after: number}>}
   */
  static async applyDelta(storeId, productId, delta, transaction = null) {
    if (!delta || delta === 0) {
      throw new Error('Le delta de stock ne peut pas être nul.');
    }

    try {
      const pool = await poolPromise;
      const request = transaction ? new sql.Request(transaction) : pool.request();
      const result = await request
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .input('delta', sql.Decimal(18, 3), delta)
        .execute('dbo.sp_ApplyStoreStockDeltaForStore');

      return result.recordset[0];
    } catch (err) {
      throw StoreStockDAL._mapSqlError(err);
    }
  }

  /**
   * Stock d'une boutique via dbo.sp_GetStoreStockByStore
   * (vw_StoreStockDetails ; produits actifs par défaut, tri par nom).
   * @param {number} storeId
   * @param {boolean} [includeInactive=false] - Inclut les produits désactivés.
   * @returns {Promise<Array>}
   */
  static async getByStore(storeId, includeInactive = false) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('includeInactive', sql.Bit, includeInactive ? 1 : 0)
        .execute('dbo.sp_GetStoreStockByStore');

      return result.recordset;
    } catch (err) {
      throw StoreStockDAL._mapSqlError(err);
    }
  }

  /**
   * Produits sous le seuil d'alerte via dbo.sp_GetLowStoreStock
   * (seuil effectif = COALESCE(sp.alertThreshold, p.dcDefaultAlertThreshold, 0)).
   * @param {number} storeId
   * @returns {Promise<Array>}
   */
  static async getLowStock(storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetLowStoreStock');

      return result.recordset;
    } catch (err) {
      throw StoreStockDAL._mapSqlError(err);
    }
  }
}

module.exports = StoreStockDAL;