/**
 * @file companyRoutes.js
 * @description Routes entreprises.
 * @module Routes/Company
 */

const router = require('express').Router();
const ctrl = require('../controllers/companyController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/mine', ctrl.getMine);
router.get('/', ctrl.getAll);
router.get('/:companyId', ctrl.getOne);
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.create);
router.put('/:companyId', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.update);
router.delete('/:companyId', requireRole('SUPER_ADMIN'), ctrl.remove);

module.exports = router;
