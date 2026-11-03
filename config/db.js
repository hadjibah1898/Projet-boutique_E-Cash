/**
 * @file db.js
 * @description Configuration du pool de connexions SQL Server (mssql).
 * @module Config/DB
 */

const sql = require('mssql');


const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'GestionsBoutiques',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: (process.env.DB_ENCRYPT || 'false') === 'true',
    trustServerCertificate: (process.env.DB_TRUST_SERVER_CERT || 'true') === 'true'
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: 0,
    idleTimeoutMillis: 30000
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then((pool) => {
    console.log('[DB] Connecté à SQL Server :', config.database);
    return pool;
  })
  .catch((err) => {
    console.error('[DB] Échec de connexion SQL Server :', err.message);
    throw err;
  });

// Évite le crash du process au démarrage si SQL Server est injoignable :
// l'erreur reste propagée aux appelants (await poolPromise) sans rejection non gérée.
poolPromise.catch(() => {});


module.exports = { sql, poolPromise, config };

