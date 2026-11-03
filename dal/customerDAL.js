/**
 * @file customerDAL.js
 * @description DAL clients — fidèle à dbo.tblCustomer du script.
 * @module DAL/Customer
 */

const { sql, poolPromise } = require('../config/db');

class CustomerDAL {
  /**
   * Crée un client (UQ_tblCustomer_Company_Code : unicité companyId+vcCustomerCode).
   */
  static async create(data) {
    const {
      companyId,
      customerTypeCode = 'INDIVIDUAL',
      vcCustomerCode,
      vcLastName = null,
      vcFirstName = null,
      vcEmail = null,
      vcPhoneNumber = null,
      genderCode = null,
      vcQuartier = null,
      vcCity = null,
      createdByUserId
    } = data;

    if (!companyId) throw new Error('companyId est obligatoire.');
    if (!vcCustomerCode || !vcCustomerCode.trim()) throw new Error('vcCustomerCode est obligatoire.');
    if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

    const pool = await poolPromise;
    const result = await pool.request()
      .input('companyId', sql.Int, companyId)
      .input('customerTypeCode', sql.VarChar(50), customerTypeCode ?? null)
      .input('genderCode', sql.VarChar(50), genderCode ?? null)
      .input('vcCustomerCode', sql.VarChar(20), vcCustomerCode.trim())
      .input('vcLastName', sql.VarChar(50), vcLastName ?? null)
      .input('vcFirstName', sql.VarChar(50), vcFirstName ?? null)
      .input('vcEmail', sql.VarChar(100), vcEmail ? vcEmail.trim().toLowerCase() : null)
      .input('vcPhoneNumber', sql.VarChar(20), vcPhoneNumber ? vcPhoneNumber.trim() : null)
      .input('vcQuartier', sql.VarChar(50), vcQuartier ?? null)
      .input('vcCity', sql.VarChar(50), vcCity ?? null)
      .input('createdByUserId', sql.Int, createdByUserId)
      .execute('dbo.sp_CreateCustomer');
    return result.recordset[0];
  }

  /**
   * Clients actifs d'une entreprise.
   */
  static async getByCompanyId(companyId) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('companyId', sql.Int, companyId)
      .execute('dbo.sp_GetCustomersByCompany');
    return result.recordset;
  }

  /**
   * Recherche plein-texte simple des clients d'une entreprise.
   */
  static async search(companyId, q, limit = 50) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('companyId', sql.Int, companyId)
      .input('q', sql.VarChar(100), q ?? null)
      .input('limit', sql.Int, limit)
      .execute('dbo.sp_SearchCustomers');
    return result.recordset;
  }

  /**
   * Recherche un client par ID.
   */
  static async findById(customerId, companyId) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('customerId', sql.Int, customerId)
      .input('companyId', sql.Int, companyId)
      .execute('dbo.sp_GetCustomerById');
    return result.recordset[0] || null;
  }

  /**
   * Mise à jour partielle sécurisée.
   */
  static async update(customerId, companyId, data) {
    const has = (key) => Object.prototype.hasOwnProperty.call(data, key);
    const customerTypeCode = data.customerTypeCode;
    const genderCode = data.genderCode;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('customerId', sql.Int, customerId)
      .input('companyId', sql.Int, companyId)
      .input('vcLastName', sql.VarChar(50), data.vcLastName ?? null)
      .input('setVcLastName', sql.Bit, has('vcLastName') ? 1 : 0)
      .input('vcFirstName', sql.VarChar(50), data.vcFirstName ?? null)
      .input('setVcFirstName', sql.Bit, has('vcFirstName') ? 1 : 0)
      .input('vcEmail', sql.VarChar(100), data.vcEmail ? data.vcEmail.trim().toLowerCase() : null)
      .input('setVcEmail', sql.Bit, has('vcEmail') ? 1 : 0)
      .input('vcPhoneNumber', sql.VarChar(20), data.vcPhoneNumber ? data.vcPhoneNumber.trim() : null)
      .input('setVcPhoneNumber', sql.Bit, has('vcPhoneNumber') ? 1 : 0)
      .input('vcQuartier', sql.VarChar(50), data.vcQuartier ?? null)
      .input('setVcQuartier', sql.Bit, has('vcQuartier') ? 1 : 0)
      .input('vcCity', sql.VarChar(50), data.vcCity ?? null)
      .input('setVcCity', sql.Bit, has('vcCity') ? 1 : 0)
      .input('customerTypeCode', sql.VarChar(50), customerTypeCode ?? null)
      .input('setCustomerType', sql.Bit, has('customerTypeCode') ? 1 : 0)
      .input('genderCode', sql.VarChar(50), genderCode ?? null)
      .input('setGender', sql.Bit, has('genderCode') ? 1 : 0)
      .execute('dbo.sp_UpdateCustomer');
    return result.recordset[0] || null;
  }

  /**
   * Désactivation logique d'un client (Soft Delete).
   */
  static async softDelete(customerId, companyId) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('customerId', sql.Int, customerId)
      .input('companyId', sql.Int, companyId)
      .execute('dbo.sp_SoftDeleteCustomer');
    return result.recordset[0]?.rowsAffected > 0;
  }

  // ==========================================
  // ✅ NOUVELLES MÉTHODES : DETTES CLIENTS
  // ==========================================

  /**
   * Récupère les clients avec une dette.
   */
  static async getDebts(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_GetCustomerDebts');
      return result.recordset;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Récupère l'historique des mouvements de dettes.
   */
  static async getDebtHistory(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_GetCustomerDebtHistory');
      return result.recordset;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Évolution de la dette par date et boutique.
   */
  static async getDebtEvolution(companyId) {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('companyId', sql.Int, companyId)
        .execute('dbo.sp_GetCustomerDebtEvolution');
      return result.recordset;
    } catch (err) {
      throw err;
    }
  }

  /**
   * ✅ NOUVELLE MÉTHODE : Enregistre un paiement de dette.
   * Utilise l'architecture du professeur : ThirdPartyAccount, DebtPayment, AccountMovement.
   */
  static async payDebt(customerId, companyId, montant, modePaiement, transactionRef, userId) {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    
    try {
      await transaction.begin();

      // 1. Trouver le compte tiers (ThirdPartyAccount) du client
      const accountResult = await new sql.Request(transaction)
        .input('customerId', sql.Int, customerId)
        .input('companyId', sql.Int, companyId)
        .query(`
          SELECT thirdPartyAccountId, dcCurrentBalance 
          FROM tblThirdPartyAccount 
          WHERE customerId = @customerId AND companyId = @companyId
        `);

      if (accountResult.recordset.length === 0) {
        throw new Error("Aucun compte de dette trouvé pour ce client.");
      }

      const account = accountResult.recordset[0];
      const ancienSolde = account.dcCurrentBalance;
      
      // (On suppose que la dette est stockée en négatif, ex: -10000)
      const nouveauSolde = ancienSolde - montant; 

      // 2. Récupérer l'ID du mode de paiement depuis la table de référence
      let vcCodeMethod = 'CASH';
      if (modePaiement === 'Orange Money') vcCodeMethod = 'ORANGE_MONEY';
      if (modePaiement === 'MobiCash') vcCodeMethod = 'MTN_MOMO';
      if (modePaiement === 'PayCard') vcCodeMethod = 'CARD';

      const methodResult = await new sql.Request(transaction)
        .input('vcCode', sql.VarChar(20), vcCodeMethod)
        .query(`SELECT paymentMethodId FROM tblRefPaymentMethod WHERE vcCode = @vcCode`);

      const paymentMethodId = methodResult.recordset[0]?.paymentMethodId || 1;

      // ✅ 3. RÉCUPÉRER LA SESSION DE CAISSE ACTIVE
      const sessionResult = await new sql.Request(transaction)
        .input('userId', sql.Int, userId)
        .query(`
          SELECT TOP 1 cashSessionId 
          FROM tblCashSession 
          WHERE userId = @userId AND cashSessionStatusId = 1 
          ORDER BY dtOpenedAt DESC
        `);
      const cashSessionId = sessionResult.recordset[0]?.cashSessionId || null;

      // 4. Insérer le paiement dans tblDebtPayment
      const paymentResult = await new sql.Request(transaction)
        .input('thirdPartyAccountId', sql.Int, account.thirdPartyAccountId)
        .input('cashSessionId', sql.Int, cashSessionId) // ✅ LIAISON À LA SESSION ICI
        .input('paymentMethodId', sql.Int, paymentMethodId)
        .input('paymentStatusId', sql.Int, 2) // SUCCESS
        .input('mAmount', sql.Money, montant)
        .input('vcTransactionId', sql.VarChar(150), transactionRef || null)
        .input('OperatedByUserId', sql.Int, userId)
        .query(`
          INSERT INTO tblDebtPayment 
          (thirdPartyAccountId, cashSessionId, paymentMethodId, paymentStatusId, mAmount, vcTransactionId, OperatedByUserId)
          OUTPUT INSERTED.debtPaymentId
          VALUES (@thirdPartyAccountId, @cashSessionId, @paymentMethodId, @paymentStatusId, @mAmount, @vcTransactionId, @OperatedByUserId)
        `);

      const debtPaymentId = paymentResult.recordset[0].debtPaymentId;

      // 5. Mettre à jour le solde du compte tiers
      await new sql.Request(transaction)
        .input('thirdPartyAccountId', sql.Int, account.thirdPartyAccountId)
        .input('nouveauSolde', sql.Decimal(18,2), nouveauSolde)
        .query(`
          UPDATE tblThirdPartyAccount 
          SET dcCurrentBalance = @nouveauSolde, dtLastMovementAt = GETDATE()
          WHERE thirdPartyAccountId = @thirdPartyAccountId
        `);

      // 6. Enregistrer le mouvement dans le grand livre (ThirdPartyAccountMovement)
      const typeResult = await new sql.Request(transaction)
        .query(`SELECT thirdPartyMovementTypeId FROM tblRefThirdPartyMovementType WHERE vcCode = 'CUSTOMER_PAYMENT'`);
      
      const movementTypeId = typeResult.recordset[0]?.thirdPartyMovementTypeId || 2; 

      await new sql.Request(transaction)
        .input('thirdPartyAccountId', sql.Int, account.thirdPartyAccountId)
        .input('thirdPartyMovementTypeId', sql.Int, movementTypeId)
        .input('debtPaymentId', sql.Int, debtPaymentId)
        .input('mAmount', sql.Money, montant)
        .input('mBalanceBefore', sql.Money, ancienSolde)
        .input('mBalanceAfter', sql.Money, nouveauSolde)
        .input('operatedByUserId', sql.Int, userId)
        .query(`
          INSERT INTO tblThirdPartyAccountMovement
          (thirdPartyAccountId, thirdPartyMovementTypeId, debtPaymentId, mAmount, mBalanceBefore, mBalanceAfter, operatedByUserId)
          VALUES (@thirdPartyAccountId, @thirdPartyMovementTypeId, @debtPaymentId, @mAmount, @mBalanceBefore, @mBalanceAfter, @operatedByUserId)
        `);

      await transaction.commit();

      return {
        nouveauSolde: Math.abs(nouveauSolde),
        paiement: { 
            id: debtPaymentId, 
            montant, 
            modePaiement, 
            transactionRef,
            datePaiement: new Date()
        },
        soldeAnterieur: Math.abs(ancienSolde)
      };

    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
}

module.exports = CustomerDAL;