const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/tickets.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateCreateTicket, validateUpdateTicket } = require('../validators');

// All ticket routes require a valid JWT
router.use(authenticate);

router.get('/',     ctrl.getAllTickets);
router.get('/:id',  ctrl.getTicketById);
router.post('/',    validateCreateTicket, ctrl.createTicket);
router.put('/:id',  validateUpdateTicket, ctrl.updateTicket);

module.exports = router;