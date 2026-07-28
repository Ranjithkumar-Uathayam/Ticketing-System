// backend/controllers/qz.controller.js
//
// QZ Tray digital-signature handshake (https://qz.io/wiki/2.1-signing-messages).
// The private key never leaves this server; the frontend only ever sees the
// public certificate and the base64 signatures produced here.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS_DIR = path.join(__dirname, '..', 'qz', 'keys');

const CERT_PATH = process.env.QZ_CERT_PATH || path.join(KEYS_DIR, 'digital-certificate.txt');
const KEY_PATH  = process.env.QZ_PRIVATE_KEY_PATH || path.join(KEYS_DIR, 'private-key.pem');

let certificate = null;
let privateKey  = null;

try {
  certificate = fs.readFileSync(CERT_PATH, 'utf8');
  privateKey  = fs.readFileSync(KEY_PATH, 'utf8');
} catch (err) {
  console.error(
    '[qz] Could not load the QZ Tray certificate/private key — /api/qz endpoints will 503 ' +
    `until these exist:\n  ${CERT_PATH}\n  ${KEY_PATH}\nSee backend/qz/README.md. (${err.message})`
  );
}

// GET /api/qz/certificate
exports.getCertificate = (req, res) => {
  if (!certificate) {
    return res.status(503).json({ message: 'QZ Tray certificate is not configured on the server.' });
  }
  res.type('text/plain').send(certificate);
};

// POST /api/qz/sign   body: { request: "<string QZ Tray asks the client to sign>" }
exports.signMessage = (req, res) => {
  const toSign = req.body?.request;
  if (typeof toSign !== 'string' || !toSign.length) {
    return res.status(400).json({ message: 'request field (string) is required.' });
  }
  if (!privateKey) {
    return res.status(503).json({ message: 'QZ Tray private key is not configured on the server.' });
  }
  try {
    const signer = crypto.createSign('SHA512');
    signer.update(toSign);
    signer.end();
    const signature = signer.sign(privateKey, 'base64');
    res.json({ signature });
  } catch (err) {
    console.error('[qz.signMessage]', err);
    res.status(500).json({ message: 'Failed to sign QZ Tray request.', error: err.message });
  }
};
