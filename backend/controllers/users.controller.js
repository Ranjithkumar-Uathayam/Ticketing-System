const { sql, poolPromise } = require('../db');

const mapUser = (u) => ({
  id:           u.Id,
  name:         u.Name,
  username:     u.Username,
  contactEmail: u.ContactEmail,
  roleId:       u.RoleId,
  category:     u.Category ?? null,   // ← NEW
});

exports.getAllUsers = async (req, res) => {
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .query('SELECT Id, Name, Username, ContactEmail, RoleId, Category FROM Users ORDER BY Name');
    res.status(200).json(result.recordset.map(mapUser));
  } catch (err) {
    console.error('[users.getAllUsers]', err);
    res.status(500).json({ message: 'Failed to retrieve users.' });
  }
};

exports.createUser = async (req, res) => {
  const { name, username, contactEmail, password, roleId, category } = req.body;

  try {
    const passwordHash = password; // TODO: bcrypt.hash(password, 12)

    const pool   = await poolPromise;
    const result = await pool.request()
      .input('name',         sql.NVarChar, name)
      .input('username',     sql.NVarChar, username)
      .input('contactEmail', sql.NVarChar, contactEmail ?? null)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('roleId',       sql.Int,      roleId)
      .input('category',     sql.NVarChar, category ?? null)      // ← NEW
      .query(`
        INSERT INTO Users (Name, Username, ContactEmail, PasswordHash, RoleId, Category)
        OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Username,
               INSERTED.ContactEmail, INSERTED.RoleId, INSERTED.Category
        VALUES (@name, @username, @contactEmail, @passwordHash, @roleId, @category)
      `);

    res.status(201).json(mapUser(result.recordset[0]));
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }
    console.error('[users.createUser]', err);
    res.status(500).json({ message: 'Failed to create user.' });
  }
};

exports.updateUser = async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { roleId, category } = req.body;

  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id',       sql.Int,      userId)
      .input('roleId',   sql.Int,      roleId)
      .input('category', sql.NVarChar, category ?? null)           // ← NEW
      .query(`
        UPDATE Users
        SET RoleId = @roleId, Category = @category
        OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Username,
               INSERTED.ContactEmail, INSERTED.RoleId, INSERTED.Category
        WHERE Id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json(mapUser(result.recordset[0]));
  } catch (err) {
    console.error('[users.updateUser]', err);
    res.status(500).json({ message: 'Failed to update user.' });
  }
};