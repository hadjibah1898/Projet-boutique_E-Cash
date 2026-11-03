/**
 * @file thirdPartyAccountRoutes.js
 * @description Routes comptes tiers et paiements de dettes.
 * @module Routes/ThirdPartyAccount
 */

const router = require('express').Router();
const ctrl = require('../controllers/thirdPartyAccountController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { checkCaisseOuverte } = require('../middleware/cashSessionGuard');

router.use(protect);

router.get('/by-customer/:customerId', ctrl.getByCustomer);
router.post('/', requireRole('ADMIN', 'MANAGER'), ctrl.getOrCreate);
router.post('/:thirdPartyAccountId/payments', requireRole('ADMIN', 'MANAGER', 'CASHIER'), checkCaisseOuverte, ctrl.payDebt);
router.get('/:thirdPartyAccountId/payments', ctrl.getDebtHistory);

module.exports = router;
