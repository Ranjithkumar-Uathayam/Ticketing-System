const { body, param, validationResult } = require('express-validator');

/**
 * Middleware: handleValidation
 * Call this as the last validator in a chain to return 422 on errors.
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  next();
}

// ─── Auth ──────────────────────────────────────────────────────────────────

const validateLogin = [
  body('username').trim().notEmpty().withMessage('Username is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
  handleValidation,
];

// ─── Users ────────────────────────────────────────────────────────────────

const validateCreateUser = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('username').trim().notEmpty().withMessage('Username is required.')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3–50 characters.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('roleId').isInt({ min: 1 }).withMessage('A valid roleId is required.'),
  handleValidation,
];

const validateUpdateUser = [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID.'),
  body('roleId').isInt({ min: 1 }).withMessage('A valid roleId is required.'),
  handleValidation,
];

// ─── Tickets ─────────────────────────────────────────────────────────────

const VALID_STATUSES   = ['New', 'Open', 'In Progress', 'Resolved', 'Closed', 'Reopened'];
const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const VALID_CATEGORIES = ['Hardware', 'Software', 'ASRS'];

const validateCreateTicket = [
  body('title').trim().notEmpty().withMessage('Title is required.')
    .isLength({ max: 200 }).withMessage('Title must be ≤200 characters.'),
  body('description').trim().notEmpty().withMessage('Description is required.'),
  body('priority').isIn(VALID_PRIORITIES).withMessage('Invalid priority.'),
  body('reporterId').isInt({ min: 1 }).withMessage('A valid reporterId is required.'),
  body('category').optional({ nullable: true }).isIn(VALID_CATEGORIES).withMessage('Invalid category.'),
  body('assigneeId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid assigneeId.'),
  handleValidation,
];

const validateUpdateTicket = [
  param('id').isInt({ min: 1 }).withMessage('Invalid ticket ID.'),
  body('title').trim().notEmpty().withMessage('Title is required.')
    .isLength({ max: 200 }).withMessage('Title must be ≤200 characters.'),
  body('description').trim().notEmpty().withMessage('Description is required.'),
  body('status').isIn(VALID_STATUSES).withMessage('Invalid status.'),
  body('priority').isIn(VALID_PRIORITIES).withMessage('Invalid priority.'),
  body('category').optional({ nullable: true }).isIn(VALID_CATEGORIES).withMessage('Invalid category.'),
  body('assigneeId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid assigneeId.'),
  handleValidation,
];

// ─── Roles ────────────────────────────────────────────────────────────────

const validateCreateRole = [
  body('name').trim().notEmpty().withMessage('Role name is required.')
    .isLength({ max: 50 }).withMessage('Role name must be ≤50 characters.'),
  handleValidation,
];

const validateUpdateRole = [
  param('id').isInt({ min: 1 }).withMessage('Invalid role ID.'),
  body('name').trim().notEmpty().withMessage('Role name is required.')
    .isLength({ max: 50 }).withMessage('Role name must be ≤50 characters.'),
  handleValidation,
];

module.exports = {
  validateLogin,
  validateCreateUser,
  validateUpdateUser,
  validateCreateTicket,
  validateUpdateTicket,
  validateCreateRole,
  validateUpdateRole,
};