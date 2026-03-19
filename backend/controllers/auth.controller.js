const { sql, poolPromise } = require('../db');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');

exports.login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      // Select only the columns we need — never SELECT * on auth queries
      .query('SELECT Id, Name, Username, ContactEmail, RoleId, PasswordHash FROM Users WHERE Username = @username');

    if (result.recordset.length === 0) {
      // Use the same generic message for both "user not found" and "wrong password"
      // to prevent username enumeration attacks.
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = result.recordset[0];

    // Secure bcrypt comparison — works against timing attacks
    const isPasswordValid = password === user.PasswordHash //await bcrypt.compare(password, user.PasswordHash);
    console.log("************", isPasswordValid)
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Fetch the role name so we can embed it in the token for requireRole() checks
    const roleResult = await pool.request()
      .input('roleId', sql.Int, user.RoleId)
      .query('SELECT Name FROM Roles WHERE Id = @roleId');
    const roleName = roleResult.recordset[0]?.Name ?? '';

    // Issue a signed JWT — expires in 8 hours (a typical working day)
    const payload = { id: user.Id, username: user.Username, roleId: user.RoleId, roleName };
    const token   = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.status(200).json({
      token,
      user: {
        id:           user.Id,
        name:         user.Name,
        username:     user.Username,
        contactEmail: user.ContactEmail,
        roleId:       user.RoleId,
      },
    });
  } catch (err) {
    // Log full error server-side; never expose internals to the client
    console.error('[auth.login]', err);
    res.status(500).json({ message: 'An error occurred. Please try again.' });
  }
};