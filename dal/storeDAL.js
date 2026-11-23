
/**
 * @file storeDAL.js
 * @description DAL boutique — ACCÈS EXCLUSIF via les procédures stockées
 * du module utils/store-module.sql.
 * INTERDIT : SQL inline sur dbo.tblStore.
 *
 * Vues : vw_StoreDetails.
 * Procédures :
 *   sp_CreateStore,
 *   sp_GetStoresByCompany,
 *   sp_GetStoreById,
 *   sp_UpdateStore.
 *
 * La désactivation et la réactivation utilisent exclusivement
 * sp_UpdateStore et ne suppriment aucune donnée.
 *
 * @module DAL/Store
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class StoreDAL {

  /**
   * Formate les erreurs SQL métier.
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
   * Créer une boutique.
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

    if (!companyId) {
      throw new Error('companyId est obligatoire.');
    }

    if (!vcStoreCode?.trim()) {
      throw new Error('Le code boutique (vcStoreCode) est obligatoire.');
    }

    if (!vcStoreName?.trim()) {
      throw new Error('Le nom boutique (vcStoreName) est obligatoire.');
    }

    if (!createdByUserId) {
      throw new Error('createdByUserId est obligatoire.');
    }

    const storeType = await RefDAL.getByCode('storeType', storeTypeCode);

    if (!storeType) {
      throw new Error(`Type de boutique inconnu : ${storeTypeCode}`);
    }

    const storeTypeId = storeType.storeTypeId || storeType.refId;

    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('companyId', sql.Int, Number(companyId))
        .input('storeTypeId', sql.Int, Number(storeTypeId))
        .input('vcStoreCode', sql.VarChar(20), vcStoreCode.trim())
        .input('vcStoreName', sql.VarChar(50), vcStoreName.trim())
        .input('vcAddress', sql.VarChar(150), vcAddress)
        .input('vcCity', sql.VarChar(50), vcCity)
        .input('vcPhoneNumber', sql.VarChar(20), vcPhoneNumber)
        .input('dcLatitude', sql.Decimal(9, 6), dcLatitude)
        .input('dcLongitude', sql.Decimal(9, 6), dcLongitude)
        .input('createdByUserId', sql.Int, Number(createdByUserId))
        .execute('dbo.sp_CreateStore');

      return result.recordset[0];

    } catch (err) {
      throw StoreDAL._mapSqlError(err);
    }
  }

  /**
   * Récupérer les boutiques d'une entreprise.
   */
  static async getByCompanyId(companyId, onlyActive = false) {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('companyId', sql.Int, Number(companyId))
      .input('onlyActive', sql.Bit, onlyActive ? 1 : 0)
      .execute('dbo.sp_GetStoresByCompany');

    return result.recordset;

  } catch (err) {
    throw StoreDAL._mapSqlError(err);
  }
}

  /**
   * Lister les boutiques via la procédure de compatibilité.
   */
 
/**
 * Lister les boutiques.
 * Par défaut : boutiques actives et désactivées.
 */
static async listAll(companyId = null, onlyActive = false) {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input(
        'companyId',
        sql.Int,
        companyId ? Number(companyId) : null
      )
      .input(
        'onlyActive',
        sql.Bit,
        onlyActive ? 1 : 0
      )
      .execute('dbo.usp_ListStores');

    return result.recordset || [];

  } catch (err) {
    throw StoreDAL._mapSqlError(err);
  }
}


  /**
   * Récupérer une boutique par son identifiant et son entreprise.
   */
  static async findById(storeId, companyId) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('storeId', sql.Int, Number(storeId))
        .input(
          'companyId',
          sql.Int,
          companyId ? Number(companyId) : null
        )
        .execute('dbo.sp_GetStoreById');

      return result.recordset[0] || null;

    } catch (err) {
      throw StoreDAL._mapSqlError(err);
    }
  }

  /**
   * Mise à jour partielle d'une boutique.
   *
   * Les indicateurs @set* permettent de modifier uniquement
   * les champs transmis.
   */
  static async update(storeId, data, companyId) {
    if (!Number.isInteger(Number(storeId)) || Number(storeId) <= 0) {
      throw new Error('storeId invalide.');
    }

    if (!Number.isInteger(Number(companyId)) || Number(companyId) <= 0) {
      throw new Error('companyId est obligatoire et doit être positif.');
    }

    const fieldMappings = [
      {
        key: 'vcStoreName',
        type: sql.VarChar(50),
        flag: 'setVcStoreName'
      },
      {
        key: 'vcAddress',
        type: sql.VarChar(150),
        flag: 'setVcAddress'
      },
      {
        key: 'vcCity',
        type: sql.VarChar(50),
        flag: 'setVcCity'
      },
      {
        key: 'vcPhoneNumber',
        type: sql.VarChar(20),
        flag: 'setVcPhoneNumber'
      },
      {
        key: 'dcLatitude',
        type: sql.Decimal(9, 6),
        flag: 'setDcLatitude'
      },
      {
        key: 'dcLongitude',
        type: sql.Decimal(9, 6),
        flag: 'setDcLongitude'
      },
      {
        key: 'btEnabled',
        type: sql.Bit,
        flag: 'setBtEnabled'
      }
    ];

    const provided = fieldMappings.filter(field =>
      Object.prototype.hasOwnProperty.call(data, field.key)
    );

    if (provided.length === 0) {
      return this.findById(storeId, companyId);
    }

    // Validation du statut lorsqu'il est transmis.
    if (Object.prototype.hasOwnProperty.call(data, 'btEnabled')) {
      const status = data.btEnabled;

      if (![0, 1, true, false].includes(status)) {
        throw new Error('btEnabled doit être égal à 0 ou 1.');
      }

      data = {
        ...data,
        btEnabled: status === true || status === 1 ? 1 : 0
      };
    }

    try {
      const pool = await poolPromise;

      const request = pool.request()
        .input('storeId', sql.Int, Number(storeId))
        .input('companyId', sql.Int, Number(companyId));

      for (const field of fieldMappings) {
        const isProvided = provided.includes(field);

        request.input(
          field.key,
          field.type,
          isProvided ? data[field.key] : null
        );

        request.input(
          field.flag,
          sql.Bit,
          isProvided ? 1 : 0
        );
      }

      const result = await request.execute('dbo.sp_UpdateStore');

      return result.recordset?.[0] || null;

    } catch (err) {
      throw StoreDAL._mapSqlError(err);
    }
  }

  /**
   * Désactivation logique.
   * Modifie uniquement btEnabled = 0.
   * Aucune suppression de données.
   */
  static async deactivate(storeId, companyId) {
    return this.update(
      storeId,
      { btEnabled: 0 },
      companyId
    );
  }

  /**
   * Réactivation logique.
   * Modifie uniquement btEnabled = 1.
   * Aucune suppression de données.
   */
  static async activate(storeId, companyId) {
    return this.update(
      storeId,
      { btEnabled: 1 },
      companyId
    );
  }

}

module.exports = StoreDAL;
