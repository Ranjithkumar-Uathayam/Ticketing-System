
const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');

// GET /api/users
router.get('/', usersController.getAllUsers);

// POST /api/users
router.post('/', usersController.createUser);

// PUT /api/users/:id
router.put('/:id', usersController.updateUser);

module.exports = router;
