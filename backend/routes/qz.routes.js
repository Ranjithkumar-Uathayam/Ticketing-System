// backend/routes/qz.routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/qz.controller');

// Intentionally NOT behind the JWT `authenticate` middleware — this mirrors
// QZ Tray's own reference cert/sign server. Trust here comes from the RSA
// signature itself, not a user session, and the handshake must still work
// even if the Angular app's auth token has expired.
router.get('/certificate', ctrl.getCertificate);
router.post('/sign',       ctrl.signMessage);

module.exports = router;
