const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/notifications.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/:userId',          ctrl.getNotificationsForUser);
router.post('/read/:userId',    ctrl.markNotificationsAsRead);
router.delete('/:userId',       ctrl.deleteNotificationsForUser);

module.exports = router;