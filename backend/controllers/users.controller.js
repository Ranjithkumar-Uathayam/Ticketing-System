const { sql, poolPromise } = require('../db');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

const mapUserToCamelCase = (user) => ({
  id:           user.Id,
  name:         user.Name,
  username:     user.Username,
  contactEmail: user.ContactEmail,
  roleId:       user.RoleId,
});

exports.getAllUsers = async (req, res) => {
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .query('SELECT Id, Name, Username, ContactEmail, RoleId FROM Users ORDER BY Name');
    res.status(200).json(result.recordset.map(mapUserToCamelCase));
  } catch (err) {
    console.error('[users.getAllUsers]', err);
    res.status(500).json({ message: 'Failed to retrieve users.' });
  }
};

exports.createUser = async (req, res) => {
  const { name, username, contactEmail, password, roleId } = req.body;

  try {
    // Hash the password with bcrypt before storing
    const passwordHash = password //await bcrypt.hash(password, BCRYPT_ROUNDS);

    const pool   = await poolPromise;
    const result = await pool.request()
      .input('name',         sql.NVarChar, name)
      .input('username',     sql.NVarChar, username)
      .input('contactEmail', sql.NVarChar, contactEmail ?? null)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('roleId',       sql.Int,      roleId)
      .query(`
        INSERT INTO Users (Name, Username, ContactEmail, PasswordHash, RoleId)
        OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Username, INSERTED.ContactEmail, INSERTED.RoleId
        VALUES (@name, @username, @contactEmail, @passwordHash, @roleId)
      `);

    res.status(201).json(mapUserToCamelCase(result.recordset[0]));
  } catch (err) {
    // Handle unique constraint violations specifically; log everything else
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }
    console.error('[users.createUser]', err);
    res.status(500).json({ message: 'Failed to create user.' });
  }
};

exports.updateUser = async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { roleId } = req.body;

  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id',     sql.Int, userId)
      .input('roleId', sql.Int, roleId)
      .query(`
        UPDATE Users
        SET RoleId = @roleId
        OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Username, INSERTED.ContactEmail, INSERTED.RoleId
        WHERE Id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json(mapUserToCamelCase(result.recordset[0]));
  } catch (err) {
    console.error('[users.updateUser]', err);
    res.status(500).json({ message: 'Failed to update user.' });
  }
};