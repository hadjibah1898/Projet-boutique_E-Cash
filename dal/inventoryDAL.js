/**
 * @file inventoryDAL.js
 * @description DAL inventaires — ACCÈS EXCLUSIF via les objets du module
 * utils/inventory-module.sql. INTERDIT : tout SQL inline sur dbo.tblInventory
 * et dbo.tblInventoryDetail (créations transactionnelles, transitions de statut et
 * comptages sont délégués aux procédures).
 * Vues : vw_InventoryDetails, vw_InventoryLineDetails.
 * TVP : InventoryDetailCreateType, InventoryCountUpdateType.
 * Procédures : sp_CreateInventory, sp_GetInventoryHeader, sp_GetInventoryDetails,
 *   sp_SetInventoryStatus, sp_UpdateInventoryCounts.
 * Statuts (tblRefInventoryStatus) : OPEN, COUNTED, VALIDATED, CANCELLED.
 * DifferenceQuantity est une colonne calculée PERSISTED (calcul SQL).
 * @module DAL/Inventory
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

function generateInventoryNumber() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `INV-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}`;
}

class InventoryDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre les codes 52700-52707 du module inventaires).
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
   * Construit la TVP dbo.InventoryDetailCreateType (lignes théoriques/comptées).
   * @private
   * @param {Array<Object>} details - { productId, dcTheoreticalQuantity,
   *   dcPhysicalQuantity, vcComment }
   * @returns {sql.Table}
   */
  static _buildDetailsTable(details) {
    const table = new sql.Table('InventoryDetailCreateType');
    table.columns.add('productId', sql.BigInt, { nullable: false });
    table.columns.add('dcTheoreticalQuantity', sql.Decimal(18, 3), { nullable: false });
    table.columns.add('dcPhysicalQuantity', sql.Decimal(18, 3), { nullable: false });
    table.columns.add('vcComment', sql.NVarChar(150), { nullable: true });

    for (const d of details) {
      if (!d.productId) throw new Error('Ligne : productId obligatoire.');
      if (!(Number(d.dcTheoreticalQuantity) >= 0) || !(Number(d.dcPhysicalQuantity) >= 0)) {
        throw new Error('CK_InventoryDetail : quantités >= 0.');
      }
      table.rows.add(
        d.productId,
        Number(d.dcTheoreticalQuantity),
        Number(d.dcPhysicalQuantity),
        d.vcComment || null
      );
    }
    return table;
  }

  /**
   * Ouvre un inventaire OPEN avec ses lignes via dbo.sp_CreateInventory
   * (transaction unique SQL ; contrôles 52700-52704 dont statut initial OPEN 52703).
   * @param {Object} params
   * @param {number} params.storeId
   * @param {number} params.createdByUserId
   * @param {string|null} [params.vcInventoryNumber] - Généré si absent.
   * @param {Array<Object>} params.details - [{ productId, dcTheoreticalQuantity,
   *   dcPhysicalQuantity, vcComment }]
   * @returns {Promise<Object>} { inventoryId, vcInventoryNumber }
   */
  static async create({ storeId, createdByUserId, vcInventoryNumber = null, details = [] }) {
    if (!storeId) throw new Error('storeId est obligatoire.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

    const status = await RefDAL.getByCode('inventoryStatus', 'OPEN');
    if (!status) throw new Error('Statut d\'inventaire inconnu : OPEN (tblRefInventoryStatus).');

    // Validation des lignes AVANT tout accès base (échec rapide et clair).
    const detailsTable = InventoryDAL._buildDetailsTable(details);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('vcInventoryNumber', sql.VarChar(30), vcInventoryNumber || generateInventoryNumber())
        .input('storeId', sql.Int, storeId)
        .input('inventoryStatusId', sql.Int, status.inventoryStatusId)
        .input('createdByUserId', sql.Int, createdByUserId)
        .input('details', detailsTable)
        .execute('dbo.sp_CreateInventory');

      return result.recordset[0];
    } catch (err) {
      throw InventoryDAL._mapSqlError(err);
    }
  }

  /**
   * Entête d'un inventaire via dbo.sp_GetInventoryHeader (vw_InventoryDetails :
   * statut + boutique + entreprise).
   * @param {number} inventoryId
   * @returns {Promise<Object|null>}
   */
  static async getHeader(inventoryId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('inventoryId', sql.Int, inventoryId)
        .execute('dbo.sp_GetInventoryHeader');

      return result.recordset[0] || null;
    } catch (err) {
      throw InventoryDAL._mapSqlError(err);
    }
  }

  /**
   * Lignes d'un inventaire via dbo.sp_GetInventoryDetails (vw_InventoryLineDetails,
   * avec DifferenceQuantity calculée par la colonne PERSISTED).
   * @param {number} inventoryId
   * @returns {Promise<Array>}
   */
  static async getDetails(inventoryId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('inventoryId', sql.Int, inventoryId)
        .execute('dbo.sp_GetInventoryDetails');

      return result.recordset;
    } catch (err) {
      throw InventoryDAL._mapSqlError(err);
    }
  }

  /**
   * Change le statut (OPEN -> COUNTED -> VALIDATED / CANCELLED) via
   * dbo.sp_SetInventoryStatus : dtEndedAt positionné uniquement pour
   * VALIDATED / CANCELLED (contrôle 52706).
   * @param {number} inventoryId
   * @param {string} targetCode - Code de statut cible.
   * @param {Object} [options]
   * @param {number|null} [options.approvedByUserId]
   * @returns {Promise<Object|null>} { inventoryId, inventoryStatusId }
   */
  static async setStatus(inventoryId, targetCode, { approvedByUserId = null } = {}) {
    const status = await RefDAL.getByCode('inventoryStatus', targetCode);
    if (!status) throw new Error(`Statut d'inventaire inconnu : ${targetCode}`);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('inventoryId', sql.Int, inventoryId)
        .input('inventoryStatusId', sql.Int, status.inventoryStatusId)
        .input('approvedByUserId', sql.Int, approvedByUserId)
        .execute('dbo.sp_SetInventoryStatus');

      return result.recordset[0] || null;
    } catch (err) {
      throw InventoryDAL._mapSqlError(err);
    }
  }

  /**
   * Met à jour les quantités physiques comptées via dbo.sp_UpdateInventoryCounts
   * (une unique TVP remplace les N UPDATE ; appartenance des lignes vérifiée 52707,
   * quantités >= 0 : 52704). Dédoublonnage par inventoryDetailId (dernière valeur
   * conservée, comme la boucle historique).
   * @param {number} inventoryId
   * @param {Array<{inventoryDetailId:number, qty:number}>} [counts]
   * @returns {Promise<boolean>} true si la mise à jour a eu lieu.
   */
  static async updateCounts(inventoryId, counts = []) {
    const table = new sql.Table('InventoryCountUpdateType');
    table.columns.add('inventoryDetailId', sql.Int, { nullable: false });
    table.columns.add('dcPhysicalQuantity', sql.Decimal(18, 3), { nullable: false });

    const rows = new Map();
    for (const c of counts) {
      if (!(Number(c.qty) >= 0)) throw new Error('Quantité physique >= 0.');
      rows.set(c.inventoryDetailId, Number(c.qty));
    }
    for (const [inventoryDetailId, qty] of rows) {
      table.rows.add(inventoryDetailId, qty);
    }

    if (!table.rows.length) return true;

    try {
      const pool = await poolPromise;
      await pool.request()
        .input('inventoryId', sql.Int, inventoryId)
        .input('counts', table)
        .execute('dbo.sp_UpdateInventoryCounts');

      return true;
    } catch (err) {
      throw InventoryDAL._mapSqlError(err);
    }
  }
}

module.exports = InventoryDAL;
module.exports.generateInventoryNumber = generateInventoryNumber;