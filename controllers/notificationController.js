/**
 * @file notificationController.js
 * @description Notifications de l'utilisateur connecté (tblNotification).
 * @module Controllers/Notification
 */

const NotificationDAL = require('../dal/notificationDAL');
const asyncHandler = require('../middleware/asyncHandler');

exports.getMine = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread === '1';
  res.json({ success: true, data: await NotificationDAL.getByUserId(req.user.userId, { unreadOnly }) });
});

exports.countUnread = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { unreadCount: await NotificationDAL.countUnread(req.user.userId) } });
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const ok = await NotificationDAL.markAsRead(req.params.notificationId, req.user.userId);
  if (!ok) return res.status(404).json({ success: false, message: 'Notification introuvable ou déjà lue.' });
  res.json({ success: true, message: 'Notification marquée comme lue.' });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  const count = await NotificationDAL.markAllAsRead(req.user.userId);
  res.json({ success: true, data: { updated: count } });
});

exports.delete = asyncHandler(async (req, res) => {
  const ok = await NotificationDAL.delete(req.params.notificationId, req.user.userId);
  if (!ok) return res.status(404).json({ success: false, message: 'Notification introuvable.' });
  res.json({ success: true, message: 'Notification supprimée.' });
});
