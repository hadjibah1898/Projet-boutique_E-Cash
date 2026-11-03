/**
 * @file authRoutes.js
 * @description Routes d'authentification.
 * @module Routes/Auth
 */

const router = require('express').Router();
const ctrl = require('../controllers/authController');

const { protect, requireRole } = require('../middleware/authMiddleware');

// Routes publiques
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);

// Route protégée (utilisateur connecté)
router.get('/me', protect, ctrl.me);

// ✅ Notifications
router.get('/notifications', protect, ctrl.getNotifications);
router.get('/all-notifications', protect, ctrl.getAllNotifications);
router.put('/notifications/read-all', protect, ctrl.markAllNotificationsRead);
router.put('/notifications/:id/read', protect, ctrl.markNotificationRead);

// ✅ Liste utilisateurs
router.get('/users', protect, ctrl.getUsers);

// ✅ Workflow utilisateur
router.get('/users/deleted', protect, requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.getDeletedUsers);
router.put('/users/:id', protect, requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.updateUser);
router.put('/users/:id/validate', protect, requireRole('SUPER_ADMIN'), ctrl.validateUser);
router.put('/users/:id/reject', protect, requireRole('SUPER_ADMIN'), ctrl.rejectUser);

// ✅ Création Gérant (Admin uniquement)
router.post('/create-manager', protect, requireRole('ADMIN'), ctrl.createManager);

// ✅ Création Caissier (Gérant et Admin autorisés)
router.post('/create-cashier', protect, requireRole('ADMIN', 'MANAGER'), ctrl.createCashier);

// ✅ Workflow d'inscription
router.get('/admin-registrations/pending', protect, requireRole('SUPER_ADMIN'), ctrl.pendingRegistrations);
router.put('/admin-registrations/:id/process', protect, requireRole('SUPER_ADMIN'), ctrl.processRegistration);

module.exports = router;