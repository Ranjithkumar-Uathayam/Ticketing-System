const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/label-print-log.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.post('/', ctrl.create);
router.get('/', ctrl.getRecent);

module.exports = router;
