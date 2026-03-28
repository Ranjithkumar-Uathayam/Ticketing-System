// backend/controllers/roles.controller.js  (FIXED — auto-upsert missing permissions)
const { sql, poolPromise } = require('../db');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns { 'Dashboard': 1, 'Tickets': 2, ... } for every row in Permissions.
 */
async function getPermissionMap(pool) {
  const result = await pool.request().query('SELECT Id, ScreenName FROM Permissions');
  const map = {};
  for (const row of result.recordset) map[row.ScreenName] = row.Id;
  return map;
}

/**
 * Resolves an array of screen-name strings to permission IDs.
 *
 * KEY FIX: If a screen name does not exist in the Permissions table yet
 * (e.g. 'Customer Entry' or any future screen), it is automatically
 * inserted (MERGE / upsert) so it is never silently dropped.
 *
 * Before this fix, unknown screen names mapped to undefined and were
 * filtered out, causing permissions to not save without any error.
 */
async function resolvePermissionIds(pool, screenNames) {
  if (!Array.isArray(screenNames) || screenNames.length === 0) return [];

  const permMap = await getPermissionMap(pool);
  const ids = [];

  for (const name of screenNames) {
    if (!name) continue;

    if (permMap[name] != null) {
      // Already in DB — use existing ID
      ids.push(permMap[name]);
    } else {
      // NEW screen name — insert it and use the new ID
      console.log(`[roles] Auto-inserting missing permission: "${name}"`);
      const res = await pool.request()
        .input('screenName', sql.NVarChar, name)
        .query(`
          -- MERGE prevents duplicate-key errors on concurrent inserts
          MERGE Permissions AS target
          USING (SELECT @screenName AS ScreenName) AS src
            ON target.ScreenName = src.ScreenName
          WHEN NOT MATCHED THEN
            INSERT (ScreenName) VALUES (src.ScreenName);

          SELECT Id FROM Permissions WHERE ScreenName = @screenName;
        `);
      const newId = res.recordset[0]?.Id;
      if (newId != null) ids.push(newId);
    }
  }

  return ids;
}

/**
 * Returns ['Dashboard', 'Tickets', ...] for a given roleId.
 */
async function fetchRolePermissions(pool, roleId) {
  const result = await pool.request()
    .input('roleId', sql.Int, roleId)
    .query(`
      SELECT p.ScreenName
      FROM   RolePermissions rp
      JOIN   Permissions p ON rp.PermissionId = p.Id
      WHERE  rp.RoleId = @roleId
      ORDER BY p.ScreenName
    `);
  return result.recordset.map(r => r.ScreenName);
}

// ─── Controllers ────────────────────────────────────────────────────────────

exports.getAllRoles = async (req, res) => {
  try {
    const pool   = await poolPromise;
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
    console.error('[roles.getAllRoles]', err);
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

    // Step 2 – Resolve (and auto-create) permission IDs
    const permIds = await resolvePermissionIds(pool, permissions);

    // Step 3 – Insert each RolePermission row
    for (const permissionId of permIds) {
      await pool.request()
        .input('roleId',       sql.Int, newRoleId)
        .input('permissionId', sql.Int, permissionId)
        .query('INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (@roleId, @permissionId)');
    }

    // Step 4 – Re-fetch to confirm what was actually saved
    const saved = await fetchRolePermissions(pool, newRoleId);
    res.status(201).json({ id: newRoleId, name, permissions: saved });

  } catch (err) {
    console.error('[roles.createRole]', err);
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

    // Step 2 – Wipe existing permissions for this role
    await pool.request()
      .input('roleId', sql.Int, roleId)
      .query('DELETE FROM RolePermissions WHERE RoleId = @roleId');

    // Step 3 – Resolve (and auto-create) permission IDs
    const permIds = await resolvePermissionIds(pool, permissions);

    // Step 4 – Re-insert permissions
    for (const permissionId of permIds) {
      await pool.request()
        .input('roleId',       sql.Int, roleId)
        .input('permissionId', sql.Int, permissionId)
        .query('INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (@roleId, @permissionId)');
    }

    // Step 5 – Re-fetch to confirm what was actually saved
    const saved = await fetchRolePermissions(pool, roleId);
    res.status(200).json({ id: roleId, name, permissions: saved });

  } catch (err) {
    console.error('[roles.updateRole]', err);
    res.status(500).json({ message: 'Failed to update role', error: err.message });
  }
};