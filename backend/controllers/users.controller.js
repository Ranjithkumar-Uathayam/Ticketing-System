const { sql, poolPromise } = require('../db');

const mapUserToCamelCase = (user) => ({
    id: user.Id,
    name: user.Name,
    username: user.Username,
    contactEmail: user.ContactEmail,
    roleId: user.RoleId,
});

exports.getAllUsers = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query('SELECT Id, Name, Username, ContactEmail, RoleId FROM Users');
    res.status(200).json(result.recordset.map(mapUserToCamelCase));
  } catch (err) {
    res.status(500).send({ message: 'Failed to retrieve users', error: err.message });
  }
};

exports.createUser = async (req, res) => {
  const { name, username, contactEmail, password, roleId } = req.body;
  const passwordHash = password;

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('name',         sql.NVarChar, name)
      .input('username',     sql.NVarChar, username)
      .input('contactEmail', sql.NVarChar, contactEmail)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('roleId',       sql.Int,      roleId)
      .query(`
        INSERT INTO Users (Name, Username, ContactEmail, PasswordHash, RoleId)
        OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Username, INSERTED.ContactEmail, INSERTED.RoleId
        VALUES (@name, @username, @contactEmail, @passwordHash, @roleId)
      `);

    res.status(201).json(mapUserToCamelCase(result.recordset[0]));
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).send({ message: 'Username or email already exists.' });
    }
    res.status(500).send({ message: 'Failed to create user', error: err.message });
  }
};

exports.updateUser = async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { roleId } = req.body;

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id',     sql.Int, userId)
      .input('roleId', sql.Int, roleId)
      .query(`
        UPDATE Users
        SET RoleId = @roleId
        OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Username, INSERTED.ContactEmail, INSERTED.RoleId
        WHERE Id = @id
      `);

    if (result.recordset.length > 0) {
      res.status(200).json(mapUserToCamelCase(result.recordset[0]));
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (err) {
    res.status(500).send({ message: 'Failed to update user', error: err.message });
  }
};