require('dotenv').config();
const { sql, poolPromise } = require('./config/db');

async function runTests() {
    console.log("🚀 Démarrage des tests des procédures stockées...\n");
    let pool;

    try {
        pool = await poolPromise;
        
        // =====================================================================
        // TEST 1 : Référentiels (Rôles)
        // =====================================================================
        try {
            const refResult = await pool.request()
                .input('refKey', sql.VarChar, 'role')
                .execute('usp_GetAllReferences');
            console.log(`✅ Test 1 (Référentiel) : ${refResult.recordset.length} rôles trouvés.`);
        } catch (err) {
            console.error(`❌ Test 1 (Référentiel) Échoué : ${err.message}`);
        }

        // =====================================================================
        // TEST 2 : Authentification (Recherche SuperAdmin)
        // =====================================================================
        try {
            const authResult = await pool.request()
                .input('vcEmail', sql.VarChar, 'superadmin@monapp.com')
                .input('vcPhoneNumber', sql.VarChar, null)
                .execute('usp_FindUserByLoginIdentifier');
            
            if (authResult.recordset.length > 0) {
                console.log(`✅ Test 2 (Auth) : SuperAdmin trouvé (ID: ${authResult.recordset[0].userId}).`);
            } else {
                console.log("⚠️ Test 2 (Auth) : Aucun SuperAdmin trouvé. (Avez-vous créé le compte unique ?)");
            }
        } catch (err) {
            console.error(`❌ Test 2 (Auth) Échoué : ${err.message}`);
        }

        // =====================================================================
        // TEST 3 : Écriture dans le journal d'audit
        // =====================================================================
        try {
            await pool.request()
                .input('userId', sql.Int, null) // NULL autorisé
                .input('companyId', sql.Int, null)
                .input('storeId', sql.Int, null)
                .input('vcActionName', sql.VarChar, 'TEST_AUTOMATIQUE')
                .input('tableName', sql.VarChar, 'tblUser')
                .input('vcRecordId', sql.VarChar, '999')
                .execute('usp_CreateAuditLog');
            console.log("✅ Test 3 (Audit) : Entrée ajoutée avec succès dans le journal.");
        } catch (err) {
            console.error(`❌ Test 3 (Audit) Échoué : ${err.message}`);
        }

        // =====================================================================
        // TEST 4 : Création d'un compte de trésorerie
        // =====================================================================
        try {
            // On cherche une entreprise et un type de compte existants
            const companyRes = await pool.request().query("SELECT TOP 1 companyId FROM tblCompany");
            const typeRes = await pool.request().query("SELECT TOP 1 treasuryAccountTypeId FROM tblRefTreasuryAccountType");
            
            if (companyRes.recordset.length > 0 && typeRes.recordset.length > 0) {
                const cId = companyRes.recordset[0].companyId;
                const tId = typeRes.recordset[0].treasuryAccountTypeId;
                
                const createAccount = await pool.request()
                    .input('companyId', sql.Int, cId)
                    .input('treasuryAccountTypeId', sql.Int, tId)
                    .input('vcAccountName', sql.VarChar, 'Caisse de Test Automatique')
                    .execute('usp_CreateTreasuryAccount');
                console.log(`✅ Test 4 (Trésorerie) : Compte créé (ID: ${createAccount.recordset[0].treasuryAccountId}).`);
            } else {
                console.log("⚠️ Test 4 (Trésorerie) : Impossible de tester, aucune entreprise ou type de compte en base.");
            }
        } catch (err) {
            console.error(`❌ Test 4 (Trésorerie) Échoué : ${err.message}`);
        }

        console.log("\n🏁 Fin des tests.");

    } catch (globalErr) {
        console.error("❌ Erreur fatale :", globalErr.message);
    } finally {
        if (pool) await sql.close();
        process.exit(0);
    }
}

runTests();