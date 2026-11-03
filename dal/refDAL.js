/**
 * @file refDAL.js
 * @description DAL tables de référence — ACCÈS EXCLUSIF via les objets du module
 * utils/reference-module.sql. INTERDIT : tout SQL inline sur dbo.tblRef*.
 * La correspondance clé -> table vit UNIQUEMENT dans vw_ReferenceTableCatalog (SQL) :
 * le JS ne connaît que les clés logiques ('saleStatus', 'paymentMethod', ...),
 * jamais les noms de tables.
 * Vues : vw_ReferenceTableCatalog (liste blanche des clés + indicateur btEnabled).
 * Procédures : sp_GetAllReferences, sp_GetReferenceByCode.
 * @module DAL/Ref
 */

const { sql, poolPromise } = require('../config/db');

/**
 * Clés de référence autorisées (identiques aux clés de vw_ReferenceTableCatalog).
 * Sert uniquement à la validation JS et à listRefs() — sans nom de table.
 */
const REF_KEYS = [
  'role', 'gender', 'customerType', 'storeType', 'paymentMethod', 'paymentStatus',
  'saleStatus', 'discountType', 'cashSessionStatus', 'stockMovementType',
  'transferStatus', 'thirdPartyMovementType', 'adjustmentReason', 'adjustmentStatus',
  'cashReportStatus', 'purchaseStatus', 'inventoryStatus',
  'registrationRequestStatus', 'unitOfMeasure', 'treasuryAccountType',
  'treasuryMovementType', 'notificationType'
];

/** Lève l'erreur historique si la clé est inconnue (message inchangé). */
function assertRefKey(refKey) {
  if (!REF_KEYS.includes(refKey)) {
    throw new Error(`Référence inconnue : ${refKey}. Clés : ${REF_KEYS.join(', ')}`);
  }
}

class RefDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre le code 52200 du module références).
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
   * Lignes d'une référence via dbo.sp_GetAllReferences : filtre btEnabled appliqué
   * en SQL quand la colonne existe (détecté par vw_ReferenceTableCatalog).
   * @param {string} refKey
   * @returns {Promise<Array>} Lignes complètes (SELECT *).
   */
  static async getAll(refKey) {
    assertRefKey(refKey);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('refKey', sql.VarChar(50), refKey)
        .execute('dbo.sp_GetAllReferences');

      return result.recordset;
    } catch (err) {
      throw RefDAL._mapSqlError(err);
    }
  }

  /**
   * Première ligne correspondant exactement à vcCode via dbo.sp_GetReferenceByCode
   * (retourne la ligne même inactive ; null si le code est vide ou introuvable).
   * @param {string} refKey
   * @param {string} vcCode
   * @returns {Promise<Object|null>} Ligne complète (SELECT *).
   */
  static async getByCode(refKey, vcCode) {
    if (!vcCode) return null;
    assertRefKey(refKey);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('refKey', sql.VarChar(50), refKey)
        .input('vcCode', sql.VarChar(50), String(vcCode).trim())
        .execute('dbo.usp_GetReferenceByCode');

      return result.recordset[0] || null;
    } catch (err) {
      throw RefDAL._mapSqlError(err);
    }
  }

  /** Liste des clés de référence disponibles. */
  static listRefs() {
    return [...REF_KEYS];
  }
}

module.exports = RefDAL;