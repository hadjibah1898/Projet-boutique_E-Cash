/**
 * @file dashboardRoutes.js
 * @description Routes du tableau de bord (statistiques globales).
 * @module Routes/Dashboard
 */

const router = require('express').Router();
const ctrl = require('../controllers/dashboardController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.use(protect);

// ✅ AJOUT DE 'MANAGER' : Le gérant peut maintenant accéder à ses stats
router.get('/stats', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.getStats);

// Route pour le Dashboard SuperAdmin (existante)
router.get('/superadmin', requireRole('SUPER_ADMIN'), ctrl.getSuperAdminStats);

module.exports = router;