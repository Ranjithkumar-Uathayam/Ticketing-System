// backend/routes/hw-inventory.routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/hw-inventory.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/',       ctrl.getAll);
router.post('/qz-sign', ctrl.signQzRequest);    // must be before /:id routes
router.get('/:id',    ctrl.getById);
router.post('/:id/label-print-job', ctrl.getLabelPrintJob);
router.post('/:id/print-label', ctrl.printLabel);
router.post('/',      ctrl.create);
router.put('/:id',    ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
