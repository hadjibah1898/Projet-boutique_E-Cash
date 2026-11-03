/**
 * @file productDAL.js
 * @description DAL produits.
 * @module DAL/Product
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class ProductDAL {
  static _mapSqlError(err) {
    if (err && err.number >= 52500 && err.number <= 52599) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  static async createCategory(data) {
    const { companyId, vcCategoryCode, vcCategoryName, vcDescription = null } = data;

    if (!companyId) throw new Error('companyId est obligatoire.');
    if (!vcCategoryCode || !vcCategoryCode.trim()) throw new Error('vcCategoryCode est obligatoire.');
    if (!vcCategoryName || !vcCategoryName.trim()) throw new Error('vcCategoryName est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('vcCategoryCode', sql.VarChar(20), vcCategoryCode.trim())
        .input('vcCategoryName', sql.VarChar(50), vcCategoryName.trim())
        .input('vcDescription', sql.NVarChar(150), vcDescription)
        .execute('dbo.sp_CreateProductCategory');

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async listCategories(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_GetProductCategoriesByCompany');

      return result.recordset;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async create(data) {
    const {
      companyId, productCategoryId = null, unitOfMeasureCode = null,
      vcProductCode, vcProductName, vcDescription = null,
      vcBarcode = null, vcImageUrl = null,
      dcDefaultAlertThreshold = 0, createdByUserId
    } = data;

    if (!companyId) throw new Error('companyId est obligatoire.');
    if (!vcProductCode || !vcProductCode.trim()) throw new Error('vcProductCode est obligatoire.');
    if (!vcProductName || !vcProductName.trim()) throw new Error('vcProductName est obligatoire.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

    let unitOfMeasureId = null;
    if (unitOfMeasureCode) {
      const uom = await RefDAL.getByCode('unitOfMeasure', unitOfMeasureCode);
      if (!uom) throw new Error(`Unité de mesure inconnue : ${unitOfMeasureCode}`);
      unitOfMeasureId = uom.unitOfMeasureId;
    }

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('productCategoryId', sql.Int, productCategoryId || null) 
        .input('unitOfMeasureId', sql.Int, unitOfMeasureId)
        .input('vcProductCode', sql.VarChar(20), vcProductCode.trim())
        .input('vcProductName', sql.VarChar(50), vcProductName.trim())
        .input('vcDescription', sql.VarChar(150), vcDescription)
        .input('vcBarcode', sql.VarChar(100), vcBarcode ? vcBarcode.trim() : null)
        .input('vcImageUrl', sql.VarChar(sql.MAX), vcImageUrl)
        .input('dcDefaultAlertThreshold', sql.Decimal(18, 3), dcDefaultAlertThreshold)
        .input('createdByUserId', sql.Int, createdByUserId)
        .execute('dbo.sp_CreateProduct');

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async createStockLot(data) {
    const { storeId, productId, vcLotNumber, dcInitialQuantity, mUnitPurchasePrice, dtExpirationAt } = data;
    
    if (!storeId) throw new Error('storeId est obligatoire.');
    if (!productId) throw new Error('productId est obligatoire.');
    if (mUnitPurchasePrice === undefined || mUnitPurchasePrice < 0) throw new Error('mUnitPurchasePrice doit être >= 0.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .input('vcLotNumber', sql.VarChar(30), vcLotNumber || `LOT-${Date.now()}`)
        .input('dcInitialQuantity', sql.Decimal(18, 3), dcInitialQuantity)
        .input('dcRemainingQuantity', sql.Decimal(18, 3), dcInitialQuantity)
        .input('mUnitPurchasePrice', sql.Money, mUnitPurchasePrice)
        .input('dtReceivedAt', sql.DateTime, new Date())
        .input('btEnabled', sql.Bit, 1)
        .input('dtExpirationAt', sql.DateTime, dtExpirationAt || null) 
        .execute('dbo.sp_CreateStockLot');

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async getArticlesWithDetails(storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetArticlesWithDetails');
      return result.recordset;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async getByCompanyId(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_GetProductsByCompany');

      return result.recordset;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async findById(productId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('productId', sql.BigInt, productId)
        .execute('dbo.sp_GetProductById');

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async findByBarcode(companyId, vcBarcode) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('vcBarcode', sql.VarChar(100), vcBarcode)
        .execute('dbo.sp_FindProductByBarcode');

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async findByBarcodeForStore(storeId, vcBarcode) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('vcBarcode', sql.VarChar(100), vcBarcode)
        .execute('dbo.sp_FindStoreProductByBarcode');

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async searchForStore(storeId, q, limit = 50) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('q', sql.VarChar(100), String(q ?? '').trim())
        .input('limit', sql.Int, limit)
        .execute('dbo.sp_SearchStoreProducts');

      return result.recordset;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async getStoreProductForSale(storeId, productId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .execute('dbo.sp_GetStoreProductForSale');

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async getSaleCatalog(storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetSaleCatalogByStore');

      return result.recordset;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async addStoreProduct(data) {
    const { storeId, productId, mCurrentSalePrice, mPurchasePrice = 0, alertThreshold = null, createdByUserId } = data;

    if (mCurrentSalePrice === undefined || mCurrentSalePrice < 0) {
      throw new Error('mCurrentSalePrice est obligatoire et doit être >= 0.');
    }
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .input('mCurrentSalePrice', sql.Money, mCurrentSalePrice)
        .input('mPurchasePrice', sql.Money, mPurchasePrice)
        .input('alertThreshold', sql.Int, alertThreshold)
        .input('createdByUserId', sql.Int, createdByUserId)
        .execute('dbo.sp_AddStoreProduct');

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async updateStorePrice(data) {
    const { storeId, productId, mCurrentSalePrice, mPurchasePrice, alertThreshold, createdByUserId } = data;

    if (mCurrentSalePrice === undefined || mCurrentSalePrice < 0) {
      throw new Error('mCurrentSalePrice est obligatoire et doit être >= 0.');
    }
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .input('mCurrentSalePrice', sql.Money, mCurrentSalePrice)
        .input('mPurchasePrice', sql.Money, mPurchasePrice)
        .input('alertThreshold', sql.Int, alertThreshold)
        .input('createdByUserId', sql.Int, createdByUserId)
        .execute('dbo.sp_UpdateStorePrice');

      return result;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  // 🟢 CORRECTION ICI : Appel de la procédure stockée au lieu de SQL inline
  static async updatePromotions(data) {
    const { storeId, productId, mPromoRate, btPromoActive, dtPromoStart, dtPromoEnd, mExceptionDiscount } = data;
    try {
      const pool = await poolPromise;
      await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .input('mPromoRate', sql.Decimal(5, 2), mPromoRate)
        .input('btPromoActive', sql.Bit, btPromoActive)
        .input('dtPromoStart', sql.DateTime, dtPromoStart)
        .input('dtPromoEnd', sql.DateTime, dtPromoEnd)
        .input('mExceptionDiscount', sql.Decimal(5, 2), mExceptionDiscount)
        .execute('dbo.sp_UpdatePromotions');
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async getStoreProducts(productId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('productId', sql.BigInt, productId)
        .execute('dbo.sp_GetStoreProductsByProduct');

      return result.recordset;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async update(productId, data) {
    const { vcProductName, vcDescription, vcBarcode, vcImageUrl, dcDefaultAlertThreshold, productCategoryId } = data;

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('productId', sql.BigInt, productId)
        .input('vcProductName', sql.VarChar(50), vcProductName)
        .input('vcDescription', sql.VarChar(150), vcDescription)
        .input('vcBarcode', sql.VarChar(100), vcBarcode)
        .input('vcImageUrl', sql.VarChar(sql.MAX), vcImageUrl)
        .input('dcDefaultAlertThreshold', sql.Decimal(18, 3), dcDefaultAlertThreshold)
        .input('productCategoryId', sql.Int, productCategoryId)
        .execute('dbo.sp_UpdateProduct');

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async softDelete(productId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('productId', sql.BigInt, productId)
        .execute('dbo.sp_SoftDeleteProduct');

      if (result.recordset && result.recordset.length > 0) {
        return Number(result.recordset[0].rowsAffected) > 0;
      }
      return false;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async getLotExpiries(storeId = null) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetProductLotExpiries');

      return result.recordset;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async getByStore(storeId, onlyValidated = true) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('onlyValidated', sql.Bit, onlyValidated ? 1 : 0)
        .execute('dbo.sp_GetStoreProducts'); 

      return result.recordset;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  static async validateProduct(storeId, productId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .execute('dbo.sp_ValidateStoreProduct'); 

      return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (err) {
      throw ProductDAL._mapSqlError(err);
    }
  }

  // 🟢 CORRECTION ICI : Appel de la procédure stockée au lieu de SQL inline
  static async addPriceHistory(data) {
    const { storeId, productId, mPurchasePrice, mSalePrice, createdByUserId } = data;
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('productId', sql.BigInt, productId)
        .input('mPurchasePrice', sql.Money, mPurchasePrice || 0)
        .input('mSalePrice', sql.Money, mSalePrice || 0)
        .input('createdByUserId', sql.Int, createdByUserId)
        .execute('dbo.sp_AddPriceHistory');
      return result;
    } catch (err) {
      console.error("Erreur SQL addPriceHistory:", err);
      throw ProductDAL._mapSqlError(err);
    }
  }
}

module.exports = ProductDAL;