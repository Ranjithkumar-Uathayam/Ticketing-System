const { sql, poolPromise } = require('../db');

// ─── Helpers ────────────────────────────────────────────────────────────────

// Returns { 'Dashboard': 1, 'Tickets': 2, ... }
async function getPermissionMap(pool) {
  const result = await pool.request().query('SELECT Id, ScreenName FROM Permissions');
  const map = {};
  for (const row of result.recordset) map[row.ScreenName] = row.Id;
  return map;
}

// Returns ['Dashboard', 'Tickets', ...] for a given roleId
async function fetchRolePermissions(pool, roleId) {
  const result = await pool.request()
    .input('roleId', sql.Int, roleId)
    .query(`
      SELECT p.ScreenName
      FROM   RolePermissions rp
      JOIN   Permissions p ON rp.PermissionId = p.Id
      WHERE  rp.RoleId = @roleId
    `);
  return result.recordset.map(r => r.ScreenName);
}

// ─── Controllers ────────────────────────────────────────────────────────────

exports.getAllRoles = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        r.Id   AS RoleID,
        r.Name AS RoleName,
        STRING_AGG(p.ScreenName, ',') AS Permissions
      FROM Roles r
      LEFT JOIN RolePermissions rp ON r.Id  = rp.RoleId
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
    res.status(500).json({ message: 'Failed to retrieve roles', error: err.message });
  }
};

exports.createRole = async (req, res) => {
  const { name, permissions } = req.body;

  if (!name) return res.status(400).json({ message: 'Role name is required.' });

  try {
    const pool = await poolPromise;

    // Step 1 – Insert the role
    const roleResult = await pool.request()
      .input('name', sql.NVarChar, name)
      .query('INSERT INTO Roles (Name) OUTPUT INSERTED.Id VALUES (@name)');

    const newRoleId = roleResult.recordset[0].Id;

    // Step 2 – Resolve permission names → IDs
    const permMap = await getPermissionMap(pool);
    const permIds = (Array.isArray(permissions) ? permissions : [])
      .map(s => permMap[s])
      .filter(id => id != null);

    // Step 3 – Insert each RolePermission row
    for (const permissionId of permIds) {
      await pool.request()
        .input('roleId',       sql.Int, newRoleId)
        .input('permissionId', sql.Int, permissionId)
        .query('INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (@roleId, @permissionId)');
    }

    // Step 4 – Re-fetch to confirm
    const saved = await fetchRolePermissions(pool, newRoleId);
    res.status(201).json({ id: newRoleId, name, permissions: saved });

  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ message: 'A role with that name already exists.' });
    }
    res.status(500).json({ message: 'Failed to create role', error: err.message });
  }
};

exports.updateRole = async (req, res) => {
  const roleId = parseInt(req.params.id, 10);
  const { name, permissions } = req.body;

  if (!name) return res.status(400).json({ message: 'Role name is required.' });

  try {
    const pool = await poolPromise;

    // Step 1 – Update role name
    await pool.request()
      .input('id',   sql.Int,      roleId)
      .input('name', sql.NVarChar, name)
      .query('UPDATE Roles SET Name = @name WHERE Id = @id');

    // Step 2 – Delete existing permissions
    await pool.request()
      .input('roleId', sql.Int, roleId)
      .query('DELETE FROM RolePermissions WHERE RoleId = @roleId');

    // Step 3 – Resolve permission names → IDs
    const permMap = await getPermissionMap(pool);
    const permIds = (Array.isArray(permissions) ? permissions : [])
      .map(s => permMap[s])
      .filter(id => id != null);

    // Step 4 – Re-insert permissions
    for (const permissionId of permIds) {
      await pool.request()
        .input('roleId',       sql.Int, roleId)
        .input('permissionId', sql.Int, permissionId)
        .query('INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (@roleId, @permissionId)');
    }

    // Step 5 – Re-fetch to confirm
    const saved = await fetchRolePermissions(pool, roleId);
    res.status(200).json({ id: roleId, name, permissions: saved });

  } catch (err) {
    res.status(500).json({ message: 'Failed to update role', error: err.message });
  }
};