const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/users.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { validateCreateUser, validateUpdateUser } = require('../validators');

router.use(authenticate);

// Any authenticated user can list users (needed for ticket assignment dropdowns)
router.get('/', ctrl.getAllUsers);

// Only admins can create or update users
router.post('/',    requireRole('Admin'), validateCreateUser, ctrl.createUser);
router.put('/:id',  requireRole('Admin'), validateUpdateUser, ctrl.updateUser);

module.exports = router;