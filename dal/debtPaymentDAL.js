/**
 * @file debtPaymentDAL.js
 * @description DAL paiements de dettes — ACCÈS EXCLUSIF via les objets du module
 * utils/debt-payment-module.sql. INTERDIT : tout SQL inline sur dbo.tblDebtPayment,
 * dbo.tblThirdPartyAccount et dbo.tblThirdPartyAccountMovement.
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
   * Enregistre un paiement de dette via dbo.sp_CreateDebtPayment.
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
   * Historique des paiements de dettes d'un compte tiers.
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
   * Lignes de recouvrement SUCCESS d'une session.
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
   * Agrégats des recouvrements d'une session.
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

  /**
   * ✅ CORRIGÉ : Total de TOUTES les dettes encaissées (Zéro SQL Inline).
   */
  static async getTotalDebtPayments(companyId, { startDate, endDate, storeId } = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('storeId', sql.Int, storeId || null)
        .input('startDate', sql.DateTime, startDate ? new Date(startDate) : null)
        .input('endDate', sql.DateTime, endDate ? new Date(endDate) : null)
        .execute('dbo.sp_GetTotalDebtPayments'); // 👈 Appel de la procédure

      return result.recordset[0]?.totalDebt || 0;
    } catch (err) {
      throw DebtPaymentDAL._mapSqlError(err);
    }
  }

  /**
   * ✅ CORRIGÉ : Total des dettes Fintech encaissées (Zéro SQL Inline).
   */
  static async getFintechDebtPaymentsTotal(companyId, { startDate, endDate, storeId } = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('storeId', sql.Int, storeId || null)
        .input('startDate', sql.DateTime, startDate ? new Date(startDate) : null)
        .input('endDate', sql.DateTime, endDate ? new Date(endDate) : null)
        .execute('dbo.sp_GetFintechDebtPaymentsTotal'); // 👈 Appel de la procédure

      return result.recordset[0]?.totalFintechDebt || 0;
    } catch (err) {
      throw DebtPaymentDAL._mapSqlError(err);
    }
  }
}

module.exports = DebtPaymentDAL;