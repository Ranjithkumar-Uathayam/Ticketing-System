const jwt = require('jsonwebtoken');

/**
 * Middleware: authenticate
 * Expects:  Authorization: Bearer <token>
 * Attaches: req.user = { id, username, roleId }
 */
function authenticate(req, res, next) {
    console.log("**********req.headers",req.headers['Authorization'])
    const authHeader = req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication required.' });
    }

    const token = authHeader.slice(7); // strip "Bearer "
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, username, roleId, iat, exp }
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
}

/**
 * Middleware factory: requireRole(...roleNames)
 * Must be used AFTER authenticate.
 * Example: router.delete('/:id', authenticate, requireRole('Admin'), ctrl.remove)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.roleName)) {
      return res.status(403).json({ message: 'Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };