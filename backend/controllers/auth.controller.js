// backend/controllers/auth.controller.js  (UPDATED — category included in login response)
const { sql, poolPromise } = require('../db');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT Id, Name, Username, ContactEmail, RoleId, PasswordHash, Category
        FROM Users WHERE Username = @username
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = result.recordset[0];

    const isPasswordValid = password === user.PasswordHash;
    // TODO: replace above with → await bcrypt.compare(password, user.PasswordHash)
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const roleResult = await pool.request()
      .input('roleId', sql.Int, user.RoleId)
      .query('SELECT Name FROM Roles WHERE Id = @roleId');
    const roleName = roleResult.recordset[0]?.Name ?? '';

    const payload = {
      id:       user.Id,
      username: user.Username,
      roleId:   user.RoleId,
      roleName,
      category: user.Category ?? null,   // ← NEW: included in JWT payload
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.status(200).json({
      token,
      user: {
        id:           user.Id,
        name:         user.Name,
        username:     user.Username,
        contactEmail: user.ContactEmail,
        roleId:       user.RoleId,
        category:     user.Category ?? null,   // ← NEW: returned to Angular
      },
    });
  } catch (err) {
    console.error('[auth.login]', err);
    res.status(500).json({ message: 'An error occurred. Please try again.' });
  }
};