/**
 * @file boutiquesCompatRoutes.js
 * @description Routes de compatibilité /api/boutiques (ancien frontend français).
 * @module Routes/BoutiquesCompat
 */

const router = require('express').Router();
const ctrl = require('../controllers/boutiquesCompatController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.use(protect);

// (sync-codes AVANT /:id pour éviter la collision de préfixe)
router.post('/sync-codes', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.syncCodes);

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.create);
router.put('/:id', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.update);
router.delete('/:id', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.remove);

module.exports = router;
