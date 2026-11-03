/**
 * @file promotionDAL.js
 * @description DAL promotions — ACCÈS EXCLUSIF via les objets du module
 * utils/promotion-module.sql. INTERDIT : tout SQL inline sur dbo.tblPromotion,
 * dbo.tblPromotionProduct, dbo.tblPromotionStore et dbo.tblStockLot
 * (créations transactionnelles et purges sont déléguées aux procédures).
 * Vues : vw_PromotionDetails, vw_PromotionStoreDetails, vw_PromotionProductDetails.
 * TVP : PromotionProductIdList, PromotionStoreIdList.
 * Procédures : sp_CreatePromotion, sp_GetActivePromotionsForStore,
 *   sp_GetPromotionProducts, sp_DisableExpiredPromotions,
 *   sp_GetProductsForExpiryPromotion.
 * Types de remise (tblRefDiscountType) : PERCENTAGE, FIXED_AMOUNT.
 * @module DAL/Promotion
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class PromotionDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre les codes 52400-52410 du module promotions).
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
   * Construit la TVP dbo.PromotionProductIdList (PK : doublons écartés).
   * @private
   * @param {Array<number>} productIds
   * @returns {sql.Table}
   */
  static _buildProductIdsTable(productIds) {
    const table = new sql.Table('PromotionProductIdList');
    table.columns.add('productId', sql.BigInt, { nullable: false });
    for (const productId of new Set(productIds)) {
      table.rows.add(productId);
    }
    return table;
  }

  /**
   * Construit la TVP dbo.PromotionStoreIdList (PK : doublons écartés).
   * @private
   * @param {Array<number>} storeIds
   * @returns {sql.Table}
   */
  static _buildStoreIdsTable(storeIds) {
    const table = new sql.Table('PromotionStoreIdList');
    table.columns.add('storeId', sql.Int, { nullable: false });
    for (const storeId of new Set(storeIds)) {
      table.rows.add(storeId);
    }
    return table;
  }

  /**
   * Crée une promotion + ses produits/boutiques via dbo.sp_CreatePromotion
   * (transaction unique SQL ; contrôle multi-tenant 52406/52407).
   * @param {Object} params
   * @param {number} params.companyId
   * @param {string} params.vcPromotionName
   * @param {string} params.discountTypeCode - 'PERCENTAGE' | 'FIXED_AMOUNT'
   * @param {number} params.dcDiscountValue
   * @param {string|Date} params.dtStartDate
   * @param {string|Date} params.dtEndDate
   * @param {number} params.createdByUserId
   * @param {Array<number>} [params.productIds=[]]
   * @param {Array<number>} [params.storeIds=[]]
   * @returns {Promise<Object>} { promotionId }
   */
  static async create({
    companyId, vcPromotionName, discountTypeCode, dcDiscountValue,
    dtStartDate, dtEndDate, createdByUserId, productIds = [], storeIds = []
  }) {
    if (!companyId) throw new Error('companyId est obligatoire.');
    if (!vcPromotionName || !vcPromotionName.trim()) throw new Error('vcPromotionName est obligatoire.');
    if (!(Number(dcDiscountValue) >= 0)) throw new Error('CK_Promotion_Value : dcDiscountValue >= 0.');
    if (new Date(dtEndDate) < new Date(dtStartDate)) throw new Error('CK_Promotion_Dates : fin >= début.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

    const dtype = await RefDAL.getByCode('discountType', discountTypeCode);
    if (!dtype) throw new Error(`Type de remise inconnu : ${discountTypeCode}`);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('vcPromotionName', sql.VarChar(50), vcPromotionName.trim())
        .input('discountTypeId', sql.Int, dtype.discountTypeId)
        .input('dcDiscountValue', sql.Decimal(18, 2), dcDiscountValue)
        .input('dtStartDate', sql.DateTime, new Date(dtStartDate))
        .input('dtEndDate', sql.DateTime, new Date(dtEndDate))
        .input('createdByUserId', sql.Int, createdByUserId)
        .input('productIds', PromotionDAL._buildProductIdsTable(productIds))
        .input('storeIds', PromotionDAL._buildStoreIdsTable(storeIds))
        .execute('dbo.sp_CreatePromotion');

      return result.recordset[0];
    } catch (err) {
      throw PromotionDAL._mapSqlError(err);
    }
  }

  /**
   * Promotions actives d'une boutique à une date via dbo.sp_GetActivePromotionsForStore.
   * @param {number} storeId
   * @param {string|Date} [atDate=new Date()]
   * @returns {Promise<Array>}
   */
  static async getActiveForStore(storeId, atDate = new Date()) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('atDate', sql.DateTime, new Date(atDate))
        .execute('dbo.sp_GetActivePromotionsForStore');

      return result.recordset;
    } catch (err) {
      throw PromotionDAL._mapSqlError(err);
    }
  }

  /** Produits couverts par une promotion via dbo.sp_GetPromotionProducts. */
  static async getProducts(promotionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('promotionId', sql.Int, promotionId)
        .execute('dbo.sp_GetPromotionProducts');

      return result.recordset;
    } catch (err) {
      throw PromotionDAL._mapSqlError(err);
    }
  }

  /**
   * Désactive les promotions dont la fin est dépassée
   * via dbo.sp_DisableExpiredPromotions.
   * @param {string|Date} [atDate=new Date()]
   * @returns {Promise<number>} Nombre de promotions désactivées.
   */
  static async disableExpired(atDate = new Date()) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('atDate', sql.DateTime, new Date(atDate))
        .execute('dbo.sp_DisableExpiredPromotions');

      const row = (result.recordset || [])[0] || {};
      return Number(row.rowsAffected || 0);
    } catch (err) {
      throw PromotionDAL._mapSqlError(err);
    }
  }

  /**
   * Applique une remise de péremption (lots expirant sous `days`) :
   * sélection des produits via dbo.sp_GetProductsForExpiryPromotion puis création
   * de la promotion via sp_CreatePromotion.
   * @param {Object} params
   * @param {number} params.companyId
   * @param {number} params.storeId
   * @param {number} params.days
   * @param {number} params.dcDiscountValue
   * @param {number} params.createdByUserId
   * @returns {Promise<Object>} { promotionId, nbProducts } — { promotionId: null,
   *   nbProducts: 0 } si aucun lot éligible.
   */
  static async applyExpiryPromo({ companyId, storeId, days, dcDiscountValue, createdByUserId }) {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + Number(days));

    let productIds;
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('limitDate', sql.Date, limitDate)
        .execute('dbo.sp_GetProductsForExpiryPromotion');
      productIds = result.recordset.map((r) => r.productId);
    } catch (err) {
      throw PromotionDAL._mapSqlError(err);
    }

    if (!productIds.length) return { promotionId: null, nbProducts: 0 };

    const promo = await PromotionDAL.create({
      companyId,
      vcPromotionName: `Péremption J+${days}`.slice(0, 50),
      discountTypeCode: 'PERCENTAGE',
      dcDiscountValue,
      dtStartDate: new Date(),
      dtEndDate: limitDate,
      createdByUserId,
      productIds,
      storeIds: [storeId],
    });
    return { ...promo, nbProducts: productIds.length };
  }
}

module.exports = PromotionDAL;