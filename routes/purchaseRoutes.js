/**
 * @file purchaseRoutes.js
 * @description Routes approvisionnements.
 * @module Routes/Purchase
 */

const router = require('express').Router();
const ctrl = require('../controllers/purchaseController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/store/:storeId', ctrl.getByStore);
router.get('/:purchaseId/details', ctrl.getDetails);
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.create);
router.post('/:purchaseId/receive', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.receive);
router.post('/:purchaseId/cancel', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.cancel);

module.exports = router;
