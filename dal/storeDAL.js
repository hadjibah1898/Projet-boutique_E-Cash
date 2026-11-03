/**
 * @file storeDAL.js
 * @description DAL boutique — ACCÈS EXCLUSIF via les objets du module
 * utils/store-module.sql. INTERDIT : tout SQL inline sur dbo.tblStore
 * (aucune requête dynamique, les mises à jour partielles sont gérées par les
 * indicateurs @set* de sp_UpdateStore).
 * Vues : vw_StoreDetails.
 * Procédures : sp_CreateStore, sp_GetStoresByCompany, sp_GetStoreById,
 *   sp_UpdateStore, sp_SoftDeleteStore.
 * @module DAL/Store
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class StoreDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre les codes 51700-51705 du module boutiques).
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
   * Crée une boutique ou un entrepôt via dbo.sp_CreateStore
   * (unicité UQ_Store_Company_StoreCode gérée par la contrainte).
   * @param {Object} data
   * @param {number} data.companyId
   * @param {string} [data.storeTypeCode='STORE']
   * @param {string} data.vcStoreCode
   * @param {string} data.vcStoreName
   * @param {number} data.createdByUserId
   * @returns {Promise<Object>} Ligne créée (storeId, codes, coordonnées, btEnabled, dtCreatedAt).
   */
  static async create(data) {
    const {
      companyId,
      storeTypeCode = 'STORE',
      vcStoreCode,
      vcStoreName,
      vcAddress = null,
      vcCity = null,
      vcPhoneNumber = null,
      dcLatitude = null,
      dcLongitude = null,
      createdByUserId
    } = data;

    if (!companyId) throw new Error('companyId est obligatoire.');
    if (!vcStoreCode?.trim()) throw new Error('Le code boutique (vcStoreCode) est obligatoire.');
    if (!vcStoreName?.trim()) throw new Error('Le nom boutique (vcStoreName) est obligatoire.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

    const storeType = await RefDAL.getByCode('storeType', storeTypeCode);
    if (!storeType) throw new Error(`Type de boutique inconnu : ${storeTypeCode}`);

    const storeTypeId = storeType.storeTypeId || storeType.refId;

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('storeTypeId', sql.Int, storeTypeId)
        .input('vcStoreCode', sql.VarChar(20), vcStoreCode.trim())
        .input('vcStoreName', sql.VarChar(50), vcStoreName.trim())
        .input('vcAddress', sql.VarChar(150), vcAddress)
        .input('vcCity', sql.VarChar(50), vcCity)
        .input('vcPhoneNumber', sql.VarChar(20), vcPhoneNumber)
        .input('dcLatitude', sql.Decimal(9, 6), dcLatitude)
        .input('dcLongitude', sql.Decimal(9, 6), dcLongitude)
        .input('createdByUserId', sql.Int, createdByUserId)
        .execute('dbo.sp_CreateStore');

      return result.recordset[0];
    } catch (err) {
      throw StoreDAL._mapSqlError(err);
    }
  }

  /**
   * Boutiques d'une entreprise via dbo.sp_GetStoresByCompany
   * (filtre actif optionnel transmis en paramètre, plus de requête dynamique).
   * @param {number} companyId
   * @param {boolean} [onlyActive=true] - Filtre sur les magasins actifs uniquement.
   * @returns {Promise<Array>}
   */
  static async getByCompanyId(companyId, onlyActive = true) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('onlyActive', sql.Bit, onlyActive ? 1 : 0)
        .execute('dbo.sp_GetStoresByCompany');

      return result.recordset;
    } catch (err) {
      throw StoreDAL._mapSqlError(err);
    }
  }

  /**
   * Toutes les boutiques actives (ou d'une entreprise) via
   * dbo.usp_ListStores — utilisé par la route de compatibilité /api/boutiques.
   * @param {number|null} [companyId=null] - Filtre optionnel par entreprise.
   * @returns {Promise<Array>}
   */
  static async listAll(companyId = null) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.usp_ListStores');

      return result.recordset;
    } catch (err) {
      throw StoreDAL._mapSqlError(err);
    }
  }

  /**
   * Détails d'une boutique via dbo.sp_GetStoreById (vw_StoreDetails : sur-ensemble
   * ajoutant storeTypeCode, vcCompanyCode/Name, createdByUserId).
   * @param {number} storeId
   * @returns {Promise<Object|null>}
   */
  static async findById(storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetStoreById');

      return result.recordset[0] || null;
    } catch (err) {
      throw StoreDAL._mapSqlError(err);
    }
  }

  /**
   * Mise à jour partielle via dbo.sp_UpdateStore : chaque champ présent dans `data`
   * active son indicateur @set* (permet la mise à NULL explicite et évite d'écraser
   * les données absentes).
   * @param {number} storeId
   * @param {Object} data - Champs à mettre à jour (vcStoreName, vcAddress, vcCity,
   *   vcPhoneNumber, dcLatitude, dcLongitude, btEnabled).
   * @returns {Promise<Object|null>} { storeId, vcStoreName, btEnabled, dtLastUpdated }
   */
  static async update(storeId, data) {
    const fieldMappings = [
      { key: 'vcStoreName', type: sql.VarChar(50), flag: 'setVcStoreName' },
      { key: 'vcAddress', type: sql.VarChar(150), flag: 'setVcAddress' },
      { key: 'vcCity', type: sql.VarChar(50), flag: 'setVcCity' },
      { key: 'vcPhoneNumber', type: sql.VarChar(20), flag: 'setVcPhoneNumber' },
      { key: 'dcLatitude', type: sql.Decimal(9, 6), flag: 'setDcLatitude' },
      { key: 'dcLongitude', type: sql.Decimal(9, 6), flag: 'setDcLongitude' },
      { key: 'btEnabled', type: sql.Bit, flag: 'setBtEnabled' }
    ];

    const provided = fieldMappings.filter((f) =>
      Object.prototype.hasOwnProperty.call(data, f.key)
    );
    if (provided.length === 0) {
      return this.findById(storeId);
    }

    try {
      const pool = await poolPromise;
      const req = pool.request().input('storeId', sql.Int, storeId);
      for (const field of fieldMappings) {
        const isProvided = provided.includes(field);
        req.input(field.key, field.type, isProvided ? data[field.key] : null);
        req.input(field.flag, sql.Bit, isProvided ? 1 : 0);
      }

      const result = await req.execute('dbo.sp_UpdateStore');
      return result.recordset[0] || null;
    } catch (err) {
      throw StoreDAL._mapSqlError(err);
    }
  }

  /**
   * Désactivation logique d'une boutique active via dbo.sp_SoftDeleteStore.
   * @param {number} storeId
   * @returns {Promise<boolean>} true si la désactivation a eu lieu.
   */
  static async softDelete(storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_SoftDeleteStore');

      const row = (result.recordset || [])[0] || {};
      return Number(row.rowsAffected || 0) > 0;
    } catch (err) {
      throw StoreDAL._mapSqlError(err);
    }
  }
}

module.exports = StoreDAL;