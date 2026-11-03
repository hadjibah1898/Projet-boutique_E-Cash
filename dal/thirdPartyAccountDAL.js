/**
 * @file thirdPartyAccountDAL.js
 * @description DAL comptes tiers — ACCÈS EXCLUSIF via les objets du module
 * utils/third-party-account-module.sql. INTERDIT : tout SQL inline sur
 * dbo.tblThirdPartyAccount et dbo.tblThirdPartyAccountMovement (verrous,
 * solde et mouvements sont délégués aux procédures).
 * Vues : vw_ThirdPartyAccountDetails, vw_ThirdPartyAccountMovementDetails.
 * Procédures : sp_GetOrCreateThirdPartyAccount, sp_GetThirdPartyAccountByCustomer,
 *   sp_RecordThirdPartyAccountMovement, sp_GetSessionDebtsGranted.
 * Codes erreur métier : 51400 (companyId), 51401 (XOR), 51402 (client),
 *   51403 (fournisseur), 51404 (customerId), 51405 (compte), 51406 (type),
 *   51407 (montant), 51408 (utilisateur).
 * @module DAL/ThirdPartyAccount
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class ThirdPartyAccountDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 51400-51408).
   * @private
   */
  static _mapSqlError(err) {
    if (err && err.number >= 51400 && err.number <= 51408) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  /**
   * Crée (ou retourne) le compte tiers d'un client ou fournisseur via
   * dbo.sp_GetOrCreateThirdPartyAccount : verrous UPDLOCK/HOLDLOCK contre les
   * doublons concurrents, contrôle du rattachement entreprise (51402/51403).
   * CK_ThirdPartyAccount_OneThirdParty : customerId XOR supplierId (contrôle JS
   * pour message immédiat, re-validé par la SP : 51401).
   * @param {Object} params
   * @param {number} params.companyId
   * @param {number|null} [params.customerId]
   * @param {number|null} [params.supplierId]
   * @returns {Promise<Object>} { thirdPartyAccountId, companyId, customerId,
   *   supplierId, dcCurrentBalance }
   */
  static async getOrCreate({ companyId, customerId = null, supplierId = null }) {
    if (!customerId && !supplierId) {
      throw new Error('CK_ThirdPartyAccount_OneThirdParty : customerId OU supplierId requis.');
    }
    if (customerId && supplierId) {
      throw new Error('CK_ThirdPartyAccount_OneThirdParty : customerId et supplierId sont mutuellement exclusifs.');
    }

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('customerId', sql.Int, customerId)
        .input('supplierId', sql.Int, supplierId)
        .execute('dbo.sp_GetOrCreateThirdPartyAccount');

      return result.recordset[0];
    } catch (err) {
      throw ThirdPartyAccountDAL._mapSqlError(err);
    }
  }

  /**
   * Applique un mouvement au compte tiers via dbo.sp_RecordThirdPartyAccountMovement :
   * la procédure verrouille le solde (UPDLOCK), applique la direction du type
   * (DEBT = +1, PAYMENT = -1), insère le mouvement et met à jour le solde —
   * atomique (sa propre transaction ou celle du appelant via SAVE TRANSACTION).
   * @param {Object} data
   * @param {number} data.thirdPartyAccountId
   * @param {string} data.typeCode - CUSTOMER_DEBT | CUSTOMER_PAYMENT | SUPPLIER_DEBT | SUPPLIER_PAYMENT
   * @param {number} data.mAmount - Strictement > 0 (51407).
   * @param {number} data.operatedByUserId
   * @param {Object} [data.transaction] - Transaction appelante optionnelle.
   * @returns {Promise<Object>} { thirdPartyAccountMovementId, mBalanceAfter }
   */
  static async recordMovement(data) {
    const {
      thirdPartyAccountId, typeCode, mAmount, saleId = null, purchaseId = null,
      debtPaymentId = null, storeId = null, operatedByUserId, note = null, transaction = null
    } = data;

    if (!mAmount || mAmount <= 0) throw new Error('CK_ThirdPartyAccountMovement_Amount : mAmount > 0 requis.');

    const type = await RefDAL.getByCode('thirdPartyMovementType', typeCode);
    if (!type) throw new Error(`Type de mouvement tiers inconnu : ${typeCode}`);

    try {
      const pool = await poolPromise;
      const request = transaction ? new sql.Request(transaction) : pool.request();
      const result = await request
        .input('thirdPartyAccountId', sql.Int, thirdPartyAccountId)
        .input('thirdPartyMovementTypeId', sql.Int, type.thirdPartyMovementTypeId)
        .input('mAmount', sql.Money, mAmount)
        .input('operatedByUserId', sql.Int, operatedByUserId)
        .input('saleId', sql.BigInt, saleId)
        .input('purchaseId', sql.Int, purchaseId)
        .input('debtPaymentId', sql.Int, debtPaymentId)
        .input('storeId', sql.Int, storeId)
        .input('note', sql.NVarChar(150), note)
        .execute('dbo.sp_RecordThirdPartyAccountMovement');

      return result.recordset[0];
    } catch (err) {
      throw ThirdPartyAccountDAL._mapSqlError(err);
    }
  }

  /**
   * Compte tiers d'un client via dbo.sp_GetThirdPartyAccountByCustomer
   * (colonnes identiques à l'ancien SELECT, avec solde dcCurrentBalance).
   * @param {number} companyId
   * @param {number} customerId
   * @returns {Promise<Object|null>}
   */
  static async getByCustomer(companyId, customerId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('customerId', sql.Int, customerId)
        .execute('dbo.sp_GetThirdPartyAccountByCustomer');

      return result.recordset[0] || null;
    } catch (err) {
      throw ThirdPartyAccountDAL._mapSqlError(err);
    }
  }

  /**
   * Dettes accordées (CUSTOMER_DEBT) sur les ventes d'une session via
   * dbo.sp_GetSessionDebtsGranted.
   * @param {number} cashSessionId
   * @returns {Promise<Array>}
   */
  static async getSessionDebtsGranted(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetSessionDebtsGranted');

      return result.recordset;
    } catch (err) {
      throw ThirdPartyAccountDAL._mapSqlError(err);
    }
  }
}

module.exports = ThirdPartyAccountDAL;