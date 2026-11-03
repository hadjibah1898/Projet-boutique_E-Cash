/**
 * @file purchaseDAL.js
 * @description DAL approvisionnements — ACCÈS EXCLUSIF via les objets du module
 * utils/purchase-module.sql. INTERDIT : tout SQL inline sur dbo.tblPurchase,
 * dbo.tblPurchaseDetail, dbo.tblStockLot (réceptions, lots et mouvements de stock
 * sont délégués aux procédures).
 * Vues : vw_PurchaseDetails, vw_PurchaseLineDetails.
 * TVP : PurchaseDetailInputType, PurchaseReceptionInputType.
 * Procédures : sp_CreatePurchase, sp_GetPurchasesByStore, sp_GetPurchaseDetails,
 *   sp_ReceivePurchase, sp_CancelPurchase.
 * Statuts (tblRefPurchaseStatus) : DRAFT, ORDERED, PARTIAL, RECEIVED, CANCELLED.
 * LineAmount est une colonne calculée PERSISTED (dcReceivedQuantity * mUnitPurchasePrice).
 * @module DAL/Purchase
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class PurchaseDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre les codes 52300-52314 du module achats).
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
   * Construit la TVP dbo.PurchaseDetailInputType (lignes d'achat).
   * @private
   * @param {Array<Object>} details - { productId, dcOrderedQuantity, mUnitPurchasePrice,
   *   vcLotNumber, dtExpirationAt }
   * @returns {sql.Table}
   */
  static _buildDetailsTable(details) {
    const table = new sql.Table('PurchaseDetailInputType');
    table.columns.add('productId', sql.BigInt, { nullable: false });
    table.columns.add('dcOrderedQuantity', sql.Decimal(18, 3), { nullable: false });
    table.columns.add('mUnitPurchasePrice', sql.Money, { nullable: false });
    table.columns.add('vcLotNumber', sql.VarChar(30), { nullable: true });
    table.columns.add('dtExpirationAt', sql.Date, { nullable: true });

    for (const d of details) {
      if (!d.productId || !d.dcOrderedQuantity || d.dcOrderedQuantity <= 0) {
        throw new Error('Chaque ligne exige productId et dcOrderedQuantity > 0.');
      }
      if (d.mUnitPurchasePrice === undefined || d.mUnitPurchasePrice < 0) {
        throw new Error('mUnitPurchasePrice est obligatoire et doit être >= 0.');
      }

      table.rows.add(
        d.productId,
        Number(d.dcOrderedQuantity),
        Number(d.mUnitPurchasePrice),
        d.vcLotNumber ? String(d.vcLotNumber).trim() : null,
        d.dtExpirationAt || null
      );
    }
    return table;
  }

  /**
   * Construit la TVP dbo.PurchaseReceptionInputType (lignes de réception) :
   * quantités négatives normalisées en Math.abs, lignes à zéro écartées.
   * @private
   * @param {Array<Object>} receptions - { purchaseDetailId, dcQuantity }
   * @returns {sql.Table}
   */
  static _buildReceptionsTable(receptions) {
    const table = new sql.Table('PurchaseReceptionInputType');
    table.columns.add('purchaseDetailId', sql.Int, { nullable: false });
    table.columns.add('dcQuantity', sql.Decimal(18, 3), { nullable: false });

    const byId = new Map();
    for (const r of receptions) {
      const qty = Math.abs(Number(r.dcQuantity));
      if (!qty) continue;
      // Cumul des doublons : la TVP porte une PK, deux lignes identiques doivent s'additionner.
      byId.set(r.purchaseDetailId, (byId.get(r.purchaseDetailId) || 0) + qty);
    }
    for (const [purchaseDetailId, qty] of byId) {
      table.rows.add(purchaseDetailId, qty);
    }
    return table;
  }

  /**
   * Crée un achat DRAFT + lignes via dbo.sp_CreatePurchase (transaction unique SQL).
   * @param {Object} data
   * @param {string} data.vcPurchaseNumber
   * @param {number} data.supplierId
   * @param {number} data.storeId
   * @param {number} data.createdByUserId
   * @param {string|Date|null} [data.dtOrderAt]
   * @param {Array<Object>} data.details - [{ productId, dcOrderedQuantity,
   *   mUnitPurchasePrice, vcLotNumber, dtExpirationAt }]
   * @returns {Promise<Object>} { purchaseId, vcPurchaseNumber, mTotalAmount }
   */
  static async create(data) {
    const {
      vcPurchaseNumber, supplierId, storeId, dtOrderAt = null,
      createdByUserId, details = []
    } = data;

    if (!vcPurchaseNumber || !vcPurchaseNumber.trim()) throw new Error('vcPurchaseNumber est obligatoire.');
    if (!supplierId || !storeId) throw new Error('supplierId et storeId sont obligatoires.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');
    if (!details.length) throw new Error('Au moins une ligne de détail est requise.');

    // Validation des lignes AVANT tout accès base (échec rapide et clair).
    const detailsTable = PurchaseDAL._buildDetailsTable(details);

    const status = await RefDAL.getByCode('purchaseStatus', 'DRAFT');
    if (!status) throw new Error('Statut d\'achat inconnu : DRAFT (tblRefPurchaseStatus).');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('vcPurchaseNumber', sql.VarChar(30), vcPurchaseNumber.trim())
        .input('supplierId', sql.Int, supplierId)
        .input('storeId', sql.Int, storeId)
        .input('purchaseStatusId', sql.Int, status.purchaseStatusId)
        .input('dtOrderAt', sql.DateTime2, dtOrderAt || null)
        .input('createdByUserId', sql.Int, createdByUserId)
        .input('details', detailsTable)
        .execute('dbo.sp_CreatePurchase');

      return result.recordset[0];
    } catch (err) {
      throw PurchaseDAL._mapSqlError(err);
    }
  }

  /** Liste des achats d'une boutique via dbo.sp_GetPurchasesByStore (vw_PurchaseDetails). */
  static async getByStore(storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetPurchasesByStore');

      return result.recordset;
    } catch (err) {
      throw PurchaseDAL._mapSqlError(err);
    }
  }

  /** Détails d'un achat via dbo.sp_GetPurchaseDetails (vw_PurchaseLineDetails). */
  static async getDetails(purchaseId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('purchaseId', sql.Int, purchaseId)
        .execute('dbo.sp_GetPurchaseDetails');

      return result.recordset;
    } catch (err) {
      throw PurchaseDAL._mapSqlError(err);
    }
  }

  /**
   * Réceptionne un achat (partiel ou complet) via dbo.sp_ReceivePurchase : la procédure,
   * dans sa propre transaction, verrouille l'achat (52308/52309), contrôle les lignes
   * (52310 étrangère, 52311 dépassement), met à jour les quantités reçues, crée ou
   * almente les lots de stock, insère les mouvements PURCHASE, recalcule mTotalAmount
   * puis synchronise le statut final PARTIAL / RECEIVED.
   * @param {number} purchaseId
   * @param {Array<Object>} receptions - [{ purchaseDetailId, dcQuantity }] (Math.abs appliqué,
   *   lignes à zéro ignorées, doublons fusionnés — comportement inchangé).
   * @param {number} receivedByUserId
   * @returns {Promise<Object>} { purchaseId, status: 'PARTIAL' | 'RECEIVED' }
   */
  static async receive(purchaseId, receptions, receivedByUserId) {
    if (!receptions || !receptions.length) {
      throw new Error('Aucune ligne de réception fournie.');
    }

    const receptionsTable = PurchaseDAL._buildReceptionsTable(receptions);
    if (!receptionsTable.rows.length) {
      throw new Error('Aucune ligne de réception fournie.');
    }

    const partialStatus = await RefDAL.getByCode('purchaseStatus', 'PARTIAL');
    const receivedStatus = await RefDAL.getByCode('purchaseStatus', 'RECEIVED');
    const movementType = await RefDAL.getByCode('stockMovementType', 'PURCHASE_RECEIPT');
    if (!partialStatus || !receivedStatus) {
      throw new Error('Statuts d\'achat PARTIAL / RECEIVED introuvables (tblRefPurchaseStatus).');
    }
    if (!movementType) {
      throw new Error('Type de mouvement PURCHASE_RECEIPT introuvable (tblRefStockMovementType).');
    }

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('purchaseId', sql.Int, purchaseId)
        .input('receivedByUserId', sql.Int, receivedByUserId)
        .input('partialStatusId', sql.Int, partialStatus.purchaseStatusId)
        .input('receivedStatusId', sql.Int, receivedStatus.purchaseStatusId)
        .input('purchaseReceiptMovementTypeId', sql.Int, movementType.stockMovementTypeId)
        .input('receptions', receptionsTable)
        .execute('dbo.sp_ReceivePurchase');

      return result.recordset[0];
    } catch (err) {
      throw PurchaseDAL._mapSqlError(err);
    }
  }

  /**
   * Annule un achat en statut DRAFT ou ORDERED via dbo.sp_CancelPurchase
   * (aucune modification sinon — comportement de booléen inchangé).
   * @param {number} purchaseId
   * @returns {Promise<boolean>} true si l'annulation a eu lieu.
   */
  static async cancel(purchaseId) {
    const status = await RefDAL.getByCode('purchaseStatus', 'CANCELLED');
    if (!status) throw new Error('Statut d\'achat inconnu : CANCELLED (tblRefPurchaseStatus).');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('purchaseId', sql.Int, purchaseId)
        .input('cancelledStatusId', sql.Int, status.purchaseStatusId)
        .execute('dbo.sp_CancelPurchase');

      const row = (result.recordset || [])[0] || {};
      return Number(row.rowsAffected || 0) > 0;
    } catch (err) {
      throw PurchaseDAL._mapSqlError(err);
    }
  }
}

module.exports = PurchaseDAL;