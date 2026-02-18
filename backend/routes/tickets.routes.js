
const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/tickets.controller');

// GET /api/tickets
router.get('/', ticketsController.getAllTickets);

// POST /api/tickets
router.post('/', ticketsController.createTicket);

// PUT /api/tickets/:id
router.put('/:id', ticketsController.updateTicket);

module.exports = router;
