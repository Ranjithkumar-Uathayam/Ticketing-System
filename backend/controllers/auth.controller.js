const { sql, poolPromise } = require('../db');

exports.login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT * FROM Users WHERE Username = @username');

    if (result.recordset.length === 0) {
      return res.status(401).send({ message: 'Invalid credentials' });
    }
  
    const user = result.recordset[0];

    // FIXME: This is an insecure password check. In a real production environment,
    // you MUST use a strong hashing algorithm like bcrypt to store and compare passwords.
    // 1. When creating a user, hash the password: `const hashedPassword = await bcrypt.hash(password, 10);`
    // 2. In this login function, compare the hash: `const isValid = await bcrypt.compare(password, user.PasswordHash);`
    const isPasswordValid = (password === user.PasswordHash);

    if (isPasswordValid) {
      const userToSend = {
        id: user.Id,
        name: user.Name,
        username: user.Username,
        contactEmail: user.ContactEmail,
        roleId: user.RoleId,
      };
      res.status(200).json(userToSend);
    } else {
      res.status(401).send({ message: 'Invalid credentials' });
    }
  } catch (err) {
    console.log('Database query error:', err);
    res.status(500).send({ message: 'Error during authentication', error: err.message });
  }
};