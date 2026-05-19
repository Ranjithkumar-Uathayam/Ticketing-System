const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/price-configuration.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/item-master', ctrl.getItemMaster);
router.post('/item-master/import', ctrl.importItemMaster);
router.put('/item-master/:id', ctrl.updateItemMasterItem);

router.get('/', ctrl.getAll);
router.post('/preview', ctrl.preview);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

module.exports = router;
