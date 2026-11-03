/**
 * @file cashRoutes.js
 * @description Routes caisses, sessions et rapports de caisse.
 * @module Routes/Cash
 */

const router = require('express').Router();
const ctrl = require('../controllers/cashController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { requireStoreAccess, requireOwnCashSession } = require('../middleware/storeAccess');
const { checkSingleOpenSession, checkManagerCaisseOuverte } = require('../middleware/cashSessionGuard');

router.use(protect);

// ✅ 1. ROUTES SPÉCIFIQUES EN PREMIER (pour éviter les conflits avec les :paramètres)
router.get('/reports/me', ctrl.listReports);
router.get('/reports', ctrl.listReports);
router.get('/status/mine', ctrl.getCashStatus);
router.get('/sessions/mine', ctrl.myOpenSession);
router.get('/sessions/my-history', ctrl.myHistory);
router.get('/sessions/stats/mine', ctrl.getSessionStats);

// ✅ 2. ROUTES POUR LES DEPENSES
router.get('/expenses/me', ctrl.getMyExpenses);
router.post('/expenses', ctrl.createExpense);

// ✅ 3. ROUTES AVEC PARAMÈTRES ENSUITE
router.get('/registers/:storeId', requireStoreAccess, ctrl.getRegisters);
router.post('/registers', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.createRegister);

router.get('/sessions/:cashRegisterId', ctrl.getSessions);
router.post('/sessions/open', requireRole('ADMIN', 'MANAGER', 'CASHIER'), requireStoreAccess, checkSingleOpenSession, ctrl.openSession);
router.post('/sessions/close', requireRole('ADMIN', 'MANAGER', 'CASHIER'), ctrl.closeMySession);
router.post('/sessions/:cashSessionId/close', requireRole('ADMIN', 'MANAGER', 'CASHIER'), requireOwnCashSession, ctrl.closeSession);

router.get('/reports/:cashSessionId', ctrl.getReports);
router.get('/reports-detail/:cashReportId', ctrl.getReportDetails);

router.get('/admin', requireRole('ADMIN', 'SUPER_ADMIN'), ctrl.getCaisseAdmin);

router.post('/reports', requireRole('ADMIN', 'MANAGER', 'CASHIER'), ctrl.createReport);
router.post('/reports/:cashReportId/approve', requireRole('ADMIN', 'MANAGER'), checkManagerCaisseOuverte, ctrl.approveReport);

// ⚠️ CORRECTION : On utilise ctrl.rejectReport et non approveReport
router.post('/reports/:cashReportId/reject', requireRole('ADMIN', 'MANAGER'), checkManagerCaisseOuverte, ctrl.rejectReport);

module.exports = router;