/**
 * @file notificationRoutes.js
 * @description Routes notifications de l'utilisateur connecté.
 * @module Routes/Notification
 */

const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', ctrl.getMine);
router.get('/unread-count', ctrl.countUnread);
router.post('/:notificationId/read', ctrl.markAsRead);
router.post('/read-all', ctrl.markAllAsRead);
router.delete('/:notificationId', ctrl.delete);

module.exports = router;
