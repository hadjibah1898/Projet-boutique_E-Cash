/**
 * @file stockMovementDAL.js
 * @description DAL mouvements de stock — ACCÈS EXCLUSIF via les objets du module
 * utils/stock-movement-module.sql (insert-only, journal immuable).
 * INTERDIT : tout SQL inline sur dbo.tblStockMovement et dbo.tblStoreStock —
 * sp_RecordStockMovement crée/initie la ligne de stock, verrouille, contrôle le solde,
 * insère le journal et met à jour le stock dans SA propre transaction.
 * Vues : vw_StockMovementDetails.
 * Procédures : sp_RecordStockMovement, sp_GetStockMovementsByStore.
 * Codes erreur métier : 51900 (storeId), 51901 (productId), 51902 (type),
 *   51903 (dcQuantity), 51904 (operatedByUserId), 51905 (ligne stock),
 *   51906 (stock insuffisant).
 * @module DAL/StockMovement
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

/** Codes de tblRefStockMovementType et direction attendue (direction du script). */
const MOVEMENT_DIRECTIONS = {
  PURCHASE_RECEIPT: 1, SALE: -1, TRANSFER_OUT: -1, TRANSFER_IN: 1,
  ADJUSTMENT_IN: 1, ADJUSTMENT_OUT: -1, SALE_CANCEL: 1, RETURN_TO_SUPPLIER: -1
};

class StockMovementDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 51900-51906).
   * @private
   */
  static _mapSqlError(err) {
    if (err && err.number >= 51900 && err.number <= 51906) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  /**
   * Enregistre un mouvement de stock via dbo.sp_RecordStockMovement.
   * (Commentaires conservés...)
   */
  static async record(data) {
    const {
      storeId, productId, stockLotId = null, typeCode,
      vcReferenceType = null, referenceId = null,
      operatedByUserId, vcComment = null, transaction = null
    } = data;

    const type = await RefDAL.getByCode('stockMovementType', typeCode);
    if (!type) throw new Error(`Type de mouvement inconnu : ${typeCode}`);

    const absQty = Math.abs(Number(data.dcQuantity));
    if (!absQty) throw new Error('La quantité doit être différente de 0 (CK_StockMovement_Quantity).');

    try {
      const pool = await poolPromise;
      const request = transaction ? new sql.Request(transaction) : pool.request();
      const result = await request
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .input('stockLotId', sql.Int, stockLotId)
        .input('stockMovementTypeId', sql.Int, type.stockMovementTypeId)
        .input('dcQuantity', sql.Decimal(18, 3), absQty)
        .input('vcReferenceType', sql.VarChar(30), vcReferenceType)
        .input('referenceId', sql.Int, referenceId)
        .input('operatedByUserId', sql.Int, operatedByUserId)
        .input('vcComment', sql.VarChar(150), vcComment)
        .execute('dbo.sp_RecordStockMovement');

      return result.recordset[0];
    } catch (err) {
      throw StockMovementDAL._mapSqlError(err);
    }
  }

  /**
   * Historique des mouvements d'une boutique via dbo.sp_GetStockMovementsByStore
   * (vw_StockMovementDetails ; filtre produit optionnel, @limit borné à 1000).
   * @param {number} storeId
   * @param {Object} [options]
   * @param {number|null} [options.productId]
   * @param {string|null} [options.typeCode]
   * @param {number} [options.limit=100]
   * @returns {Promise<Array>}
   */
  static async getByStore(storeId, { productId = null, typeCode = null, limit = 100 } = {}) {
    try {
      const pool = await poolPromise;
      
      // 🟢 On récupère l'ID du type de mouvement si un code est fourni
      let stockMovementTypeId = null;
      if (typeCode) {
        const type = await RefDAL.getByCode('stockMovementType', typeCode);
        if (type) stockMovementTypeId = type.stockMovementTypeId;
      }

      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .input('stockMovementTypeId', sql.Int, stockMovementTypeId) // 🟢 Filtre type
        .input('limit', sql.Int, limit)
        .execute('dbo.sp_GetStockMovementsByStore');

      return result.recordset;
    } catch (err) {
      throw StockMovementDAL._mapSqlError(err);
    }
  }

  /**
   * Un mouvement par identifiant via dbo.sp_GetStockMovementById.
   * (Commentaires conservés...)
   */
  static async getById(stockMovementId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('stockMovementId', sql.Int, stockMovementId)
        .execute('dbo.sp_GetStockMovementById');

      return result.recordset[0] || null;
    } catch (err) {
      throw StockMovementDAL._mapSqlError(err);
    }
  }
}

module.exports = { StockMovementDAL, MOVEMENT_DIRECTIONS };