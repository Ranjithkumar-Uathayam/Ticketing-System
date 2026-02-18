
const express = require('express');
const router = express.Router();
const rolesController = require('../controllers/roles.controller');

// GET /api/roles
router.get('/', rolesController.getAllRoles);

// POST /api/roles
router.post('/', rolesController.createRole);

// PUT /api/roles/:id
router.put('/:id', rolesController.updateRole);

module.exports = router;
