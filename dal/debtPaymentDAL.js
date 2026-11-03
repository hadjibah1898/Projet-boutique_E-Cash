/**
 * @file debtPaymentDAL.js
 * @description DAL paiements de dettes — ACCÈS EXCLUSIF via les objets du module
 * utils/debt-payment-module.sql. INTERDIT : tout SQL inline sur dbo.tblDebtPayment,
 * dbo.tblThirdPartyAccount et dbo.tblThirdPartyAccountMovement.
 * sp_CreateDebtPayment insère le paiement, enregistre le mouvement tiers
 * (CUSTOMER_PAYMENT / SUPPLIER_PAYMENT) et met à jour le solde de façon atomique
 * (sa propre transaction, ou celle du appelant via SAVE TRANSACTION).
 * Vues : vw_DebtPaymentDetails.
 * Procédures : sp_CreateDebtPayment, sp_GetDebtPaymentsByAccount,
 *   sp_GetSessionRecoveryLines, sp_GetSessionRecoveryTotals.
 * Codes erreur métier : 52900 (ids), 52901 (méthode), 52902 (statut),
 *   52903 (montant), 52904 (utilisateur), 52905 (compte), 52906 (rattachement),
 *   52907 (type de mouvement).
 * @module DAL/DebtPayment
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class DebtPaymentDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 52900-52907).
   * @private
   */
  static _mapSqlError(err) {
    if (err && err.number >= 52900 && err.number <= 52907) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  /**
   * Enregistre un paiement de dette via dbo.sp_CreateDebtPayment : la procédure
   * verrouille le compte (UPDLOCK), détermine CUSTOMER_/SUPPLIER_PAYMENT, insère
   * le mouvement tiers et met à jour le solde — atomique, sans transaction JS.
   * @param {Object} data
   * @param {number} data.thirdPartyAccountId
   * @param {string} data.paymentMethodCode - Code de la méthode (ex: CASH).
   * @param {string} [data.paymentStatusCode='SUCCESS']
   * @param {number} data.mAmount - Strictement > 0 (52903).
   * @param {number|null} [data.storeId]
   * @param {number|null} [data.cashSessionId]
   * @param {number} data.operatedByUserId
   * @returns {Promise<Object>} { debtPaymentId, nouveauSolde }
   */
  static async create(data) {
    const {
      thirdPartyAccountId,
      paymentMethodCode,
      paymentStatusCode = 'SUCCESS',
      mAmount,
      storeId = null,
      cashSessionId = null,
      vcTransactionId = null,
      vcOperatorReference = null,
      vcPhoneNumber = null,
      operatedByUserId,
      vcNote = null
    } = data;

    if (!mAmount || mAmount <= 0) {
      throw new Error('CK_DebtPayment_Amount : mAmount > 0 requis.');
    }
    if (!operatedByUserId) {
      throw new Error('operatedByUserId est obligatoire (NOT NULL dans tblDebtPayment).');
    }

    const method = await RefDAL.getByCode('paymentMethod', paymentMethodCode);
    if (!method) throw new Error(`Méthode de paiement inconnue : ${paymentMethodCode}`);

    const status = await RefDAL.getByCode('paymentStatus', paymentStatusCode);
    if (!status) throw new Error(`Statut de paiement inconnu : ${paymentStatusCode}`);

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('thirdPartyAccountId', sql.Int, thirdPartyAccountId)
        .input('storeId', sql.Int, storeId)
        .input('cashSessionId', sql.Int, cashSessionId)
        .input('paymentMethodId', sql.Int, method.paymentMethodId)
        .input('paymentStatusId', sql.Int, status.paymentStatusId)
        .input('mAmount', sql.Money, mAmount)
        .input('vcTransactionId', sql.VarChar(150), vcTransactionId)
        .input('vcOperatorReference', sql.VarChar(150), vcOperatorReference)
        .input('vcPhoneNumber', sql.VarChar(20), vcPhoneNumber)
        .input('operatedByUserId', sql.Int, operatedByUserId)
        .input('vcNote', sql.VarChar(150), vcNote)
        .execute('dbo.sp_CreateDebtPayment');

      return result.recordset[0];
    } catch (err) {
      throw DebtPaymentDAL._mapSqlError(err);
    }
  }

  /**
   * Historique des paiements de dettes d'un compte tiers via
   * dbo.sp_GetDebtPaymentsByAccount (vw_DebtPaymentDetails : méthode, statut,
   * nom de l'opérateur — colonnes identiques à l'ancien SELECT).
   * @param {number} thirdPartyAccountId
   * @returns {Promise<Array>}
   */
  static async getByAccount(thirdPartyAccountId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('thirdPartyAccountId', sql.Int, thirdPartyAccountId)
        .execute('dbo.sp_GetDebtPaymentsByAccount');

      return result.recordset;
    } catch (err) {
      throw DebtPaymentDAL._mapSqlError(err);
    }
  }

  /**
   * Lignes de recouvrement SUCCESS d'une session via dbo.sp_GetSessionRecoveryLines
   * (détail des rapports de caisse).
   * @param {number} cashSessionId
   * @returns {Promise<Array>}
   */
  static async getSessionRecoveryLines(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetSessionRecoveryLines');

      return result.recordset;
    } catch (err) {
      throw DebtPaymentDAL._mapSqlError(err);
    }
  }

  /**
   * Agrégats des recouvrements d'une session via dbo.sp_GetSessionRecoveryTotals
   * (bilan de caisse : mTotalRecoveries / mMobileRecoveries / nbRecoveries).
   * @param {number} cashSessionId
   * @returns {Promise<Object>} Ligne d'agrégat ({} si aucune donnée).
   */
  static async getSessionRecoveryTotals(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetSessionRecoveryTotals');

      return result.recordset[0] || {};
    } catch (err) {
      throw DebtPaymentDAL._mapSqlError(err);
    }
  }
}

module.exports = DebtPaymentDAL;