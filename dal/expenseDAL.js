/**
 * @file expenseDAL.js
 * @description DAL dépenses — ACCÈS EXCLUSIF via les objets du module
 * utils/expense-module.sql. INTERDIT : tout SQL inline sur dbo.tblExpenseCategory
 * et dbo.tblExpense.
 * Vues : vw_ExpenseDetails, vw_ExpenseCategoryDetails.
 * Procédures : sp_CreateExpenseCategory, sp_GetExpenseCategoriesByCompany,
 *   sp_CreateExpense, sp_GetExpensesByStore, sp_GetExpensesByCashSession,
 *   sp_GetExpenseSessionSummary, sp_GetTotalApprovedExpensesBySession,
 *   sp_DecideExpense.
 * @module DAL/Expense
 */

const { sql, poolPromise } = require('../config/db');

class ExpenseDAL {
  /**
   * Helper privé pour formater les erreurs SQL métier (plage 50000 - 54000,
   * couvre les codes 52800-52810 du module dépenses).
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
   * Crée une catégorie de dépenses active via dbo.sp_CreateExpenseCategory
   */
  static async createCategory({ companyId, vcExpenseCategoryCode, vcExpenseCategory }) {
    if (!companyId) throw new Error('companyId est obligatoire.');
    if (!vcExpenseCategoryCode || !vcExpenseCategoryCode.trim()) throw new Error('vcExpenseCategoryCode est obligatoire.');
    if (!vcExpenseCategory || !vcExpenseCategory.trim()) throw new Error('vcExpenseCategory est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('vcExpenseCategoryCode', sql.VarChar(20), vcExpenseCategoryCode.trim())
        .input('vcExpenseCategory', sql.VarChar(30), vcExpenseCategory.trim())
        .execute('dbo.sp_CreateExpenseCategory');

      return result.recordset[0];
    } catch (err) {
      throw ExpenseDAL._mapSqlError(err);
    }
  }

  /**
   * Catégories actives d'une entreprise
   */
  static async listCategories(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_GetExpenseCategoriesByCompany');

      return result.recordset;
    } catch (err) {
      throw ExpenseDAL._mapSqlError(err);
    }
  }

  /**
   * Enregistre une dépense
   */
  static async create(data) {
    const {
      cashSessionId = null,
      storeId,
      expenseCategoryId,
      mAmount,
      vcReason,
      vcProofUrl = null,
      vcStatusCode = 'PENDING',
      createdByUserId
    } = data;

    if (!mAmount || mAmount <= 0) {
      throw new Error('CK_Expense_Amount : le montant doit être strictement supérieur à 0.');
    }
    if (!vcReason || !vcReason.trim()) throw new Error('Le motif (vcReason) est obligatoire.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .input('storeId', sql.Int, storeId)
        .input('expenseCategoryId', sql.Int, expenseCategoryId)
        .input('mAmount', sql.Money, mAmount)
        .input('vcReason', sql.VarChar(150), vcReason.trim())
        .input('vcProofUrl', sql.VarChar(255), vcProofUrl)
        .input('vcStatusCode', sql.VarChar(20), vcStatusCode)
        .input('createdByUserId', sql.Int, createdByUserId)
        .execute('dbo.sp_CreateExpense');

      return result.recordset[0];
    } catch (err) {
      throw ExpenseDAL._mapSqlError(err);
    }
  }

  /**
   * Dépenses d'une boutique
   */
  static async getByStore(storeId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('storeId', sql.Int, storeId)
        .execute('dbo.sp_GetExpensesByStore');

      return result.recordset;
    } catch (err) {
      throw ExpenseDAL._mapSqlError(err);
    }
  }

  /**
   * ✅ Dépenses d'une session de caisse (C'EST CETTE FONCTION QUI MANQUAIT)
   */
  static async getBySession(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetExpensesByCashSession');

      return result.recordset;
    } catch (err) {
      throw ExpenseDAL._mapSqlError(err);
    }
  }

  /**
   * Bilan global d'une session
   */
  static async getSessionSummary(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetExpenseSessionSummary');

      return result.recordset[0];
    } catch (err) {
      throw ExpenseDAL._mapSqlError(err);
    }
  }

  /**
   * Total des dépenses approuvées d'une session
   */
  static async getTotalApprovedBySession(cashSessionId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('cashSessionId', sql.Int, cashSessionId)
        .execute('dbo.sp_GetTotalApprovedExpensesBySession');

      return result.recordset[0].totalApproved;
    } catch (err) {
      throw ExpenseDAL._mapSqlError(err);
    }
  }

  /**
   * Approuve ou rejette une dépense PENDING
   */
  static async approve(expenseId, approvedByUserId, statusCode) {
    if (!['APPROVED', 'REJECTED'].includes(statusCode)) {
      throw new Error("Statut invalide : 'APPROVED' ou 'REJECTED' attendu.");
    }

    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('expenseId', sql.Int, expenseId)
        .input('approvedByUserId', sql.Int, approvedByUserId)
        .input('vcStatusCode', sql.VarChar(20), statusCode)
        .execute('dbo.sp_DecideExpense');

      return result.recordset[0] || null;
    } catch (err) {
      throw ExpenseDAL._mapSqlError(err);
    }
  }
}

module.exports = ExpenseDAL;