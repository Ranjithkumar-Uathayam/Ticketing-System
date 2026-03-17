const express    = require('express');
const rateLimit  = require('express-rate-limit');
const router     = express.Router();
const authController = require('../controllers/auth.controller');
const { validateLogin } = require('../validators');

// Strict rate limit on login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, validateLogin, authController.login);

module.exports = router;