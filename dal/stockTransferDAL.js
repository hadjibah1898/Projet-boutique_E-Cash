/**
 * @file stockTransferDAL.js
 * @description DAL transferts de stock — ACCÈS EXCLUSIF via les objets du module
 * utils/stock-transfer-module.sql. INTERDIT : tout SQL inline sur dbo.tblStockTransfer
 * et dbo.tblStockTransferDetail (créations transactionnelles et mises à jour par lot
 * sont déléguées aux procédures).
 * Vues : vw_StockTransferDetails, vw_StockTransferLineDetails.
 * TVP : StockTransferDetailCreateType, StockTransferQuantityUpdateType.
 * Procédures : sp_CreateStockTransfer, sp_GetStockTransferHeader,
 *   sp_GetStockTransferDetails, sp_SetStockTransferStatus,
 *   sp_GetStockTransfersByStore, sp_UpdateStockTransferQuantities.
 * Statuts : DRAFT, PENDING, APPROVED, SHIPPED, RECEIVED, CANCELLED.
 * @module DAL/StockTransfer
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

function generateTransferNumber() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `TRF-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}`;
}

class StockTransferDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre les codes 51800-51810 du module transferts).
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
   * Construit la TVP dbo.StockTransferDetailCreateType (lignes de création).
   * @private
   * @param {Array<Object>} details - { productId, stockLotId, dcRequestedQuantity }
   * @returns {sql.Table}
   */
  static _buildDetailsTable(details) {
    const table = new sql.Table('StockTransferDetailCreateType');
    table.columns.add('productId', sql.BigInt, { nullable: false });
    table.columns.add('stockLotId', sql.Int, { nullable: true });
    table.columns.add('dcRequestedQuantity', sql.Decimal(18, 3), { nullable: false });

    for (const d of details) {
      if (!d.productId || !(Number(d.dcRequestedQuantity) > 0)) {
        throw new Error('Ligne : productId + dcRequestedQuantity > 0.');
      }
      table.rows.add(d.productId, d.stockLotId || null, Number(d.dcRequestedQuantity));
    }
    return table;
  }

  /**
   * Crée un transfert (entête + lignes) via dbo.sp_CreateStockTransfer
   * (transaction unique SQL, contrôles 51800-51807 dont boutiques différentes 51803).
   * @param {Object} params
   * @param {number} params.sourceStoreId
   * @param {number} params.destinationStoreId
   * @param {number} params.createdByUserId
   * @param {string|null} [params.vcCarrierName]
   * @param {Array<Object>} params.details - [{ productId, stockLotId, dcRequestedQuantity }]
   * @param {string|null} [params.vcTransferNumber] - Généré si absent.
   * @returns {Promise<Object>} { stockTransferId, vcTransferNumber }
   */
  static async create({
    sourceStoreId, destinationStoreId, createdByUserId,
    vcCarrierName = null, details = [], vcTransferNumber = null
  }) {
    if (!sourceStoreId || !destinationStoreId) throw new Error('sourceStoreId et destinationStoreId sont obligatoires.');
    if (Number(sourceStoreId) === Number(destinationStoreId)) throw new Error('CK_StockTransfer_DifferentStores.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');
    if (!details.length) throw new Error('Au moins une ligne de transfert est requise.');

    const status = await RefDAL.getByCode('transferStatus', 'DRAFT');
    if (!status) throw new Error('Statut de transfert inconnu : DRAFT (tblRefTransferStatus).');

    // Validation des lignes AVANT tout accès base (échec rapide et clair).
    const detailsTable = StockTransferDAL._buildDetailsTable(details);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('vcTransferNumber', sql.VarChar(30), vcTransferNumber || generateTransferNumber())
        .input('sourceStoreId', sql.Int, sourceStoreId)
        .input('destinationStoreId', sql.Int, destinationStoreId)
        .input('transferStatusId', sql.Int, status.transferStatusId)
        .input('createdByUserId', sql.Int, createdByUserId)
        .input('vcCarrierName', sql.VarChar(50), vcCarrierName)
        .input('details', detailsTable)
        .execute('dbo.sp_CreateStockTransfer');

      return result.recordset[0];
    } catch (err) {
      throw StockTransferDAL._mapSqlError(err);
    }
  }

  /**
   * Entête d'un transfert via dbo.sp_GetStockTransferHeader
   * (vw_StockTransferDetails : statut + noms/entreprises des deux boutiques).
   * @param {number} stockTransferId
   * @returns {Promise<Object|null>}
   */
  static async getHeader(stockTransferId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('stockTransferId', sql.Int, stockTransferId)
        .execute('dbo.sp_GetStockTransferHeader');

      return result.recordset[0] || null;
    } catch (err) {
      throw StockTransferDAL._mapSqlError(err);
    }
  }

  /**
   * Lignes d'un transfert via dbo.sp_GetStockTransferDetails
   * (vw_StockTransferLineDetails, triées par identifiant).
   * @param {number} stockTransferId
   * @returns {Promise<Array>}
   */
  static async getDetails(stockTransferId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('stockTransferId', sql.Int, stockTransferId)
        .execute('dbo.sp_GetStockTransferDetails');

      return result.recordset;
    } catch (err) {
      throw StockTransferDAL._mapSqlError(err);
    }
  }

  /**
   * Fait avancer le statut via dbo.sp_SetStockTransferStatus : la procédure positionne
   * les horodatages (SHIPPED / RECEIVED), l'annulation et le motif.
   * @param {number} stockTransferId
   * @param {string} targetCode - Code de statut cible.
   * @param {Object} [options]
   * @param {number|null} [options.approvedByUserId]
   * @param {string|null} [options.vcCancellationReason]
   * @returns {Promise<Object|null>} { stockTransferId, transferStatusId }
   */
  static async setStatus(stockTransferId, targetCode, { approvedByUserId = null, vcCancellationReason = null } = {}) {
    const status = await RefDAL.getByCode('transferStatus', targetCode);
    if (!status) throw new Error(`Statut de transfert inconnu : ${targetCode}`);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('stockTransferId', sql.Int, stockTransferId)
        .input('transferStatusId', sql.Int, status.transferStatusId)
        .input('approvedByUserId', sql.Int, approvedByUserId)
        .input('vcCancellationReason', sql.VarChar(150), vcCancellationReason)
        .execute('dbo.sp_SetStockTransferStatus');

      return result.recordset[0] || null;
    } catch (err) {
      throw StockTransferDAL._mapSqlError(err);
    }
  }

  /**
   * Transferts impliquant une boutique (source ou destination) via
   * dbo.sp_GetStockTransfersByStore (vw_StockTransferDetails).
   * @param {number} storeId
   * @param {Object} [options]
   * @param {number} [options.limit=100]
   * @returns {Promise<Array>}
   */
  static async getByStore(storeId, { limit = 100 } = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('limit', sql.Int, limit)
        .execute('dbo.sp_GetStockTransfersByStore');

      return result.recordset;
    } catch (err) {
      throw StockTransferDAL._mapSqlError(err);
    }
  }

  /**
   * Met à jour par lot les quantités expédiées / reçues via
   * dbo.sp_UpdateStockTransferQuantities : lecture des lignes actuelles, fusion avec
   * les fournies (les absentes conservent leur valeur), puis un unique appel SP avec
   * TVP — remplace les N UPDATE en boucle. La SP vérifie l'appartenance des lignes au
   * transfert (51810) et refuse les négatifs (51809).
   * @param {number} stockTransferId
   * @param {Object} [quantities]
   * @param {Array<{stockTransferDetailId:number, qty:number}>} [quantities.shippedQty]
   * @param {Array<{stockTransferDetailId:number, qty:number}>} [quantities.receivedQty]
   * @returns {Promise<boolean>} true si la mise à jour a eu lieu.
   */
  static async updateQuantities(stockTransferId, { shippedQty = null, receivedQty = null } = {}) {
    const details = await StockTransferDAL.getDetails(stockTransferId);

    const mapShip = new Map((shippedQty || []).map((r) => [Number(r.stockTransferDetailId), Number(r.qty)]));
    const mapRec = new Map((receivedQty || []).map((r) => [Number(r.stockTransferDetailId), Number(r.qty)]));

    const table = new sql.Table('StockTransferQuantityUpdateType');
    table.columns.add('stockTransferDetailId', sql.Int, { nullable: false });
    table.columns.add('dcShippedQuantity', sql.Decimal(18, 3), { nullable: false });
    table.columns.add('dcReceivedQuantity', sql.Decimal(18, 3), { nullable: false });

    for (const d of details) {
      const ship = mapShip.has(d.stockTransferDetailId) ? mapShip.get(d.stockTransferDetailId) : Number(d.dcShippedQuantity);
      const rec = mapRec.has(d.stockTransferDetailId) ? mapRec.get(d.stockTransferDetailId) : Number(d.dcReceivedQuantity);
      if (!(ship >= 0) || !(rec >= 0)) throw new Error('Quantités expédiées / reçues >= 0.');
      table.rows.add(d.stockTransferDetailId, ship, rec);
    }

    if (!table.rows.length) return true;

    try {
      const pool = await poolPromise;
      await pool.request()
        .input('stockTransferId', sql.Int, stockTransferId)
        .input('quantities', table)
        .execute('dbo.sp_UpdateStockTransferQuantities');

      return true;
    } catch (err) {
      throw StockTransferDAL._mapSqlError(err);
    }
  }
}

module.exports = StockTransferDAL;
module.exports.generateTransferNumber = generateTransferNumber;