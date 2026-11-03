/**
 * @file server.js
 * @description Point d'entrée de l'API GestionsBoutiques (Express 5 + mssql).
 * @module Server
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

/* ------------------------------ CORS (frontend React) ------------------------------ */
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Origine refusée : ${origin}`);
    return callback(null, false);
  }
};

/* ------------------------------ Middlewares globaux ------------------------------ */
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

/* ------------------------------ Routes ------------------------------ */
app.get('/', (req, res) => {
  res.json({ success: true, message: 'API GestionsBoutiques opérationnelle.' });
});

// Routes d'authentification et d'utilisateurs
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// Routes de gestion des entreprises et boutiques
app.use('/api/companies', require('./routes/companyRoutes'));
app.use('/api/stores', require('./routes/storeRoutes'));
app.use('/api/boutiques', require('./routes/boutiquesCompatRoutes'));

// Routes de références (genres, rôles, etc.)
app.use('/api/refs', require('./routes/refRoutes'));

// ✅ ROUTES PRODUITS & ARTICLES
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/articles', require('./routes/productRoutes')); 

// ✅ ROUTES FOURNISSEURS (Montage double pour compatibilité FR/EN)
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/fournisseurs', require('./routes/supplierRoutes'));

// ✅ ROUTES MOUVEMENTS (Montage double : /stock et /mouvements)
app.use('/api/stock', require('./routes/stockRoutes'));
app.use('/api/mouvements', require('./routes/stockRoutes'));

// ✅ ROUTES CLIENTS (Montage double pour compatibilité FR/EN)
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/clients', require('./routes/customerRoutes'));

// Autres routes métier
app.use('/api/sales', require('./routes/saleRoutes'));

// ✅ LIGNE CRUCIALE AJOUTÉE ICI :
app.use('/api/ventes', require('./routes/saleRoutes')); 

app.use('/api/purchases', require('./routes/purchaseRoutes'));
app.use('/api/cash', require('./routes/cashRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/treasury', require('./routes/treasuryRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));
app.use('/api/third-party-accounts', require('./routes/thirdPartyAccountRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

/* ------------------------------ 404 ------------------------------ */
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route introuvable : ${req.method} ${req.originalUrl}` });
});

/* ------------------------------ Gestionnaire d'erreurs ------------------------------ */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Erreur]', err);
  const status = err.status || (err.number === 2627 || err.number === 2601 ? 409 : 500);
  res.status(status).json({
    success: false,
    message: err.message || 'Erreur interne du serveur.'
  });
});

/* ------------------------------ Démarrage ------------------------------ */
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`[API] Serveur démarré sur le port ${PORT}`);
});

module.exports = app;