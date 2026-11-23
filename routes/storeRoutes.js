
/**
 * @file storeRoutes.js
 * @description Routes de gestion des boutiques.
 * @module Routes/Store
 */

const router = require('express').Router();
const ctrl = require('../controllers/storeController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.use(protect);

// Consultation des boutiques
router.get('/company/:companyId', ctrl.getByCompany);
router.get('/:storeId', ctrl.getOne);

// Création et modification
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.create);
router.put('/:storeId', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.update);

// Activation / désactivation logique (aucune suppression de données)
router.patch('/:storeId/deactivate', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.deactivate);
router.patch('/:storeId/activate', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.activate);

// Gestion des utilisateurs d'une boutique
router.get('/:storeId/users', ctrl.listUsers);
router.post('/:storeId/users', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.assignUser);

module.exports = router;
