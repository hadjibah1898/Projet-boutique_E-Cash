/**
 * @file userDAL.js
 * @description Couche d'accès aux données utilisateur.
 * @module DAL/User
 */

'use strict';

const bcrypt = require('bcrypt');
const { sql, poolPromise } = require('../config/db');
const RefDAL = require('./refDAL');

const BCRYPT_ROUNDS = 10;
const SQL_ERR_MIN = 50000;
const SQL_ERR_MAX = 59999;

class UserDAL {
    static async _getRequest(transaction = null) {
        if (transaction) return new sql.Request(transaction);
        const pool = await poolPromise;
        return pool.request();
    }

    static _mapSqlError(err) {
        if (err && typeof err.number === 'number' && err.number >= SQL_ERR_MIN && err.number <= SQL_ERR_MAX) {
            const wrapped = new Error(err.message);
            wrapped.sqlNumber = err.number;
            return wrapped;
        }
        return err;
    }

    static _requirePositiveInt(value, name) {
        if (value === null || value === undefined) throw new Error(`${name} est obligatoire.`);
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} doit être un entier strictement positif.`);
    }

    static async _resolveGenderId(genderCode) {
        if (genderCode === null || genderCode === undefined) return null;
        const gender = await RefDAL.getByCode('gender', genderCode);
        if (!gender) throw new Error(`Genre inconnu : ${genderCode}`);
        return gender.genderId;
    }

    static _cleanString(value, opts = {}) {
        if (value === null || value === undefined) return null;
        let s = String(value).trim();
        if (s === '') return null;
        if (opts.lower) s = s.toLowerCase();
        return s;
    }

    /* =========================================================================
       AUTHENTIFICATION
       ========================================================================= */

    static async findByLoginIdentifier(identifier) {
        if (!identifier) return null;
        const clean = String(identifier).trim();
        const isEmail = clean.includes('@');

        const pool = await poolPromise;
        try {
            const result = await pool.request()
                .input('vcEmail', sql.VarChar(100), isEmail ? clean.toLowerCase() : null)
                .input('vcPhoneNumber', sql.VarChar(20), isEmail ? null : clean)
                .execute('dbo.usp_FindUserByLoginIdentifier');

            const row = (result.recordset && result.recordset[0]) || null;
            if (!row) return null;
            return { ...row, mustChangePassword: row.mustChangePassword === true };
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async comparePassword(candidate, hash) {
        if (!candidate || !hash) return false;
        return bcrypt.compare(candidate, hash);
    }

    static async updateLastLogin(userId) {
        UserDAL._requirePositiveInt(userId, 'userId');
        const pool = await poolPromise;
        try {
            const result = await pool.request()
                .input('userId', sql.Int, userId)
                .execute('dbo.usp_UpdateUserLastLogin');

            const row = (result.recordset && result.recordset[0]) || null;
            return row ? row.rowsAffected : 0;
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    /* =========================================================================
       CRUD UTILISATEUR
       ========================================================================= */

    static async create(data, transaction = null) {
        const { vcLastName, vcFirstName = null, genderCode = null, vcEmail = null, vcPhoneNumber = null, password, vcAddress = null, vcPhotoUrl = null } = data || {};

        const lastName = UserDAL._cleanString(vcLastName);
        if (!lastName) throw new Error('Le nom (vcLastName) est obligatoire.');
        if (!password) throw new Error('Le mot de passe est obligatoire.');

        const email = UserDAL._cleanString(vcEmail, { lower: true });
        const phone = UserDAL._cleanString(vcPhoneNumber);
        if (!email && !phone) throw new Error('Un utilisateur doit avoir un email ou un téléphone.');

        const genderId = await UserDAL._resolveGenderId(genderCode);
        const vcPasswordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const req = await UserDAL._getRequest(transaction);
        try {
            const result = await req
                .input('vcLastName',     sql.VarChar(50),  lastName)
                .input('vcPasswordHash', sql.VarChar(255), vcPasswordHash)
                .input('genderId',       sql.Int,          genderId)
                .input('vcFirstName',    sql.VarChar(50),  UserDAL._cleanString(vcFirstName))
                .input('vcEmail',        sql.VarChar(100), email)
                .input('vcPhoneNumber',  sql.VarChar(20),  phone)
                .input('vcAddress',      sql.VarChar(150), UserDAL._cleanString(vcAddress))
                .input('vcPhotoUrl',     sql.VarChar(255), UserDAL._cleanString(vcPhotoUrl))
                .execute('dbo.usp_CreateUser');

            return (result.recordset && result.recordset[0]) || null;
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async findById(userId) {
        UserDAL._requirePositiveInt(userId, 'userId');
        const pool = await poolPromise;
        try {
            const result = await pool.request()
                .input('userId', sql.Int, userId)
                .execute('dbo.usp_GetUserById');

            const row = (result.recordset && result.recordset[0]) || null;
            if (!row) return null;
            return { ...row, mustChangePassword: row.mustChangePassword === true };
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async listAll() {
        const pool = await poolPromise;
        try {
            const result = await pool.request().execute('dbo.usp_ListUsers');
            return result.recordset || [];
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async listByCompany(companyId) {
        UserDAL._requirePositiveInt(companyId, 'companyId');
        const pool = await poolPromise;
        try {
            const result = await pool.request()
                .input('companyId', sql.Int, companyId)
                .execute('dbo.usp_ListUsersByCompany');
            return result.recordset || [];
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async update(userId, data, transaction = null) {
        UserDAL._requirePositiveInt(userId, 'userId');
        const d = data || {};
        let genderId = null;
        let genderTouched = false;
        if (d.genderCode !== undefined) {
            genderTouched = true;
            genderId = d.genderCode === null ? null : await UserDAL._resolveGenderId(d.genderCode);
        }
        const vcPasswordHash = d.password ? await bcrypt.hash(d.password, BCRYPT_ROUNDS) : null;
        const req = await UserDAL._getRequest(transaction);
        try {
            const result = await req
                .input('userId',         sql.Int,          userId)
                .input('vcLastName',     sql.VarChar(50), d.vcLastName !== undefined ? UserDAL._cleanString(d.vcLastName) : null)
                .input('vcFirstName',    sql.VarChar(50), d.vcFirstName !== undefined ? UserDAL._cleanString(d.vcFirstName) : null)
                .input('genderId',       sql.Int, genderTouched ? genderId : null)
                .input('vcEmail',        sql.VarChar(100), d.vcEmail !== undefined ? UserDAL._cleanString(d.vcEmail, { lower: true }) : null)
                .input('vcPhoneNumber',  sql.VarChar(20), d.vcPhoneNumber !== undefined ? UserDAL._cleanString(d.vcPhoneNumber) : null)
                .input('vcAddress',      sql.VarChar(150), d.vcAddress !== undefined ? UserDAL._cleanString(d.vcAddress) : null)
                .input('vcPhotoUrl',     sql.VarChar(255), d.vcPhotoUrl !== undefined ? UserDAL._cleanString(d.vcPhotoUrl) : null)
                .input('vcPasswordHash', sql.VarChar(255), vcPasswordHash)
                .execute('dbo.usp_UpdateUser');

            return (result.recordset && result.recordset[0]) || null;
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async setActive(userId, btIsActive, requestedByUserId = null) {
        UserDAL._requirePositiveInt(userId, 'userId');
        if (requestedByUserId !== null && requestedByUserId !== undefined) UserDAL._requirePositiveInt(requestedByUserId, 'requestedByUserId');
        const pool = await poolPromise;
        try {
            const result = await pool.request()
                .input('userId',            sql.Int, userId)
                .input('btIsActive',        sql.Bit, btIsActive ? 1 : 0)
                .input('requestedByUserId', sql.Int, requestedByUserId)
                .execute('dbo.usp_SetUserActive');
            return (result.recordset && result.recordset[0]) || null;
        } catch (err) { throw UserDAL._mapSqlError(err); }
    }

    static async setMustChangePassword(userId, required) {
        UserDAL._requirePositiveInt(userId, 'userId');
        const pool = await poolPromise;
        try {
            const result = await pool.request()
                .input('userId',   sql.Int, userId)
                .input('required', sql.Bit, required ? 1 : 0)
                .execute('dbo.usp_SetMustChangePassword');
            const row = (result.recordset && result.recordset[0]) || null;
            return row ? row.rowsAffected : 0;
        } catch (err) { throw UserDAL._mapSqlError(err); }
    }

    static async getContext(userId) {
        UserDAL._requirePositiveInt(userId, 'userId');
        const [profile, ctxResult] = await Promise.all([
            UserDAL.findById(userId),
            (async () => {
                const pool = await poolPromise;
                try {
                    return await pool.request()
                        .input('userId', sql.Int, userId)
                        .execute('dbo.usp_GetUserContext');
                } catch (err) { throw UserDAL._mapSqlError(err); }
            })()
        ]);

        const rs = ctxResult.recordsets || [];
        const companies = (rs[0] || []).map(c => ({ userCompanyId: c.userCompanyId, companyId: c.companyId, vcCompanyName: c.vcCompanyName, roleId: c.roleId, roleCode: c.companyRoleCode }));
        const stores = (rs[1] || []).map(s => ({ userStoreId: s.userStoreId, storeId: s.storeId, vcStoreName: s.vcStoreName, companyId: s.companyId, roleId: s.roleId, roleCode: s.storeRoleCode }));
        const globalRow = (rs[2] && rs[2][0]) || null;
        const globalRole = globalRow ? { roleId: globalRow.roleId, globalRoleCode: globalRow.globalRoleCode } : null;

        const roleCodes = new Set();
        if (globalRole && globalRole.globalRoleCode) roleCodes.add(globalRole.globalRoleCode);
        companies.forEach(c => c.roleCode && roleCodes.add(c.roleCode));
        stores.forEach(s => s.roleCode && roleCodes.add(s.roleCode));

        const capabilities = { isSuperAdmin: roleCodes.has('SUPER_ADMIN'), isAdmin: roleCodes.has('ADMIN'), isManager: roleCodes.has('MANAGER'), isCashier: roleCodes.has('CASHIER'), roleCodes: Array.from(roleCodes) };

        return { profile: profile || null, companies, stores, globalRole, capabilities };
    }

    /* =========================================================================
       WORKFLOW D'INSCRIPTION & GESTION GÉRANT/CAISSIER
       ========================================================================= */

    static async requestAdminRegistration({ vcLastName, vcFirstName, vcEmail, vcPhoneNumber, password, vcCompanyCode, vcCompanyName }) {
        if (!password) throw new Error('Le mot de passe est obligatoire.');
        const vcPasswordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        
        const pool = await poolPromise;
        try {
            const result = await pool.request()
                .input('vcLastName',     sql.VarChar(50),  UserDAL._cleanString(vcLastName))
                .input('vcFirstName',    sql.VarChar(50),  UserDAL._cleanString(vcFirstName))
                .input('vcEmail',        sql.VarChar(100), UserDAL._cleanString(vcEmail, { lower: true }))
                .input('vcPhoneNumber',  sql.VarChar(20),  UserDAL._cleanString(vcPhoneNumber))
                .input('vcPasswordHash', sql.VarChar(255), vcPasswordHash)
                .input('vcCompanyCode',  sql.VarChar(20),  UserDAL._cleanString(vcCompanyCode))
                .input('vcCompanyName',  sql.VarChar(50),  UserDAL._cleanString(vcCompanyName))
                .execute('dbo.usp_RequestAdminRegistration');

            return (result.recordset && result.recordset[0]) || null;
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async getPendingAdminRegistrations() {
        const pool = await poolPromise;
        try {
            const result = await pool.request().execute('dbo.usp_GetPendingAdminRegistrations');
            return result.recordset || [];
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async processAdminRegistration({ registrationRequestId, superAdminUserId, isApproved, vcRejectionReason = null }) {
        const pool = await poolPromise;
        try {
            const result = await pool.request()
                .input('registrationRequestId', sql.Int,          registrationRequestId)
                .input('superAdminUserId',      sql.Int,          superAdminUserId)
                .input('isApproved',            sql.Bit,          isApproved ? 1 : 0)
                .input('vcRejectionReason',     sql.VarChar(200), vcRejectionReason)
                .execute('dbo.usp_ProcessAdminRegistration');

            return (result.recordset && result.recordset[0]) || null;
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async findPendingRegistrationByUserId(userId) {
        UserDAL._requirePositiveInt(userId, 'userId');
        const pool = await poolPromise;
        try {
            const result = await pool.request()
                .input('userId', sql.Int, userId)
                .query(`
                    SELECT TOP 1 registrationRequestId, userId, 
                        (SELECT vcCode FROM dbo.tblRefRegistrationRequestStatus WHERE registrationRequestStatusId = r.registrationRequestStatusId) AS vcStatus
                    FROM dbo.tblAdminRegistrationRequest r
                    WHERE userId = @userId AND btEnabled = 1
                      AND registrationRequestStatusId = (SELECT registrationRequestStatusId FROM dbo.tblRefRegistrationRequestStatus WHERE vcCode = 'PENDING')
                    ORDER BY dtRequestedAt DESC
                `);
            return (result.recordset && result.recordset[0]) || null;
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async getDeletedUsers() {
        const pool = await poolPromise;
        try {
            const result = await pool.request().execute('dbo.usp_GetDeletedUsers');
            return result.recordset || [];
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    static async createManagerAndAssign(data) {
        const { vcLastName, vcFirstName, vcEmail, vcPhoneNumber, password, storeId, createdByUserId } = data;

        if (!vcLastName?.trim()) throw new Error('Le nom est obligatoire.');
        if (!password) throw new Error('Le mot de passe est obligatoire.');
        if (!storeId) throw new Error('storeId est obligatoire.');
        if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

        const vcPasswordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const pool = await poolPromise;

        try {
            const result = await pool.request()
                .input('createdByUserId', sql.Int,          createdByUserId)
                .input('storeId',         sql.Int,          storeId)
                .input('vcLastName',      sql.VarChar(50),  UserDAL._cleanString(vcLastName))
                .input('vcPasswordHash',  sql.VarChar(255), vcPasswordHash)
                .input('vcFirstName',     sql.VarChar(50),  UserDAL._cleanString(vcFirstName))
                .input('genderId',        sql.Int,          null)
                .input('vcEmail',         sql.VarChar(100), UserDAL._cleanString(vcEmail, { lower: true }))
                .input('vcPhoneNumber',   sql.VarChar(20),  UserDAL._cleanString(vcPhoneNumber))
                .input('vcAddress',       sql.VarChar(150), null)
                .input('vcPhotoUrl',      sql.VarChar(255), null)
                .execute('dbo.usp_CreateManagerByAdmin');

            return (result.recordset && result.recordset[0]) || null;
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }

    /**
     * ✅ NOUVELLE MÉTHODE : Crée un caissier via usp_CreateCashierForManager
     */
    static async createCashierAndAssign(data) {
        const { vcLastName, vcFirstName, vcEmail, password, storeId, createdByUserId } = data;

        if (!vcLastName?.trim()) throw new Error('Le nom est obligatoire.');
        if (!password) throw new Error('Le mot de passe est obligatoire.');
        if (!storeId) throw new Error('storeId est obligatoire.');
        if (!createdByUserId) throw new Error('createdByUserId est obligatoire.');

        const vcPasswordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const pool = await poolPromise;

        try {
            const result = await pool.request()
                .input('createdByUserId', sql.Int,          createdByUserId)
                .input('storeId',         sql.Int,          storeId)
                .input('vcLastName',      sql.VarChar(50),  UserDAL._cleanString(vcLastName))
                .input('vcPasswordHash',  sql.VarChar(255), vcPasswordHash)
                .input('genderId',        sql.Int,          null)
                .input('vcFirstName',     sql.VarChar(50),  UserDAL._cleanString(vcFirstName))
                .input('vcEmail',         sql.VarChar(100), UserDAL._cleanString(vcEmail, { lower: true }))
                .input('vcPhoneNumber',   sql.VarChar(20),  null)
                .input('vcAddress',       sql.VarChar(150), null)
                .input('vcPhotoUrl',      sql.VarChar(255), null)
                .execute('dbo.usp_CreateCashierForManager');

            return (result.recordset && result.recordset[0]) || null;
        } catch (err) {
            throw UserDAL._mapSqlError(err);
        }
    }
}

module.exports = UserDAL;