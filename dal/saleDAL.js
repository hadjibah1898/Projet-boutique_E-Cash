/**
 * @file saleDAL.js
 * @description DAL ventes — ACCÈS EXCLUSIF via les objets du module utils/sale-module.sql.
 * INTERDIT : tout SQL inline sur dbo.tblSale, dbo.tblSaleDetail et dbo.tblSalePayment
 * (écritures transactionnelles, contrôles de workflow et mouvements de stock sont
 * délégués aux procédures).
 * Vues : vw_SaleDetails, vw_SaleLineDetails, vw_SalePaymentDetails.
 * TVP : SaleDetailInputType, SalePaymentInputType (lignes + paiements).
 * Procédures : sp_CreateSale, sp_GetSalesByStore, sp_GetSalesByCashSession,
 *   sp_GetSaleHeader, sp_GetSaleLines, sp_GetSalePayments, sp_AddSalePayment,
 *   sp_GetSaleSessionTotals, sp_GetSaleSessionSales, sp_GetDraftSalesBySession,
 *   sp_FinalizeSale, sp_CancelSale.
 * CK_Sale_Amounts : mPaidAmount + mDebtAmount = mNetAmount — les totaux sont calculés
 * en JS puis transmis, conformément au contrat de sp_CreateSale.
 * @module DAL/Sale
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

function generateSaleNumber() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  
  // ✅ CORRECTION FINALE : Format exact de 20 caractères maximum
  // VTE- (4) + YY (2) + MM (2) + DD (2) + HH (2) + mm (2) + ss (2) + - (1) + RRR (3) = 20
  const shortYear = String(d.getFullYear()).slice(2); 
  
  return `VTE-${shortYear}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}`;
}

class SaleDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre les codes 52100-52121 du module ventes).
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
   * Construit la TVP dbo.SaleDetailInputType (lignes de vente).
   * @private
   * @param {Array<Object>} details - { productId, stockLotId, dcQuantity,
   *   mUnitPurchasePrice, mUnitSalePrice, mDiscountAmount }
   * @returns {sql.Table}
   */
  static _buildDetailsTable(details) {
    const table = new sql.Table('SaleDetailInputType');
    table.columns.add('productId', sql.BigInt, { nullable: false });
    table.columns.add('stockLotId', sql.Int, { nullable: true });
    table.columns.add('dcQuantity', sql.Decimal(18, 3), { nullable: false });
    table.columns.add('mUnitPurchasePrice', sql.Money, { nullable: true });
    table.columns.add('mUnitSalePrice', sql.Money, { nullable: false });
    table.columns.add('mDiscountAmount', sql.Money, { nullable: false });

    for (const d of details) {
      table.rows.add(
        d.productId,
        d.stockLotId || null,
        Number(d.dcQuantity),
        d.mUnitPurchasePrice ?? null,
        Number(d.mUnitSalePrice),
        Number(d.mDiscountAmount || 0)
      );
    }
    return table;
  }

  /**
   * Construit la TVP dbo.SalePaymentInputType après résolution des codes
   * méthode/statut en IDs (RefDAL). Statut par défaut : PENDING.
   * @private
   * @param {Array<Object>} payments - { paymentMethodCode, paymentStatusCode, mAmount,
   *   vcTransactionId, vcOperatorReference, vcPayerPhoneNumber }
   * @returns {Promise<sql.Table>}
   */
  static async _buildPaymentsTable(payments) {
    const table = new sql.Table('SalePaymentInputType');
    table.columns.add('paymentMethodId', sql.Int, { nullable: false });
    table.columns.add('paymentStatusId', sql.Int, { nullable: false });
    table.columns.add('mAmount', sql.Money, { nullable: false });
    table.columns.add('vcTransactionId', sql.VarChar(150), { nullable: true });
    table.columns.add('vcOperatorReference', sql.VarChar(150), { nullable: true });
    table.columns.add('vcPayerPhoneNumber', sql.VarChar(20), { nullable: true });

    const defaultStatus = await RefDAL.getByCode('paymentStatus', 'PENDING');
    if (!defaultStatus) {
      throw new Error('Statut de paiement inconnu : PENDING (tblRefPaymentStatus).');
    }

    for (const p of payments) {
      const method = await RefDAL.getByCode('paymentMethod', p.paymentMethodCode);
      if (!method) throw new Error(`Méthode de paiement inconnue : ${p.paymentMethodCode}`);
      const status = p.paymentStatusCode
        ? await RefDAL.getByCode('paymentStatus', p.paymentStatusCode)
        : defaultStatus;
      if (!status) throw new Error(`Statut de paiement inconnu : ${p.paymentStatusCode}`);

      table.rows.add(
        method.paymentMethodId,
        status.paymentStatusId,
        Number(p.mAmount || 0),
        p.vcTransactionId || null,
        p.vcOperatorReference || null,
        p.vcPayerPhoneNumber || null
      );
    }
    return table;
  }

  /**
   * Crée une vente complète (entête + lignes + paiements + mouvements de stock si
   * non DRAFT) via dbo.sp_CreateSale : la procédure exécute tout dans une unique
   * transaction SQL. Les totaux (mGrossAmount/mDiscountAmount/mNetAmount/mPaidAmount/
   * mDebtAmount) restent calculés en JS — c'est le contrat de la SP (52105/52106).
   * @param {Object} data
   * @param {Array<Object>} data.details - Lignes [{ productId, stockLotId, dcQuantity,
   *   mUnitSalePrice, mUnitPurchasePrice, mDiscountAmount }]
   * @param {Array<Object>} data.payments - [{ paymentMethodCode, paymentStatusCode, mAmount, ... }]
   * @param {string} [data.statusCode='VALIDATED'] - 'VALIDATED' (stock décrémenté)
   *   ou 'DRAFT' (commande, stock intact jusqu'à finalize).
   * @returns {Promise<Object>} { saleId, vcSaleNumber, mNetAmount }
   */
  static async create(data) {
    const {
      companyId, storeId, cashSessionId, customerId = null, sellerUserId,
      details = [], payments = [],
      statusCode = 'VALIDATED'
    } = data;

    if (!companyId || !storeId || !cashSessionId || !sellerUserId) {
      throw new Error('companyId, storeId, cashSessionId et sellerUserId sont obligatoires.');
    }
    if (!details.length) throw new Error('Au moins une ligne de vente est requise.');

    let mGrossAmount = 0;
    let mDiscountAmount = 0;
    for (const d of details) {
      if (!d.productId || !d.dcQuantity || d.dcQuantity <= 0) {
        throw new Error('Chaque ligne exige productId et dcQuantity > 0.');
      }
      if (d.mUnitSalePrice === undefined || d.mUnitSalePrice < 0) {
        throw new Error('mUnitSalePrice est obligatoire et >= 0.');
      }
      mGrossAmount += d.dcQuantity * d.mUnitSalePrice;
      mDiscountAmount += Number(d.mDiscountAmount || 0);
    }
    const mNetAmount = mGrossAmount - mDiscountAmount;
    const mPaidAmount = payments.reduce((s, p) => s + Number(p.mAmount || 0), 0);
    const mDebtAmount = mNetAmount - mPaidAmount;

    if (mPaidAmount < 0 || mDebtAmount < 0) throw new Error('Le montant payé dépasse le net à payer.');
    if (mDebtAmount > 0 && !customerId) throw new Error('Une vente à crédit exige un client (customerId).');

    const headerStatus = await RefDAL.getByCode('saleStatus', statusCode);
    if (!headerStatus) throw new Error(`Statut de vente inconnu : ${statusCode}`);

    try {
      const detailsTable = SaleDAL._buildDetailsTable(details);
      const paymentsTable = await SaleDAL._buildPaymentsTable(payments);

      const pool = await poolPromise;
      const result = await pool.request()
        .input('vcSaleNumber', sql.VarChar(20), generateSaleNumber())
        .input('companyId', sql.Int, companyId)
        .input('storeId', sql.Int, storeId)
        .input('cashSessionId', sql.Int, cashSessionId)
        .input('sellerUserId', sql.Int, sellerUserId)
        .input('saleStatusId', sql.Int, headerStatus.saleStatusId)
        .input('mGrossAmount', sql.Money, mGrossAmount)
        .input('mDiscountAmount', sql.Money, mDiscountAmount)
        .input('mNetAmount', sql.Money, mNetAmount)
        .input('mPaidAmount', sql.Money, mPaidAmount)
        .input('mDebtAmount', sql.Money, mDebtAmount)
        .input('details', detailsTable)
        .input('payments', paymentsTable)
        .input('customerId', sql.Int, customerId)
        .execute('dbo.sp_CreateSale');

      return result.recordset[0];
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /** Ventes d'une boutique via dbo.sp_GetSalesByStore (vw_SaleDetails). */
  static async getByStore(storeId, { limit = 100 } = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('limit', sql.Int, limit)
        .execute('dbo.sp_GetSalesByStore');

      return result.recordset;
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /** Ventes d'une session de caisse (écran caissier) via dbo.sp_GetSalesByCashSession. */
  static async getBySession(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetSalesByCashSession');

      return result.recordset;
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /** Entête d'une vente via dbo.sp_GetSaleHeader (montants, statut, client, vendeur). */
  static async getHeader(saleId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('saleId', sql.BigInt, saleId)
        .execute('dbo.sp_GetSaleHeader');

      return result.recordset[0] || null;
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /** Détails d'une vente via dbo.sp_GetSaleLines (vw_SaleLineDetails + infos produit). */
  static async getDetails(saleId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('saleId', sql.BigInt, saleId)
        .execute('dbo.sp_GetSaleLines');

      return result.recordset;
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /** Paiements d'une vente via dbo.sp_GetSalePayments (vw_SalePaymentDetails). */
  static async getPayments(saleId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('saleId', sql.BigInt, saleId)
        .execute('dbo.sp_GetSalePayments');

      return result.recordset;
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /**
   * Totaux d'une session de caisse via dbo.sp_GetSaleSessionTotals
   * (bilans et rapports de caisse : nbVentes, mTotalSales, mTotalPaid, mTotalCredit,
   * mTotalDiscount, mTotalCash, mTotalMobileMoney, mTotalOther).
   */
  static async getSessionTotals(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetSaleSessionTotals');

      return result.recordset[0];
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /** Ventes d'une session via dbo.sp_GetSaleSessionSales (écran de suivi). */
  static async getSessionSales(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetSaleSessionSales');

      return result.recordset;
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /** Ventes en brouillon (DRAFT) d'une session — à annuler lors de la clôture. */
  static async getDraftsBySession(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetDraftSalesBySession');

      return result.recordset;
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /**
   * Ajoute un paiement à une vente existante via dbo.sp_AddSalePayment : la procédure
   * contrôle l'annulation (52114) et le solde (52115), plafonne au reste dû, insère le
   * paiement et met à jour mPaidAmount / mDebtAmount (CK_Sale_Amounts) atomiquement.
   * @param {number} saleId
   * @param {Object} payment - { paymentMethodCode, paymentStatusCode, mAmount,
   *   vcTransactionId, vcOperatorReference, vcPayerPhoneNumber }
   * @returns {Promise<Object>} { salePaymentId, mAmount, mPaidAmount, mDebtAmount }
   */
  static async addPayment(saleId, payment) {
    if (!payment.mAmount || Number(payment.mAmount) <= 0) {
      throw new Error('CK_SalePayment_Amount : mAmount doit être > 0.');
    }

    const method = await RefDAL.getByCode('paymentMethod', payment.paymentMethodCode);
    if (!method) throw new Error(`Méthode de paiement inconnue : ${payment.paymentMethodCode}`);
    const status = payment.paymentStatusCode
      ? await RefDAL.getByCode('paymentStatus', payment.paymentStatusCode)
      : await RefDAL.getByCode('paymentStatus', 'PENDING');
    if (!status) {
      throw new Error(`Statut de paiement inconnu : ${payment.paymentStatusCode || 'PENDING'}`);
    }

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('saleId', sql.BigInt, saleId)
        .input('paymentMethodId', sql.Int, method.paymentMethodId)
        .input('paymentStatusId', sql.Int, status.paymentStatusId)
        .input('mAmount', sql.Money, Number(payment.mAmount))
        .input('vcTransactionId', sql.VarChar(150), payment.vcTransactionId || null)
        .input('vcOperatorReference', sql.VarChar(150), payment.vcOperatorReference || null)
        .input('vcPayerPhoneNumber', sql.VarChar(20), payment.vcPayerPhoneNumber || null)
        .execute('dbo.sp_AddSalePayment');

      // 1er jeu : montants de l'entête (OUTPUT de l'UPDATE) ;
      // 2e jeu : { salePaymentId, mAmount } du paiement appliqué (SELECT final).
      const amounts = (result.recordsets[0] || [])[0] || {};
      const created = (result.recordsets[1] || [])[0] || {};
      return {
        salePaymentId: created.salePaymentId ?? null,
        mAmount: Number(created.mAmount ?? payment.mAmount),
        mPaidAmount: amounts.mPaidAmount,
        mDebtAmount: amounts.mDebtAmount
      };
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /**
   * Finalise une vente DRAFT (commande -> encaissement) via dbo.sp_FinalizeSale :
   * paiements, mouvements de stock SALE et passage à VALIDATED sont exécutés
   * dans une unique transaction SQL (stock insuffisant => 52109).
   * @param {number} saleId
   * @param {Array<Object>} payments - [{ paymentMethodCode, paymentStatusCode, mAmount, ... }]
   * @param {number} userId - Utilisateur qui encaisse.
   * @param {boolean} [allowPartial=true] - Autorise un encaissement partiel (crédit).
   * @returns {Promise<Object>} { saleId, statusCode: 'VALIDATED', mPaidAmount, mDebtAmount }
   */
  static async finalize(saleId, payments, userId, allowPartial = true) {
    if (!userId) throw new Error('userId est obligatoire pour finaliser une vente.');

    try {
      const paymentsTable = await SaleDAL._buildPaymentsTable(payments);

      const pool = await poolPromise;
      const result = await pool.request()
        .input('saleId', sql.BigInt, saleId)
        .input('userId', sql.Int, userId)
        .input('allowPartial', sql.Bit, allowPartial ? 1 : 0)
        .input('payments', paymentsTable)
        .execute('dbo.sp_FinalizeSale');

      return result.recordset[0];
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

  /**
   * Annule une vente via dbo.sp_CancelSale : statut CANCELLED + retours en stock
   * (mouvements SALE_CANCEL) exécutés en SQL (déjà annulée => 52121).
   * @param {number} saleId
   * @param {number} cancelledByUserId
   * @param {string|null} [vcCancellationReason]
   * @returns {Promise<Object>} { saleId, cancelled: true }
   */
  static async cancel(saleId, cancelledByUserId, vcCancellationReason) {
    if (!cancelledByUserId) throw new Error('cancelledByUserId est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('saleId', sql.BigInt, saleId)
        .input('cancelledByUserId', sql.Int, cancelledByUserId)
        .input('vcCancellationReason', sql.VarChar(150), vcCancellationReason || null)
        .execute('dbo.sp_CancelSale');

      const row = (result.recordset || [])[0] || {};
      return { saleId: row.saleId ?? saleId, cancelled: true };
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }
}

module.exports = SaleDAL;