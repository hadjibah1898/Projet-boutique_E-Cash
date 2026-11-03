/**
 * @file storeRoutes.js
 * @description Routes boutiques.
 * @module Routes/Store
 */

const router = require('express').Router();
const ctrl = require('../controllers/storeController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/company/:companyId', ctrl.getByCompany);
router.get('/:storeId', ctrl.getOne);
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.create);
router.put('/:storeId', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.update);
router.delete('/:storeId', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.remove);

router.get('/:storeId/users', ctrl.listUsers);
router.post('/:storeId/users', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.assignUser);

module.exports = router;
