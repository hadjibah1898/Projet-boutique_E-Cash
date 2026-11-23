/**
 * @file saleDAL.js
 * @description DAL ventes — ACCÈS EXCLUSIF via les objets du module utils/sale-module.sql.
 * @module DAL/Sale
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

function generateSaleNumber() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const shortYear = String(d.getFullYear()).slice(2); 
  return `VTE-${shortYear}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}`;
}

class SaleDAL {
  static _mapSqlError(err) {
    if (err && err.number >= 50000 && err.number < 54000) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

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

  static async _buildPaymentsTable(payments) {
    const table = new sql.Table('SalePaymentInputType');
    table.columns.add('paymentMethodId', sql.Int, { nullable: false });
    table.columns.add('paymentStatusId', sql.Int, { nullable: false });
    table.columns.add('mAmount', sql.Money, { nullable: false });
    table.columns.add('vcTransactionId', sql.VarChar(150), { nullable: true });
    table.columns.add('vcOperatorReference', sql.VarChar(150), { nullable: true });
    table.columns.add('vcPayerPhoneNumber', sql.VarChar(20), { nullable: true });

    const defaultStatus = await RefDAL.getByCode('paymentStatus', 'PENDING');
    if (!defaultStatus) throw new Error('Statut de paiement inconnu : PENDING.');

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

  static async create(data) {
    const {
      companyId, storeId, cashSessionId, customerId = null, sellerUserId,
      details = [], payments = [], statusCode = 'VALIDATED'
    } = data;

    if (!companyId || !storeId || !cashSessionId || !sellerUserId) {
      throw new Error('companyId, storeId, cashSessionId et sellerUserId sont obligatoires.');
    }
    if (!details.length) throw new Error('Au moins une ligne de vente est requise.');

    let mGrossAmount = 0;
    let mDiscountAmount = 0;
    for (const d of details) {
      if (!d.productId || !d.dcQuantity || d.dcQuantity <= 0) throw new Error('Ligne invalide.');
      if (d.mUnitSalePrice === undefined || d.mUnitSalePrice < 0) throw new Error('Prix de vente invalide.');
      mGrossAmount += d.dcQuantity * d.mUnitSalePrice;
      mDiscountAmount += Number(d.mDiscountAmount || 0);
    }
    const mNetAmount = mGrossAmount - mDiscountAmount;
    const mPaidAmount = payments.reduce((s, p) => s + Number(p.mAmount || 0), 0);
    const mDebtAmount = mNetAmount - mPaidAmount;

    if (mPaidAmount < 0 || mDebtAmount < 0) throw new Error('Le montant payé dépasse le net.');
    if (mDebtAmount > 0 && !customerId) throw new Error('Vente à crédit exige un client.');

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

  static async getByStore(storeId, companyId, { limit = 100, modePaiement, startDate, endDate } = {}) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)       
        .input('companyId', sql.Int, companyId)   
        .input('limit', sql.Int, limit)
        .execute('dbo.sp_GetSalesByStore');

      let sales = result.recordset || [];

      const salesWithItems = await Promise.all(sales.map(async (sale) => {
          const details = await SaleDAL.getDetails(sale.saleId);
          const payments = await SaleDAL.getPayments(sale.saleId);

          const items = details.map(d => ({
              _id: d.saleDetailId || d.detailId, 
              article: {
                  nom: d.vcProductName || d.productName || 'Produit',
                  prixVente: d.mUnitSalePrice || d.prixVente || 0
              },
              quantite: d.dcQuantity || d.quantite || 1,
              prixTotal: (d.mUnitSalePrice || d.prixVente || 0) * (d.dcQuantity || d.quantite || 1),
              isCancelled: d.isCancelled || false
          }));

          // ✅ On privilégie le libellé (vcPaymentMethodName) ou le code (vcCode)
          const modePaiementLabel = payments.length > 0 
            ? (payments[0].vcPaymentMethodName || payments[0].vcPaymentMethod || payments[0].vcCode || 'Cash') 
            : (sale.modePaiement || 'Cash');
          const transactionRef = payments.length > 0 ? payments[0].vcTransactionId : null;

          return {
              ...sale,
              orderGroupId: sale.saleId,
              createdAt: sale.dtSoldAt || sale.createdAt, 
              statut: sale.vcSaleStatus || sale.statut, 
              isCancelled: sale.IsCancelled || false,
              totalGroupPrice: sale.mNetAmount || 0,
              numeroFacture: sale.vcSaleNumber,
              boutique: { nom: sale.boutiqueNom || 'Boutique' },
              gerant: { nom: sale.gerantNom || 'Admin' },
              items: items,
              firstPaymentMode: modePaiementLabel,
              transactionRef: transactionRef
          };
      }));

      let filteredSales = salesWithItems;
      if (modePaiement) {
        const modes = modePaiement.split(',').map(m => m.trim().toUpperCase());
        filteredSales = filteredSales.filter(s => modes.includes((s.firstPaymentMode || '').toUpperCase()));
      }
      if (startDate) filteredSales = filteredSales.filter(s => new Date(s.createdAt) >= new Date(startDate));
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1); 
        filteredSales = filteredSales.filter(s => new Date(s.createdAt) < end);
      }

      return filteredSales;
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }

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

  static async addPayment(saleId, payment) {
    if (!payment.mAmount || Number(payment.mAmount) <= 0) throw new Error('mAmount doit être > 0.');

    const method = await RefDAL.getByCode('paymentMethod', payment.paymentMethodCode);
    if (!method) throw new Error(`Méthode de paiement inconnue : ${payment.paymentMethodCode}`);
    const status = payment.paymentStatusCode
      ? await RefDAL.getByCode('paymentStatus', payment.paymentStatusCode)
      : await RefDAL.getByCode('paymentStatus', 'PENDING');
    if (!status) throw new Error(`Statut de paiement inconnu.`);

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

  static async finalize(saleId, payments, userId, allowPartial = true) {
    if (!userId) throw new Error('userId est obligatoire.');

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

  /**
   * ✅ CORRIGÉ : Récupère UNIQUEMENT les paiements Fintech (exclut CASH)
   * via la procédure stockée sp_GetSessionFintechBreakdown.
   */
  static async getSessionFintechBreakdown(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetSessionFintechBreakdown'); // 👈 Appel de la procédure

      return result.recordset || [];
    } catch (err) {
      throw SaleDAL._mapSqlError(err);
    }
  }
}

module.exports = SaleDAL;