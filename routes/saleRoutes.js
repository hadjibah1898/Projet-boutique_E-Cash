/**
 * @file saleRoutes.js
 * @description Routes ventes.
 * @module Routes/Sale
 */

const router = require('express').Router();
const ctrl = require('../controllers/saleController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { requireStoreAccess } = require('../middleware/storeAccess');
const { checkCaisseOuverte } = require('../middleware/cashSessionGuard');

router.use(protect);

// ✅ LA ROUTE HISTORIQUE DOIT ÊTRE TOUT EN HAUT (avant /:saleId)
router.get('/historique', ctrl.getHistorique);

// Autres routes avec paramètres spécifiques
router.get('/store/:storeId', requireStoreAccess, ctrl.getByStore);
router.get('/session/:cashSessionId', ctrl.getBySession);

// ⚠️ Cette route attrape tout ce qui ressemble à un ID, on la met en dessous
router.get('/:saleId', ctrl.getOne);

// SUPER_ADMIN n'effectue pas de ventes. MANAGER/CASHIER/ADMIN doivent avoir
// leur session de caisse OPEN (injectée dans req.cashSession).
router.post('/', requireRole('ADMIN', 'MANAGER', 'CASHIER'), requireStoreAccess, checkCaisseOuverte, ctrl.create);
router.post('/:saleId/finalize', requireRole('ADMIN', 'MANAGER', 'CASHIER'), ctrl.finalize);
router.post('/:saleId/payments', requireRole('ADMIN', 'MANAGER', 'CASHIER'), checkCaisseOuverte, ctrl.addPayment);
router.post('/:saleId/cancel', requireRole('ADMIN', 'MANAGER', 'CASHIER'), ctrl.cancel);

module.exports = router;