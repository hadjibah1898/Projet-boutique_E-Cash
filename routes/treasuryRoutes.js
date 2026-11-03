/**
 * @file treasuryRoutes.js
 * @description Routes trésorerie.
 * @module Routes/Treasury
 */

const router = require('express').Router();
const ctrl = require('../controllers/treasuryController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/accounts/:companyId', ctrl.getAccounts);
router.post('/accounts', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.createAccount);

router.post('/:treasuryAccountId/movements', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.recordMovement);
router.get('/:treasuryAccountId/movements', ctrl.getMovements);

module.exports = router;
