/**
 * @file treasuryDAL.js
 * @description DAL trésorerie — ACCÈS EXCLUSIF via les objets du module
 * utils/treasury-module.sql. INTERDIT : tout SQL inline sur dbo.tblTreasuryAccount
 * et dbo.tblTreasuryMovement (calculs de solde et transactions sont délégués
 * aux procédures).
 * Vues : vw_TreasuryAccountDetails, vw_TreasuryMovementDetails.
 * Procédures : usp_CreateTreasuryAccount, usp_GetTreasuryAccounts,
 *   usp_RecordTreasuryMovement, usp_GetTreasuryMovements.
 * Direction des mouvements issue de tblRefTreasuryMovementType (1 = entrée, -1 = sortie),
 * appliquée en SQL par usp_RecordTreasuryMovement.
 * @module DAL/Treasury
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class TreasuryDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre les codes 51300-51309 du module trésorerie).
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
   * Crée un compte de trésorerie via dbo.usp_CreateTreasuryAccount
   * (contrôles 51300-51303 ; le type est re-validé par la SP : 51301).
   * @param {Object} data
   * @param {number} data.companyId
   * @param {number|null} [data.storeId]
   * @param {string} data.treasuryAccountTypeCode
   * @param {string} data.vcAccountName
   * @param {number} [data.mCurrentBalance=0]
   * @returns {Promise<Object>} { treasuryAccountId, companyId, storeId, vcAccountName, mCurrentBalance }
   */
  static async createAccount(data) {
    const {
      companyId, storeId = null, treasuryAccountTypeCode,
      vcAccountName, mCurrentBalance = 0
    } = data;

    // Assurez-vous que RefDAL utilise aussi usp_GetReferenceByCode !
    const type = await RefDAL.getByCode('treasuryAccountType', treasuryAccountTypeCode);
    if (!type) throw new Error(`Type de compte inconnu : ${treasuryAccountTypeCode}`);
    if (!vcAccountName || !vcAccountName.trim()) throw new Error('vcAccountName est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('storeId', sql.Int, storeId)
        .input('treasuryAccountTypeId', sql.Int, type.treasuryAccountTypeId)
        .input('vcAccountName', sql.VarChar(50), vcAccountName.trim())
        .input('mCurrentBalance', sql.Money, mCurrentBalance)
        .execute('dbo.usp_CreateTreasuryAccount'); // <-- MODIFIÉ ICI

      return result.recordset[0];
    } catch (err) {
      throw TreasuryDAL._mapSqlError(err);
    }
  }

  /**
   * Comptes de trésorerie d'une entreprise via dbo.usp_GetTreasuryAccounts
   * (vw_TreasuryAccountDetails ; comptes désactivés inclus, comme précédemment).
   * @param {number} companyId
   * @returns {Promise<Array>}
   */
  static async getAccounts(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.usp_GetTreasuryAccounts'); // <-- MODIFIÉ ICI

      return result.recordset;
    } catch (err) {
      throw TreasuryDAL._mapSqlError(err);
    }
  }

  /**
   * Enregistre un mouvement de trésorerie via dbo.usp_RecordTreasuryMovement :
   * la procédure, dans sa propre transaction, verrouille le compte (51309),
   * applique la direction du type de mouvement (51305), insère le mouvement
   * avec solde avant/après puis met à jour le compte — atomique en SQL.
   * @param {Object} data
   * @param {number} data.treasuryAccountId
   * @param {string} data.typeCode - Code du type de mouvement.
   * @param {number} data.mAmount - Montant strictement positif (> 0).
   * @param {number|null} [data.cashReportId]
   * @param {string} data.vcDescription
   * @param {number} data.operatedByUserId
   * @returns {Promise<Object>} { treasuryMovementId, mBalanceAfter }
   */
  static async recordMovement(data) {
    const {
      treasuryAccountId, typeCode, mAmount, cashReportId = null,
      vcDescription, operatedByUserId
    } = data;

    if (!mAmount || mAmount <= 0) throw new Error('CK_TreasuryMovement_Amount : mAmount > 0 requis.');
    if (!vcDescription || !vcDescription.trim()) throw new Error('vcDescription est obligatoire (NOT NULL).');
    if (!operatedByUserId) throw new Error('OperatedByUserId est obligatoire (NOT NULL).');

    const type = await RefDAL.getByCode('treasuryMovementType', typeCode);
    if (!type) throw new Error(`Type de mouvement inconnu : ${typeCode}`);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('treasuryAccountId', sql.Int, treasuryAccountId)
        .input('treasuryMovementTypeId', sql.Int, type.treasuryMovementTypeId)
        .input('cashReportId', sql.Int, cashReportId)
        .input('mAmount', sql.Money, mAmount)
        .input('vcDescription', sql.VarChar(150), vcDescription.trim())
        .input('OperatedByUserId', sql.Int, operatedByUserId)
        .execute('dbo.usp_RecordTreasuryMovement'); // <-- MODIFIÉ ICI

      return result.recordset[0];
    } catch (err) {
      throw TreasuryDAL._mapSqlError(err);
    }
  }

  /**
   * Historique des mouvements d'un compte via dbo.usp_GetTreasuryMovements
   * (vw_TreasuryMovementDetails ; @limit borné à 1000 par la procédure).
   * @param {number} treasuryAccountId
   * @param {Object} [options]
   * @param {number} [options.limit=100]
   * @returns {Promise<Array>}
   */
  static async getMovements(treasuryAccountId, { limit = 100 } = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('treasuryAccountId', sql.Int, treasuryAccountId)
        .input('limit', sql.Int, limit)
        .execute('dbo.usp_GetTreasuryMovements'); // <-- MODIFIÉ ICI

      return result.recordset;
    } catch (err) {
      throw TreasuryDAL._mapSqlError(err);
    }
  }
}

module.exports = TreasuryDAL;