const { sql, poolPromise } = require('../db');

// Helper: fetch permissions array for a role by ID
async function getRolePermissions(pool, roleId) {
  const result = await pool.request()
    .input('roleId', sql.Int, roleId)
    .query(`
      SELECT p.ScreenName
      FROM RolePermissions rp
      JOIN Permissions p ON rp.PermissionId = p.Id
      WHERE rp.RoleId = @roleId
    `);
  return result.recordset.map(r => r.ScreenName);
}

// Helper: resolve a permission name to its DB Id
async function getPermissionId(pool, screenName) {
  const result = await pool.request()
    .input('screenName', sql.NVarChar, screenName)
    .query('SELECT Id FROM Permissions WHERE ScreenName = @screenName');
  return result.recordset.length > 0 ? result.recordset[0].Id : null;
}

exports.getAllRoles = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
          r.Id   AS RoleID,
          r.Name AS RoleName,
          STRING_AGG(p.ScreenName, ',') AS Permissions
      FROM Roles r
      LEFT JOIN RolePermissions rp ON r.Id = rp.RoleId
      LEFT JOIN Permissions     p  ON rp.PermissionId = p.Id
      GROUP BY r.Id, r.Name
      ORDER BY r.Id
    `);

    const roles = result.recordset.map(row => ({
      id:          row.RoleID,
      name:        row.RoleName,
      permissions: row.Permissions ? row.Permissions.split(',') : [],
    }));

    res.status(200).json(roles);
  } catch (err) {
    console.error('getAllRoles error:', err);
    res.status(500).send({ message: 'Failed to retrieve roles', error: err.message });
  }
};

exports.createRole = async (req, res) => {
  const { name, permissions } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Role name is required.' });
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Insert the new role
    const roleResult = await new sql.Request(transaction)
      .input('name', sql.NVarChar, name)
      .query('INSERT INTO Roles (Name) OUTPUT INSERTED.Id VALUES (@name)');

    const newRoleId = roleResult.recordset[0].Id;

    // 2. Insert permissions one by one (sequential to avoid transaction conflicts)
    if (Array.isArray(permissions) && permissions.length > 0) {
      for (const screenName of permissions) {
        // Lookup permission ID outside transaction to avoid nested request conflicts
        const permResult = await new sql.Request(transaction)
          .input('screenName', sql.NVarChar, screenName)
          .query('SELECT Id FROM Permissions WHERE ScreenName = @screenName');

        if (permResult.recordset.length > 0) {
          const permissionId = permResult.recordset[0].Id;
          await new sql.Request(transaction)
            .input('roleId',       sql.Int, newRoleId)
            .input('permissionId', sql.Int, permissionId)
            .query('INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (@roleId, @permissionId)');
        }
      }
    }

    await transaction.commit();

    // Re-fetch saved permissions from DB to guarantee response accuracy
    const savedPermissions = await getRolePermissions(pool, newRoleId);
    res.status(201).json({ id: newRoleId, name, permissions: savedPermissions });
  } catch (err) {
    await transaction.rollback();
    console.error('createRole error:', err);
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).send({ message: 'A role with that name already exists.' });
    }
    res.status(500).send({ message: 'Failed to create role', error: err.message });
  }
};

exports.updateRole = async (req, res) => {
  const roleId = parseInt(req.params.id, 10);
  const { name, permissions } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Role name is required.' });
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Update role name
    await new sql.Request(transaction)
      .input('id',   sql.Int,      roleId)
      .input('name', sql.NVarChar, name)
      .query('UPDATE Roles SET Name = @name WHERE Id = @id');

    // 2. Delete all existing permissions for this role
    await new sql.Request(transaction)
      .input('roleId', sql.Int, roleId)
      .query('DELETE FROM RolePermissions WHERE RoleId = @roleId');

    // 3. Re-insert selected permissions one by one
    if (Array.isArray(permissions) && permissions.length > 0) {
      for (const screenName of permissions) {
        const permResult = await new sql.Request(transaction)
          .input('screenName', sql.NVarChar, screenName)
          .query('SELECT Id FROM Permissions WHERE ScreenName = @screenName');

        if (permResult.recordset.length > 0) {
          const permissionId = permResult.recordset[0].Id;
          await new sql.Request(transaction)
            .input('roleId',       sql.Int, roleId)
            .input('permissionId', sql.Int, permissionId)
            .query('INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (@roleId, @permissionId)');
        }
      }
    }

    await transaction.commit();

    // Re-fetch saved permissions from DB so the response is authoritative
    const savedPermissions = await getRolePermissions(pool, roleId);
    res.status(200).json({ id: roleId, name, permissions: savedPermissions });
  } catch (err) {
    await transaction.rollback();
    console.error('updateRole error:', err);
    res.status(500).send({ message: 'Failed to update role', error: err.message });
  }
};