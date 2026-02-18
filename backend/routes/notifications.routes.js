const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');

// GET /api/notifications/:userId
router.get('/:userId', notificationsController.getNotificationsForUser);

// POST /api/notifications/read/:userId
router.post('/read/:userId', notificationsController.markNotificationsAsRead);

// DELETE /api/notifications/:userId
router.delete('/:userId', notificationsController.deleteNotificationsForUser);

module.exports = router;