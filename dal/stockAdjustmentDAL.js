/**
 * @file stockAdjustmentDAL.js
 * @description DAL ajustements de stock — ACCÈS EXCLUSIF via les objets du module
 * utils/stock-adjustment-module.sql. INTERDIT : tout SQL inline sur
 * dbo.tblStockAdjustment et dbo.tblStockAdjustmentDetail (créations transactionnelles
 * et décisions de workflow sont déléguées aux procédures).
 * Vues : vw_StockAdjustmentDetails, vw_StockAdjustmentLineDetails.
 * TVP : StockAdjustmentDetailCreateType.
 * Procédures : sp_CreateStockAdjustment, sp_GetStockAdjustmentHeader,
 *   sp_GetStockAdjustmentDetails, sp_DecideStockAdjustment,
 *   sp_GetStockAdjustmentsByStore.
 * Motifs (tblRefAdjustmentReason) : THEFT, LOSS, BREAKAGE, INVENTORY_ERROR, EXPIRED, OTHER.
 * Statuts (tblRefAdjustmentStatus) : PENDING, APPROVED, REJECTED.
 * @module DAL/StockAdjustment
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class StockAdjustmentDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre les codes 52000-52008 du module ajustements).
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
   * Construit la TVP dbo.StockAdjustmentDetailCreateType (le calcul
   * dcQuantityAfter = before + delta est délégué à la procédure).
   * @private
   * @param {Array<Object>} details - { productId, stockLotId, dcQuantityBefore,
   *   dcAdjustmentQuantity }
   * @returns {sql.Table}
   */
  static _buildDetailsTable(details) {
    const table = new sql.Table('StockAdjustmentDetailCreateType');
    table.columns.add('productId', sql.BigInt, { nullable: false });
    table.columns.add('stockLotId', sql.Int, { nullable: true });
    table.columns.add('dcQuantityBefore', sql.Decimal(18, 3), { nullable: false });
    table.columns.add('dcAdjustmentQuantity', sql.Decimal(18, 3), { nullable: false });

    for (const d of details) {
      const before = Number(d.dcQuantityBefore);
      const delta = Number(d.dcAdjustmentQuantity);
      if (!(before >= 0) || !(before + delta >= 0)) {
        throw new Error('CK : before/after >= 0 et after = before + delta.');
      }
      table.rows.add(d.productId, d.stockLotId || null, before, delta);
    }
    return table;
  }

  /**
   * Crée un ajustement PENDING + lignes via dbo.sp_CreateStockAdjustment
   * (transaction unique SQL ; le SQL calcule dcQuantityAfter, contrôles 52000-52006).
   * @param {Object} params
   * @param {number} params.storeId
   * @param {string} params.reasonCode - Code du motif.
   * @param {string} params.vcJustification
   * @param {string|null} [params.vcProofImageUrl]
   * @param {number} params.createdByUserId
   * @param {Array<Object>} params.details - [{ productId, stockLotId, dcQuantityBefore,
   *   dcAdjustmentQuantity }]
   * @returns {Promise<Object>} { stockAdjustmentId }
   */
  static async create({ storeId, reasonCode, vcJustification, vcProofImageUrl = null, createdByUserId, details = [] }) {
    if (!storeId) throw new Error('storeId est obligatoire.');
    if (!vcJustification || !vcJustification.trim()) throw new Error('vcJustification est obligatoire.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');
    if (!details.length) throw new Error('Au moins une ligne est requise.');

    const reason = await RefDAL.getByCode('adjustmentReason', reasonCode);
    if (!reason) throw new Error(`Motif inconnu : ${reasonCode}`);
    const pending = await RefDAL.getByCode('adjustmentStatus', 'PENDING');
    if (!pending) throw new Error('Statut d\'ajustement inconnu : PENDING (tblRefAdjustmentStatus).');

    // Validation des lignes AVANT tout accès base (échec rapide et clair).
    const detailsTable = StockAdjustmentDAL._buildDetailsTable(details);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('adjustmentReasonId', sql.Int, reason.adjustmentReasonId)
        .input('adjustmentStatusId', sql.Int, pending.adjustmentStatusId)
        .input('vcJustification', sql.VarChar(150), vcJustification.trim())
        // 🟢 CORRECTION ICI : On utilise sql.MAX au lieu de 255 pour accepter les images longues
        .input('vcProofImageUrl', sql.VarChar(sql.MAX), vcProofImageUrl) 
        .input('createdByUserId', sql.Int, createdByUserId)
        .input('details', detailsTable)
        .execute('dbo.sp_CreateStockAdjustment');

      return result.recordset[0];
    } catch (err) {
      throw StockAdjustmentDAL._mapSqlError(err);
    }
  }

  /**
   * Entête d'un ajustement via dbo.sp_GetStockAdjustmentHeader
   * (vw_StockAdjustmentDetails : motif, statut, boutique).
   * @param {number} stockAdjustmentId
   * @returns {Promise<Object|null>}
   */
  static async getHeader(stockAdjustmentId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('stockAdjustmentId', sql.Int, stockAdjustmentId)
        .execute('dbo.sp_GetStockAdjustmentHeader');

      return result.recordset[0] || null;
    } catch (err) {
      throw StockAdjustmentDAL._mapSqlError(err);
    }
  }

  /**
   * Lignes d'un ajustement via dbo.sp_GetStockAdjustmentDetails
   * (vw_StockAdjustmentLineDetails, triées par identifiant).
   * @param {number} stockAdjustmentId
   * @returns {Promise<Array>}
   */
  static async getDetails(stockAdjustmentId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('stockAdjustmentId', sql.Int, stockAdjustmentId)
        .execute('dbo.sp_GetStockAdjustmentDetails');

      return result.recordset;
    } catch (err) {
      throw StockAdjustmentDAL._mapSqlError(err);
    }
  }

  /**
   * Passe un ajustement PENDING vers APPROVED / REJECTED via
   * dbo.sp_DecideStockAdjustment : horodatage, validateur et motif de décision
   * gérés en SQL (refus si la décision n'est pas APPROVED/REJECTED : 52008 ;
   * null si l'ajustement n'est plus PENDING).
   * @param {number} stockAdjustmentId
   * @param {string} targetCode - 'APPROVED' | 'REJECTED'
   * @param {Object} [options]
   * @param {number} options.approvedByUserId
   * @param {string|null} [options.vcApprovalComment]
   * @returns {Promise<Object|null>} { stockAdjustmentId, adjustmentStatusId }
   */
  static async decide(stockAdjustmentId, targetCode, { approvedByUserId, vcApprovalComment = null } = {}) {
    const status = await RefDAL.getByCode('adjustmentStatus', targetCode);
    if (!status) throw new Error(`Statut d'ajustement inconnu : ${targetCode}`);
    if (!approvedByUserId) throw new Error('approvedByUserId est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('stockAdjustmentId', sql.Int, stockAdjustmentId)
        .input('adjustmentStatusId', sql.Int, status.adjustmentStatusId)
        .input('approvedByUserId', sql.Int, approvedByUserId)
        .input('vcApprovalComment', sql.VarChar(150), vcApprovalComment)
        .execute('dbo.sp_DecideStockAdjustment');

      return result.recordset[0] || null;
    } catch (err) {
      throw StockAdjustmentDAL._mapSqlError(err);
    }
  }

  /**
   * Ajustements d'une boutique via dbo.sp_GetStockAdjustmentsByStore
   * (filtre de statut facultatif transmis en paramètre).
   * @param {number} storeId
   * @param {Object} [options]
   * @param {string|null} [options.statusCode]
   * @param {number} [options.limit=100]
   * @returns {Promise<Array>}
   */
  static async getByStore(storeId, { statusCode = null, limit = 100 } = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('statusCode', sql.VarChar(20), statusCode)
        .input('limit', sql.Int, limit)
        .execute('dbo.sp_GetStockAdjustmentsByStore');

      return result.recordset;
    } catch (err) {
      throw StockAdjustmentDAL._mapSqlError(err);
    }
  }
}

module.exports = StockAdjustmentDAL;