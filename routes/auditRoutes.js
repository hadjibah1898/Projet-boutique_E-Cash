/**
 * @file auditRoutes.js
 * @description Routes du journal d'audit (lecture seule).
 * @module Routes/AuditLog
 */

const router = require('express').Router();
const ctrl = require('../controllers/auditController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.getLogs);

module.exports = router;
