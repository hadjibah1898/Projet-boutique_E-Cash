/**
 * @file customerRoutes.js
 * @description Routes clients.
 * @module Routes/Customer
 */

const router = require('express').Router();
const ctrl = require('../controllers/customerController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { requireStoreAccess } = require('../middleware/storeAccess');

router.use(protect);

// ✅ AJOUT : Route racine pour GET /api/clients (récupérer tous les clients)
router.get('/', ctrl.getAll);

// ✅ ROUTES FIXES (Doivent être déclarées AVANT /:customerId)
router.get('/debts', ctrl.getDebts);
router.get('/debt-history', ctrl.getDebtHistory);
router.get('/debt-evolution', ctrl.getDebtEvolution);
router.get('/search', ctrl.search);

// ✅ ROUTES AVEC PARAMÈTRES
router.get('/company/:companyId', ctrl.getByCompany);

// ✅ NOUVELLE ROUTE : Payer une dette (Doit être avant /:customerId)
router.post('/:customerId/pay-dette', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER'), ctrl.payDette);

// ✅ ROUTES STANDARD PAR ID
router.get('/:customerId', ctrl.getOne);

// ✅ ROUTES DE MODIFICATION
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER'), ctrl.create);
router.put('/:customerId', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.update);
router.delete('/:customerId', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.remove);

module.exports = router;