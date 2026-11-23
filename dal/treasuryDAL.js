
/**
 * @file treasuryDAL.js
 * @description DAL trésorerie — accès exclusif via les procédures SQL.
 * @module DAL/Treasury
 */

const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

class TreasuryDAL {

  static _mapSqlError(err) {
    if (err && err.number >= 50000 && err.number < 54000) {
      const cleanErr = new Error(err.message);
      cleanErr.sqlNumber = err.number;
      return cleanErr;
    }
    return err;
  }

  static async createAccount(data) {
    const {
      companyId,
      storeId = null,
      treasuryAccountTypeCode,
      vcAccountName,
      mCurrentBalance = 0
    } = data;

    const type = await RefDAL.getByCode(
      'treasuryAccountType',
      treasuryAccountTypeCode
    );

    if (!type) {
      throw new Error(`Type de compte inconnu : ${treasuryAccountTypeCode}`);
    }

    if (!vcAccountName || !vcAccountName.trim()) {
      throw new Error('vcAccountName est obligatoire.');
    }

    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('storeId', sql.Int, storeId)
        .input('treasuryAccountTypeId', sql.Int, type.treasuryAccountTypeId)
        .input('vcAccountName', sql.VarChar(50), vcAccountName.trim())
        .input('mCurrentBalance', sql.Money, mCurrentBalance)
        .execute('dbo.usp_CreateTreasuryAccount');

      return result.recordset[0];

    } catch (err) {
      throw TreasuryDAL._mapSqlError(err);
    }
  }

  static async getAccounts(companyId) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.usp_GetTreasuryAccounts');

      return result.recordset;

    } catch (err) {
      throw TreasuryDAL._mapSqlError(err);
    }
  }

  /**
   * Enregistre un mouvement de trésorerie.
   *
   * IMPORTANT :
   * usp_RecordTreasuryMovement effectue déjà :
   * 1. L'insertion du mouvement.
   * 2. Le calcul du nouveau solde.
   * 3. La mise à jour du compte.
   *
   * Ne jamais ajouter un UPDATE manuel du solde après cette méthode.
   */
  static async recordMovement(data) {
    const {
      treasuryAccountId,
      typeCode,
      mAmount,
      cashReportId = null,
      vcDescription,
      operatedByUserId
    } = data;

    if (!Number.isFinite(Number(mAmount)) || Number(mAmount) <= 0) {
      throw new Error(
        'CK_TreasuryMovement_Amount : mAmount > 0 requis.'
      );
    }

    if (!vcDescription || !vcDescription.trim()) {
      throw new Error('vcDescription est obligatoire (NOT NULL).');
    }

    if (!operatedByUserId) {
      throw new Error('OperatedByUserId est obligatoire (NOT NULL).');
    }

    const type = await RefDAL.getByCode(
      'treasuryMovementType',
      typeCode
    );

    if (!type) {
      throw new Error(`Type de mouvement inconnu : ${typeCode}`);
    }

    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('treasuryAccountId', sql.Int, treasuryAccountId)
        .input(
          'treasuryMovementTypeId',
          sql.Int,
          type.treasuryMovementTypeId
        )
        .input('cashReportId', sql.Int, cashReportId)
        .input('mAmount', sql.Money, Number(mAmount))
        .input('vcDescription', sql.VarChar(150), vcDescription.trim())
        .input('OperatedByUserId', sql.Int, operatedByUserId)
        .execute('dbo.usp_RecordTreasuryMovement');

      return result.recordset?.[0] || null;

    } catch (err) {
      throw TreasuryDAL._mapSqlError(err);
    }
  }

  static async getMovements(
    treasuryAccountId,
    { limit = 100 } = {}
  ) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('treasuryAccountId', sql.Int, treasuryAccountId)
        .input('limit', sql.Int, limit)
        .execute('dbo.usp_GetTreasuryMovements');

      return result.recordset;

    } catch (err) {
      throw TreasuryDAL._mapSqlError(err);
    }
  }

  static async getRecentMovementsByCompany(
    companyId,
    limit = 50
  ) {
    try {
      const pool = await poolPromise;

      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .input('limit', sql.Int, limit)
        .query(`
          SELECT TOP (@limit)
              m.treasuryMovementId,
              m.treasuryAccountId,
              a.vcAccountName,
              at.vcCode AS accountTypeCode,
              at.vcTreasuryAccountType AS accountTypeName,
              m.mAmount,
              m.vcDescription,
              m.dtCreatedAt,
              t.vcTreasuryMovementType AS typeCode
          FROM dbo.tblTreasuryMovement m
          INNER JOIN dbo.tblTreasuryAccount a
              ON a.treasuryAccountId = m.treasuryAccountId
          INNER JOIN dbo.tblRefTreasuryAccountType at
              ON at.treasuryAccountTypeId = a.treasuryAccountTypeId
          INNER JOIN dbo.tblRefTreasuryMovementType t
              ON t.treasuryMovementTypeId = m.treasuryMovementTypeId
          WHERE a.companyId = @companyId
          ORDER BY m.dtCreatedAt DESC
        `);

      return result.recordset || [];

    } catch (err) {
      throw TreasuryDAL._mapSqlError(err);
    }
  }
}

module.exports = TreasuryDAL;
