
/**
 * @file cashReportDAL.js
 * @description DAL pour les rapports de caisse.
 * ACCES EXCLUSIF via procédures stockées.
 * @module DAL/CashReport
 */

const { sql, poolPromise } = require('../config/db');

class CashReportDAL {

  static _mapSqlError(err) {
    if (err && err.number >= 50000 && err.number < 54000) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }

    return err;
  }

  // =====================================================
  // CREATION D'UN RAPPORT
  // =====================================================

  static async createReport({
    cashSessionId,
    userId,
    storeId,
    mDeclaredClosingAmount,
    vcManagerComment
  }) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .input('mDeclaredClosingAmount', sql.Money, mDeclaredClosingAmount)
        .input('vcManagerComment', sql.NVarChar(500), vcManagerComment || null)
        .execute('dbo.sp_CreateCashReport');

      return result.recordset ? result.recordset[0] : null;

    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  // =====================================================
  // LISTE DES RAPPORTS AVEC FILTRES
  // =====================================================

  static async listReports(
    userId,
    roleCode,
    storeId,
    companyId,
    { startDate, endDate, gerantId } = {}
  ) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('UserId', sql.Int, userId)
        .input('RoleCode', sql.VarChar(50), roleCode)
        .input('StoreId', sql.Int, storeId || null)
        .input('CompanyId', sql.Int, companyId || null)
        .input(
          'StartDate',
          sql.DateTime,
          startDate ? new Date(startDate) : null
        )
        .input(
          'EndDate',
          sql.DateTime,
          endDate
            ? new Date(new Date(endDate).getTime() + 86400000)
            : null
        )
        .input('GerantId', sql.Int, gerantId || null)
        .execute('dbo.sp_GetCashReportsFiltered');

      return result.recordset;

    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  // =====================================================
  // DETAILS D'UN RAPPORT
  // =====================================================

  static async getReportDetails(cashReportId) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('cashReportId', sql.Int, cashReportId)
        .execute('dbo.sp_GetCashReportById');

      // Vérification des jeux de résultats
      const recordsets = result.recordsets || [];

      const rapport = recordsets[0]?.[0] || null;
      const ventes = recordsets[1] || [];
      const depenses = recordsets[2] || [];
      const paiements = recordsets[3] || [];

      // Associer les paiements à chaque vente grâce à saleId.
      // Une vente peut avoir plusieurs moyens de paiement.
      const ventesAvecPaiements = ventes.map(vente => {
        const payments = paiements
          .filter(p => String(p.saleId) === String(vente.saleId))
          .map(p => ({
            salePaymentId: p.salePaymentId,
            paymentMethodId: p.paymentMethodId,
            methodCode: p.methodCode,
            vcPaymentMethod: p.vcPaymentMethod,
            paymentStatusId: p.paymentStatusId,
            statusCode: p.statusCode,
            vcPaymentStatus: p.vcPaymentStatus,
            mAmount: Number(p.mAmount || 0),
            vcTransactionId: p.vcTransactionId,
            vcOperatorReference: p.vcOperatorReference,
            vcPayerPhoneNumber: p.vcPayerPhoneNumber,
            dtCreatedAt: p.dtCreatedAt
          }));

        return {
          ...vente,
          payments,
          // Compatibilité avec les anciens composants qui utilisent
          // parfois ces propriétés au singulier.
          modePaiement: payments.length === 1
            ? payments[0].vcPaymentMethod
            : null
        };
      });

      return {
        rapport,
        ventes: ventesAvecPaiements,
        depenses,
        paiements
      };

    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  // =====================================================
  // RAPPORTS PAR SESSION
  // =====================================================

  static async getReportsBySession(cashSessionId) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetCashReportsBySession');

      return result.recordset;

    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  // =====================================================
  // VALIDATION / REJET D'UN RAPPORT
  // =====================================================

  static async decideReport(
    cashReportId,
    level,
    userId,
    isApproved,
    comment = null
  ) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('cashReportId', sql.Int, cashReportId)
        .input('level', sql.VarChar(10), level)
        .input('userId', sql.Int, userId)
        .input('isApproved', sql.Bit, isApproved ? 1 : 0)
        .input('comment', sql.VarChar(250), comment)
        .execute('dbo.sp_ApproveCashReport');

      return (
        result.recordset && result.recordset.length > 0
      )
        ? result.recordset[0]
        : null;

    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  // =====================================================
  // TOTAL DES RAPPORTS VALIDES
  // =====================================================

  static async getTotalValidatedReports(storeId, userId) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .input('userId', sql.Int, userId)
        .execute('dbo.sp_GetTotalValidatedReports');

      return result.recordset[0]?.totalRapportsValides || 0;

    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  // =====================================================
  // MES RAPPORTS
  // =====================================================

  static async getMyReports(userId) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('UserId', sql.Int, userId)
        .execute('dbo.sp_GetMyCashReports');

      return result.recordset;

    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }

  // =====================================================
  // CORRECTION ADMINISTRATIVE
  // =====================================================

  static async correctReport({
    reportId,
    newAmount,
    comment,
    adminUserId
  }) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('cashReportId', sql.Int, reportId)
        .input('newAmount', sql.Money, newAmount)
        .input(
          'comment',
          sql.VarChar(250),
          comment || 'Correction administrative'
        )
        .input('adminUserId', sql.Int, adminUserId)
        .execute('dbo.sp_CorrectCashReport');

      return result.recordset ? result.recordset[0] : null;

    } catch (err) {
      throw CashReportDAL._mapSqlError(err);
    }
  }
}

module.exports = CashReportDAL;
