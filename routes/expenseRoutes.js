/**
 * @file expenseRoutes.js
 * @description Routes dépenses.
 * @module Routes/Expense
 */

const router = require('express').Router();
const ctrl = require('../controllers/expenseController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { requireStoreAccess } = require('../middleware/storeAccess');
const { checkCaisseOuverte } = require('../middleware/cashSessionGuard');

router.use(protect);

router.get('/', ctrl.list);

router.get('/company/:companyId/categories', ctrl.listCategories);
router.post('/categories', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.createCategory);

router.get('/store/:storeId', requireStoreAccess, ctrl.getByStore);
router.get('/session/:cashSessionId', ctrl.getBySession);
router.post('/', requireRole('ADMIN', 'MANAGER', 'CASHIER'), checkCaisseOuverte, ctrl.create);
router.post('/:expenseId/approve', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.approve);

module.exports = router;
