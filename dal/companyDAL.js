/**
 * @file companyDAL.js
 * @description DAL entreprise — ACCÈS EXCLUSIF via les objets du module
 * utils/company-module.sql. INTERDIT : tout SQL inline sur dbo.tblCompany
 * (contrôles, mises à jour COALESCE et soft delete sont délégués aux procédures).
 * Vues : vw_CompanyDetails, vw_UserCompanyAccess.
 * Procédures : sp_CreateCompany, sp_GetAllCompanies, sp_GetCompaniesByUserId,
 *   sp_GetCompanyById, sp_UpdateCompany, sp_SoftDeleteCompany.
 * Codes erreur métier : 53000 (vcCompanyCode), 53001 (vcCompanyName), 53002 (userId),
 *   53003 (companyId).
 * @module DAL/Company
 */

const { sql, poolPromise } = require('../config/db');

class CompanyDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 53000-53003).
   * @private
   */
  static _mapSqlError(err) {
    if (err && err.number >= 53000 && err.number <= 53003) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  /**
   * Crée une entreprise via dbo.sp_CreateCompany (contrôles 53000-53001,
   * trim SQL des codes).
   * @param {Object} data
   * @returns {Promise<Object>} { companyId, vcCompanyCode, vcCompanyName, vcRccm,
   *   vcPhoneNumber, vcEmail, vcAddress, vcCity, vcLogoUrl, btEnabled, dtCreatedAt }
   */
  static async create(data) {
    const {
      vcCompanyCode, vcCompanyName, vcRccm = null, vcPhoneNumber = null,
      vcEmail = null, vcAddress = null, vcCity = null, vcLogoUrl = null
    } = data;

    if (!vcCompanyCode || !vcCompanyCode.trim()) throw new Error('Le code entreprise (vcCompanyCode) est obligatoire.');
    if (!vcCompanyName || !vcCompanyName.trim()) throw new Error('Le nom entreprise (vcCompanyName) est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('vcCompanyCode', sql.VarChar(20), vcCompanyCode.trim())
        .input('vcCompanyName', sql.VarChar(50), vcCompanyName.trim())
        .input('vcRccm', sql.VarChar(50), vcRccm)
        .input('vcPhoneNumber', sql.VarChar(20), vcPhoneNumber)
        .input('vcEmail', sql.NVarChar(100), vcEmail)
        .input('vcAddress', sql.VarChar(150), vcAddress)
        .input('vcCity', sql.VarChar(50), vcCity)
        .input('vcLogoUrl', sql.VarChar(255), vcLogoUrl)
        .execute('dbo.sp_CreateCompany');

      return result.recordset[0];
    } catch (err) {
      throw CompanyDAL._mapSqlError(err);
    }
  }

  /** Liste toutes les entreprises actives via dbo.sp_GetAllCompanies. */
  static async getAll() {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .execute('dbo.sp_GetAllCompanies');

      return result.recordset;
    } catch (err) {
      throw CompanyDAL._mapSqlError(err);
    }
  }

  /**
   * Entreprises accessibles par un utilisateur via dbo.sp_GetCompaniesByUserId
   * (vw_UserCompanyAccess — conserve l'affectation globale SUPER_ADMIN companyId NULL).
   * @param {number} userId
   * @returns {Promise<Array>} { companyId, vcCompanyCode, vcCompanyName, vcCity,
   *   roleId, roleCode, roleName }
   */
  static async getByUserId(userId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('userId', sql.Int, userId)
        .execute('dbo.sp_GetCompaniesByUserId');

      return result.recordset;
    } catch (err) {
      throw CompanyDAL._mapSqlError(err);
    }
  }

  /**
   * Entreprise par ID (active ou non) via dbo.sp_GetCompanyById.
   * @param {number} companyId
   * @returns {Promise<Object|null>}
   */
  static async findById(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_GetCompanyById');

      return result.recordset[0] || null;
    } catch (err) {
      throw CompanyDAL._mapSqlError(err);
    }
  }

  /**
   * Mise à jour partielle (COALESCE identique) via dbo.sp_UpdateCompany.
   * @param {number} companyId
   * @param {Object} data
   * @returns {Promise<Object|null>} { companyId, vcCompanyCode, vcCompanyName, btEnabled }
   */
  static async update(companyId, data) {
    const { vcCompanyName, vcRccm, vcPhoneNumber, vcEmail, vcAddress, vcCity, vcLogoUrl, btEnabled } = data;

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('vcCompanyName', sql.VarChar(50), vcCompanyName)
        .input('vcRccm', sql.VarChar(50), vcRccm)
        .input('vcPhoneNumber', sql.VarChar(20), vcPhoneNumber)
        .input('vcEmail', sql.NVarChar(100), vcEmail)
        .input('vcAddress', sql.VarChar(150), vcAddress)
        .input('vcCity', sql.VarChar(50), vcCity)
        .input('vcLogoUrl', sql.VarChar(255), vcLogoUrl)
        .input('btEnabled', sql.Bit, btEnabled === undefined ? null : (btEnabled ? 1 : 0))
        .execute('dbo.sp_UpdateCompany');

      return result.recordset[0] || null;
    } catch (err) {
      throw CompanyDAL._mapSqlError(err);
    }
  }

  /**
   * Soft delete (btEnabled = 0) via dbo.sp_SoftDeleteCompany.
   * @returns {Promise<boolean>} true si une ligne a été désactivée.
   */
  static async softDelete(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_SoftDeleteCompany');

      return Number(result.recordset[0].rowsAffected) > 0;
    } catch (err) {
      throw CompanyDAL._mapSqlError(err);
    }
  }
}

module.exports = CompanyDAL;