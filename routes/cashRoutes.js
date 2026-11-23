/**
 * @file cashRoutes.js
 * @description Routes caisses, sessions et rapports de caisse.
 */
const router = require('express').Router();
const ctrl = require('../controllers/cashController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { requireStoreAccess, requireOwnCashSession } = require('../middleware/storeAccess');
const { checkSingleOpenSession, checkManagerCaisseOuverte } = require('../middleware/cashSessionGuard');

router.use(protect);

// ==========================================
// 1. RAPPORTS (ROUTES SPÉCIFIQUES EN PREMIER)
// ==========================================

// Mes rapports (Le gérant voit ses propres clôtures de caisse)
router.get('/reports/me', ctrl.getMyReports); 

// ✅ LA ROUTE QUE REACT CHERCHE
router.post('/reports/:cashReportId/approve', requireRole('ADMIN', 'MANAGER'), checkManagerCaisseOuverte, ctrl.approveReport);
router.post('/reports/:cashReportId/reject', requireRole('ADMIN', 'MANAGER'), checkManagerCaisseOuverte, ctrl.rejectReport);

// Routes spécifiques "Caissiers" (si React les utilise)
router.get('/reports/caissiers', requireRole('MANAGER', 'ADMIN'), ctrl.listCashierReports);
router.post('/reports/caissiers/:cashReportId/approve', requireRole('MANAGER', 'ADMIN'), checkManagerCaisseOuverte, ctrl.approveReport);
router.post('/reports/caissiers/:cashReportId/reject', requireRole('MANAGER', 'ADMIN'), checkManagerCaisseOuverte, ctrl.rejectReport);
router.get('/reports/caissiers/:cashReportId/details', ctrl.getReportDetails);

// Liste globale des rapports
router.get('/reports', ctrl.listReports);

// Route générique des sessions
router.get('/reports/:cashSessionId', ctrl.getReports);

// Route de correction
router.put('/correction', requireRole('ADMIN', 'MANAGER', 'SUPER_ADMIN'), ctrl.correctReport);
router.get('/reports-detail/:cashReportId', ctrl.getReportDetails);


// ==========================================
// 2. SESSIONS ET CAISSES
// ==========================================
router.get('/status/mine', ctrl.getCashStatus);
router.get('/sessions/mine', ctrl.myOpenSession);
router.get('/sessions/my-history', ctrl.myHistory);
router.get('/sessions/stats/mine', ctrl.getSessionStats);

router.get('/expenses/me', ctrl.getMyExpenses);
router.post('/expenses', ctrl.createExpense);

router.get('/registers/:storeId', requireStoreAccess, ctrl.getRegisters);
router.post('/registers', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.createRegister);

router.get('/sessions/:cashRegisterId', ctrl.getSessions);
router.post('/sessions/open', requireRole('ADMIN', 'MANAGER', 'CASHIER'), requireStoreAccess, checkSingleOpenSession, ctrl.openSession);
router.post('/sessions/close', requireRole('ADMIN', 'MANAGER', 'CASHIER'), ctrl.closeMySession);
router.post('/sessions/:cashSessionId/close', requireRole('ADMIN', 'MANAGER', 'CASHIER'), requireOwnCashSession, ctrl.closeSession);

router.post('/reports', requireRole('ADMIN', 'MANAGER', 'CASHIER'), ctrl.createReport);
router.get('/admin', requireRole('ADMIN', 'SUPER_ADMIN'), ctrl.getCaisseAdmin);

// ============================== TREASURY ACCOUNTS ==============================
router.get('/treasury-accounts', ctrl.getTreasuryAccounts);

module.exports = router;