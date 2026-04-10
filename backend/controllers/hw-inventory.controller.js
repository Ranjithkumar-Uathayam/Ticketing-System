// backend/controllers/hw-inventory.controller.js
const { sql, poolPromise } = require('../db');

const map = (r) => ({
  id:              r.Id,
  assetId:         r.AssetId,
  category:        r.Category,
  manufacturer:    r.Manufacturer,
  model:           r.Model,
  serialNumber:    r.SerialNumber,
  location:        r.Location,
  floor:           r.Floor ?? null,
  department:      r.Department ?? null,
  assignedTo:      r.AssignedTo ?? null,
  place:           r.Place ?? null,
  processor:       r.Processor ?? null,
  ramGb:           r.RamGb ?? null,
  hddGbTb:         r.HddGbTb ?? null,
  ssdGbTb:         r.SsdGbTb ?? null,
  os:              r.Os ?? null,
  ipAddress:       r.IpAddress ?? null,
  status:          r.Status,
  warrantyStatus:  r.WarrantyStatus,
  warrantyExpiry:  r.WarrantyExpiry ?? null,
  antivirusActive: r.AntivirusActive !== null ? !!r.AntivirusActive : null,
  remarks:         r.Remarks ?? null,
  createdAt:       r.CreatedAt,
  updatedAt:       r.UpdatedAt,
});

// ── GET all ───────────────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .query('SELECT * FROM HwInventory ORDER BY Category, AssetId');
    res.json(result.recordset.map(map));
  } catch (err) {
    console.error('[hw-inventory.getAll]', err);
    res.status(500).json({ message: 'Failed to retrieve assets', error: err.message });
  }
};

// ── GET by ID ─────────────────────────────────────────────────────────────────
exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM HwInventory WHERE Id = @id');
    if (!result.recordset[0])
      return res.status(404).json({ message: 'Asset not found.' });
    res.json(map(result.recordset[0]));
  } catch (err) {
    console.error('[hw-inventory.getById]', err);
    res.status(500).json({ message: 'Failed to retrieve asset', error: err.message });
  }
};

// ── POST create ───────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const b = req.body;
  if (!b.assetId)      return res.status(400).json({ message: 'assetId is required.' });
  if (!b.manufacturer) return res.status(400).json({ message: 'manufacturer is required.' });
  if (!b.model)        return res.status(400).json({ message: 'model is required.' });

  try {
    const pool = await poolPromise;

    // Uniqueness checks
    const dupAsset = await pool.request()
      .input('assetId', sql.NVarChar, b.assetId)
      .query('SELECT Id FROM HwInventory WHERE AssetId = @assetId');
    if (dupAsset.recordset.length > 0)
      return res.status(409).json({ message: `Asset ID "${b.assetId}" already exists.` });

    if (b.serialNumber) {
      const dupSerial = await pool.request()
        .input('sn', sql.NVarChar, b.serialNumber)
        .query('SELECT Id, AssetId FROM HwInventory WHERE SerialNumber = @sn AND SerialNumber != \'\'');
      if (dupSerial.recordset.length > 0)
        return res.status(409).json({ message: `Serial number already exists on asset ${dupSerial.recordset[0].AssetId}.` });
    }

    const result = await pool.request()
      .input('assetId',         sql.NVarChar, b.assetId)
      .input('category',        sql.NVarChar, b.category)
      .input('manufacturer',    sql.NVarChar, b.manufacturer)
      .input('model',           sql.NVarChar, b.model)
      .input('serialNumber',    sql.NVarChar, b.serialNumber     || '')
      .input('location',        sql.NVarChar, b.location)
      .input('floor',           sql.NVarChar, b.floor            || null)
      .input('department',      sql.NVarChar, b.department       || null)
      .input('assignedTo',      sql.NVarChar, b.assignedTo       || null)
      .input('place',           sql.NVarChar, b.place            || null)
      .input('processor',       sql.NVarChar, b.processor        || null)
      .input('ramGb',           sql.NVarChar, b.ramGb            || null)
      .input('hddGbTb',         sql.NVarChar, b.hddGbTb          || null)
      .input('ssdGbTb',         sql.NVarChar, b.ssdGbTb          || null)
      .input('os',              sql.NVarChar, b.os               || null)
      .input('ipAddress',       sql.NVarChar, b.ipAddress        || null)
      .input('status',          sql.NVarChar, b.status           || 'Active')
      .input('warrantyStatus',  sql.NVarChar, b.warrantyStatus   || 'Unknown')
      .input('warrantyExpiry',  sql.Date,     b.warrantyExpiry   || null)
      .input('antivirusActive', sql.Bit,      b.antivirusActive !== null && b.antivirusActive !== undefined
                                               ? (b.antivirusActive ? 1 : 0) : null)
      .input('remarks',         sql.NVarChar, b.remarks          || null)
      .query(`
        INSERT INTO HwInventory (
          AssetId, Category, Manufacturer, Model, SerialNumber,
          Location, Floor, Department, AssignedTo, Place,
          Processor, RamGb, HddGbTb, SsdGbTb, Os, IpAddress,
          Status, WarrantyStatus, WarrantyExpiry, AntivirusActive, Remarks
        )
        OUTPUT INSERTED.*
        VALUES (
          @assetId, @category, @manufacturer, @model, @serialNumber,
          @location, @floor, @department, @assignedTo, @place,
          @processor, @ramGb, @hddGbTb, @ssdGbTb, @os, @ipAddress,
          @status, @warrantyStatus, @warrantyExpiry, @antivirusActive, @remarks
        )
      `);
    res.status(201).json(map(result.recordset[0]));
  } catch (err) {
    console.error('[hw-inventory.create]', err);
    res.status(500).json({ message: 'Failed to create asset', error: err.message });
  }
};

// ── PUT update ────────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b  = req.body;

  if (!b.assetId)      return res.status(400).json({ message: 'assetId is required.' });
  if (!b.manufacturer) return res.status(400).json({ message: 'manufacturer is required.' });
  if (!b.model)        return res.status(400).json({ message: 'model is required.' });

  try {
    const pool = await poolPromise;

    const dupAsset = await pool.request()
      .input('assetId', sql.NVarChar, b.assetId)
      .input('id', sql.Int, id)
      .query('SELECT Id FROM HwInventory WHERE AssetId = @assetId AND Id <> @id');
    if (dupAsset.recordset.length > 0)
      return res.status(409).json({ message: `Asset ID "${b.assetId}" already exists.` });

    // Uniqueness check (exclude self)
    if (b.serialNumber) {
      const dup = await pool.request()
        .input('sn', sql.NVarChar, b.serialNumber)
        .input('id', sql.Int,      id)
        .query("SELECT Id FROM HwInventory WHERE SerialNumber = @sn AND SerialNumber != '' AND Id <> @id");
      if (dup.recordset.length > 0)
        return res.status(409).json({ message: `Serial number already exists on another asset.` });
    }

    const result = await pool.request()
      .input('id',              sql.Int,      id)
      .input('assetId',         sql.NVarChar, b.assetId)
      .input('category',        sql.NVarChar, b.category)
      .input('manufacturer',    sql.NVarChar, b.manufacturer)
      .input('model',           sql.NVarChar, b.model)
      .input('serialNumber',    sql.NVarChar, b.serialNumber     || '')
      .input('location',        sql.NVarChar, b.location)
      .input('floor',           sql.NVarChar, b.floor            || null)
      .input('department',      sql.NVarChar, b.department       || null)
      .input('assignedTo',      sql.NVarChar, b.assignedTo       || null)
      .input('place',           sql.NVarChar, b.place            || null)
      .input('processor',       sql.NVarChar, b.processor        || null)
      .input('ramGb',           sql.NVarChar, b.ramGb            || null)
      .input('hddGbTb',         sql.NVarChar, b.hddGbTb          || null)
      .input('ssdGbTb',         sql.NVarChar, b.ssdGbTb          || null)
      .input('os',              sql.NVarChar, b.os               || null)
      .input('ipAddress',       sql.NVarChar, b.ipAddress        || null)
      .input('status',          sql.NVarChar, b.status)
      .input('warrantyStatus',  sql.NVarChar, b.warrantyStatus)
      .input('warrantyExpiry',  sql.Date,     b.warrantyExpiry   || null)
      .input('antivirusActive', sql.Bit,      b.antivirusActive !== null && b.antivirusActive !== undefined
                                               ? (b.antivirusActive ? 1 : 0) : null)
      .input('remarks',         sql.NVarChar, b.remarks          || null)
      .query(`
        UPDATE HwInventory SET
          AssetId = @assetId, Category = @category, Manufacturer = @manufacturer, Model = @model,
          SerialNumber = @serialNumber, Location = @location, Floor = @floor,
          Department = @department, AssignedTo = @assignedTo, Place = @place,
          Processor = @processor, RamGb = @ramGb, HddGbTb = @hddGbTb, SsdGbTb = @ssdGbTb,
          Os = @os, IpAddress = @ipAddress, Status = @status,
          WarrantyStatus = @warrantyStatus, WarrantyExpiry = @warrantyExpiry,
          AntivirusActive = @antivirusActive, Remarks = @remarks,
          UpdatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE Id = @id
      `);
    if (!result.recordset[0])
      return res.status(404).json({ message: 'Asset not found.' });
    res.json(map(result.recordset[0]));
  } catch (err) {
    console.error('[hw-inventory.update]', err);
    res.status(500).json({ message: 'Failed to update asset', error: err.message });
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM HwInventory WHERE Id = @id');
    res.status(204).send();
  } catch (err) {
    console.error('[hw-inventory.remove]', err);
    res.status(500).json({ message: 'Failed to delete asset', error: err.message });
  }
};
