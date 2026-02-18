const { sql, poolPromise } = require('../db');

exports.getAllRoles = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT
            r.Id as RoleID,
            r.Name as RoleName,
            STRING_AGG(p.ScreenName, ',') AS Permissions
        FROM
            Roles r
        LEFT JOIN
            RolePermissions rp ON r.Id = rp.RoleId
        LEFT JOIN
            Permissions p ON rp.PermissionId = p.Id
        GROUP BY
            r.Id, r.Name
        ORDER BY
            r.Id;
    `);

    const roles = result.recordset.map(role => ({
        id: role.RoleID,
        name: role.RoleName,
        permissions: role.Permissions ? role.Permissions.split(',') : []
    }));

    res.status(200).json(roles);
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).send({ message: 'Failed to retrieve roles', error: err.message });
  }
};

exports.createRole = async (req, res) => {
    const { name, permissions } = req.body;
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();
        const roleRequest = new sql.Request(transaction);
        const roleResult = await roleRequest
            .input('name', sql.NVarChar, name)
            .query('INSERT INTO Roles (Name) OUTPUT INSERTED.Id VALUES (@name)');
        
        const newRoleId = roleResult.recordset[0].Id;

        if (permissions && permissions.length > 0) {
            for (const permissionName of permissions) {
                const permissionRequest = new sql.Request(transaction);
                const permissionResult = await permissionRequest
                    .input('screenName', sql.NVarChar, permissionName)
                    .query('SELECT Id FROM Permissions WHERE ScreenName = @screenName');
                
                if (permissionResult.recordset.length > 0) {
                    const permissionId = permissionResult.recordset[0].Id;
                    const rolePermissionRequest = new sql.Request(transaction);
                    await rolePermissionRequest
                        .input('roleId', sql.Int, newRoleId)
                        .input('permissionId', sql.Int, permissionId)
                        .query('INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (@roleId, @permissionId)');
                }
            }
        }
        
        await transaction.commit();
        res.status(201).json({ id: newRoleId, name, permissions });
    } catch (err) {
        await transaction.rollback();
        console.error('Transaction error:', err);
        res.status(500).send({ message: 'Failed to create role', error: err.message });
    }
};

exports.updateRole = async (req, res) => {
    const roleId = parseInt(req.params.id, 10);
    const { name, permissions } = req.body;
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const updateRoleRequest = new sql.Request(transaction);
        await updateRoleRequest
            .input('id', sql.Int, roleId)
            .input('name', sql.NVarChar, name)
            .query('UPDATE Roles SET Name = @name WHERE Id = @id');

        const deletePermissionsRequest = new sql.Request(transaction);
        await deletePermissionsRequest
            .input('roleId', sql.Int, roleId)
            .query('DELETE FROM RolePermissions WHERE RoleId = @roleId');
        
        if (permissions && permissions.length > 0) {
            for (const permissionName of permissions) {
                const permissionRequest = new sql.Request(transaction);
                const permissionResult = await permissionRequest
                    .input('screenName', sql.NVarChar, permissionName)
                    .query('SELECT Id FROM Permissions WHERE ScreenName = @screenName');
                
                if (permissionResult.recordset.length > 0) {
                    const permissionId = permissionResult.recordset[0].Id;
                    const rolePermissionRequest = new sql.Request(transaction);
                    await rolePermissionRequest
                        .input('roleId', sql.Int, roleId)
                        .input('permissionId', sql.Int, permissionId)
                        .query('INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (@roleId, @permissionId)');
                }
            }
        }
        
        await transaction.commit();
        res.status(200).json({ id: roleId, name, permissions });
    } catch (err) {
        await transaction.rollback();
        console.error('Transaction error:', err);
        res.status(500).send({ message: 'Failed to update role', error: err.message });
    }
};
