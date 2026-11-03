/**
 * @file userRoutes.js
 * @description Routes utilisateurs.
 * @module Routes/User
 */

const router = require('express').Router();
const ctrl = require('../controllers/userController');
const { protect, requireRole } = require('../middleware/authMiddleware');

// Toutes les routes ci-dessous nécessitent d'être connecté
router.use(protect);

// ✅ CORRECTION : Ouvert au Manager, mais aussi à l'Admin et au SuperAdmin
router.post('/cashiers', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.createCashier);

router.put('/me', ctrl.updateMe);
router.get('/:userId', ctrl.getOne);

// L'activation/désactivation est gérée par SQL, mais on limite l'accès aux admins
router.put('/:userId/active', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.setActive);

router.post('/:userId/company-roles', requireRole('SUPER_ADMIN'), ctrl.assignCompanyRole);
router.post('/:userId/store-roles', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.assignStoreRole);

module.exports = router;