/**
 * @file supplierDAL.js
 * @description Couche d'accès aux données pour les fournisseurs.
 * @module DAL/Supplier
 * 
 */


const { sql, poolPromise } = require('../config/db');

class SupplierDAL {
  /**
   * Formate les erreurs SQL métier.
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
   * Crée un fournisseur via sp_CreateSupplier.
   * La génération du vcSupplierCode est gérée directement par SQL Server.
   */
  static async create(data) {
    const { 
      companyId, vcSupplierCode, vcLastName, vcFirstName, vcBusinessName, 
      vcPhoneNumber, vcEmail, vcAddress, vcCity, createdByUserId 
    } = data;

    if (!companyId) throw new Error('companyId est obligatoire.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('vcSupplierCode', sql.VarChar(20), vcSupplierCode || null) // SQL gère le null
        .input('vcLastName', sql.VarChar(50), vcLastName)
        .input('vcFirstName', sql.VarChar(50), vcFirstName)
        .input('vcBusinessName', sql.VarChar(50), vcBusinessName)
        .input('vcPhoneNumber', sql.VarChar(20), vcPhoneNumber)
        .input('vcEmail', sql.VarChar(100), vcEmail)
        .input('vcAddress', sql.VarChar(150), vcAddress)
        .input('vcCity', sql.VarChar(50), vcCity)
        .input('createdByUserId', sql.Int, createdByUserId)
        .execute('dbo.sp_CreateSupplier');

      return result.recordset[0];
    } catch (err) {
      throw SupplierDAL._mapSqlError(err);
    }
  }

  /**
   * Liste les fournisseurs d'une entreprise via sp_GetSuppliersByCompany.
   */
  static async getByCompanyId(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_GetSuppliersByCompany');

      return result.recordset;
    } catch (err) {
      throw SupplierDAL._mapSqlError(err);
    }
  }

  /**
   * Récupère un fournisseur par son ID via sp_GetSupplierById.
   */
  static async findById(supplierId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('supplierId', sql.Int, supplierId)
        .execute('dbo.sp_GetSupplierById');

      return result.recordset[0] || null;
    } catch (err) {
      throw SupplierDAL._mapSqlError(err);
    }
  }

  /**
   * Met à jour un fournisseur via sp_UpdateSupplier.
   */
  static async update(supplierId, data) {
    const { vcLastName, vcFirstName, vcBusinessName, vcPhoneNumber, vcEmail, vcAddress, vcCity } = data;

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('supplierId', sql.Int, supplierId)
        .input('vcLastName', sql.VarChar(50), vcLastName)
        .input('vcFirstName', sql.VarChar(50), vcFirstName)
        .input('vcBusinessName', sql.VarChar(50), vcBusinessName)
        .input('vcPhoneNumber', sql.VarChar(20), vcPhoneNumber)
        .input('vcEmail', sql.VarChar(100), vcEmail)
        .input('vcAddress', sql.VarChar(150), vcAddress)
        .input('vcCity', sql.VarChar(50), vcCity)
        .execute('dbo.sp_UpdateSupplier');

      return result.recordset[0] || null;
    } catch (err) {
      throw SupplierDAL._mapSqlError(err);
    }
  }

  /**
   * Désactive un fournisseur (suppression logique) via sp_SoftDeleteSupplier.
   */
  static async softDelete(supplierId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('supplierId', sql.Int, supplierId)
        .execute('dbo.sp_SoftDeleteSupplier');

      return Number(result.recordset[0]?.rowsAffected) > 0;
    } catch (err) {
      throw SupplierDAL._mapSqlError(err);
    }
  }

  /**
   * Associe un produit à un fournisseur via sp_AddSupplierProduct.
   */
  static async addProduct(data) {
    const { supplierId, productId, vcSupplierReference, mReferencePurchasePrice, deliveryLeadTimeDays, IsPreferred } = data;

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('supplierId', sql.Int, supplierId)
        .input('productId', sql.BigInt, productId)
        .input('vcSupplierReference', sql.VarChar(50), vcSupplierReference)
        .input('mReferencePurchasePrice', sql.Money, mReferencePurchasePrice)
        .input('deliveryLeadTimeDays', sql.Int, deliveryLeadTimeDays)
        .input('IsPreferred', sql.Bit, IsPreferred ? 1 : 0)
        .execute('dbo.sp_AddSupplierProduct');

      return result.recordset[0];
    } catch (err) {
      throw SupplierDAL._mapSqlError(err);
    }
  }

  /**
   * Liste les produits associés à un fournisseur via sp_GetSupplierProducts.
   */
  static async getProducts(supplierId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('supplierId', sql.Int, supplierId)
        .execute('dbo.sp_GetSupplierProducts');

      return result.recordset;
    } catch (err) {
      throw SupplierDAL._mapSqlError(err);
    }
  }
}

module.exports = SupplierDAL;