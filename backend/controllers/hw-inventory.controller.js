// backend/controllers/hw-inventory.controller.js
const { sql, poolPromise } = require('../db');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const LABEL_PRINTER_NAME = process.env.HW_LABEL_PRINTER_NAME || 'TSC TTP-244 Pro';

const BUNDLED_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'send-raw-printer.ps1');
let _resolvedScriptPath = null;

const getRealScriptPath = async () => {
  if (_resolvedScriptPath) return _resolvedScriptPath;

  const isPackaged =
    typeof process.pkg !== 'undefined' ||
    __dirname.replace(/\\/g, '/').includes('/snapshot/');

  if (!isPackaged) {
    // Development / plain node — path is already real
    _resolvedScriptPath = BUNDLED_SCRIPT_PATH;
    return _resolvedScriptPath;
  }

  // Packaged build: extract the bundled script to a real temp path
  const dest = path.join(os.tmpdir(), 'send-raw-printer.ps1');
  const content = await fs.readFile(BUNDLED_SCRIPT_PATH, 'utf8');
  await fs.writeFile(dest, content, 'utf8');
  _resolvedScriptPath = dest;
  console.log('[hw-inventory] Extracted print script to:', dest);
  return _resolvedScriptPath;
};

// ── DB row → JS object ────────────────────────────────────────────────────────
const map = (r) => ({
  id:              r.Id,
  assetId:         r.AssetId,
  category:        r.Category,
  manufacturer:    r.Manufacturer,
  model:           r.Model,
  serialNumber:    r.SerialNumber,
  location:        r.Location,
  floor:           r.Floor          ?? null,
  department:      r.Department     ?? null,
  assignedTo:      r.AssignedTo     ?? null,
  place:           r.Place          ?? null,
  processor:       r.Processor      ?? null,
  ramGb:           r.RamGb          ?? null,
  hddGbTb:         r.HddGbTb        ?? null,
  ssdGbTb:         r.SsdGbTb        ?? null,
  os:              r.Os             ?? null,
  ipAddress:       r.IpAddress      ?? null,
  status:          r.Status,
  warrantyStatus:  r.WarrantyStatus,
  warrantyExpiry:  r.WarrantyExpiry  ?? null,
  antivirusActive: r.AntivirusActive !== null ? !!r.AntivirusActive : null,
  remarks:         r.Remarks        ?? null,
  createdAt:       r.CreatedAt,
  updatedAt:       r.UpdatedAt,
});

// ── TSPL string escaping ──────────────────────────────────────────────────────
const esc = (value = '') =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

// ── Label builder ─────────────────────────────────────────────────────────────
const buildLabelTspl = (asset, includeUser = true) => {
  const rows = [
    ...(includeUser ? [['User', asset.assignedTo || '-']] : []),
    ['System', asset.assetId       || '-'],
    ['Dept',   asset.department    || '-'],
    ['Model',  `${asset.manufacturer || ''}/${(asset.model || '').trim()}`.trim() || '-'],
    ['SL No',  asset.serialNumber  || '-'],
  ];

  const ROW_START_Y = 67;
  const ROW_STEP    = 25;

  const lines = [
    'SIZE 50 mm,38 mm',
    'GAP 3 mm,0 mm',
    'DENSITY 10',
    'SPEED 2',
    'DIRECTION 0',
    'REFERENCE 0,0',
    'CLS',

    // ── Header ────────────────────────────────────────────────────────────────
    'TEXT 20,4,"3",0,1,1," Hardware Asset Details "',
    'TEXT 100,30,"2",0,1,1,"B and B Textiles"',

    // ── Double-rule divider ───────────────────────────────────────────────────
    'BAR 0,52,400,3',
    'BAR 0,57,400,1',

    // ── Vertical separator between key and value ──────────────────────────────
    `BAR 88,65,1,${rows.length * ROW_STEP}`,
  ];

  // ── Data rows ──────────────────────────────────────────────────────────────
  rows.forEach(([label, value], i) => {
    const y = ROW_START_Y + i * ROW_STEP;
    lines.push(`TEXT 8,${y},"2",0,1,1,"${esc(label)}"`);
    lines.push(`TEXT 94,${y},"3",0,1,1,"${esc(value)}"`);
  });

  // ── Thin rule above barcode ───────────────────────────────────────────────
  const ruleY = ROW_START_Y + rows.length * ROW_STEP + 2;
  lines.push(`BAR 0,${ruleY},400,1`);

  // ── Code-128 barcode ─────────────────────────────────────────────────────
  const barcodeData = (asset.serialNumber || asset.assetId || 'N/A')
    .replace(/[^A-Za-z0-9\-\.\/\+\s]/g, '');

  lines.push(`BARCODE 30,${ruleY + 4},"128",32,1,0,2,2,"${esc(barcodeData)}"`);
  lines.push('PRINT 1,1');

  return `${lines.join('\r\n')}\r\n`;
};

const buildLabelPrintJob = (asset, includeUser = true) => ({
  printerName: LABEL_PRINTER_NAME,
  jobName: `HW Label ${asset.assetId || asset.id || ''}`.trim(),
  encoding: 'ascii',
  content: buildLabelTspl(asset, includeUser),
});

// ── Raw print helper ──────────────────────────────────────────────────────────
const sendRawLabelToPrinter = async (content, printerName) => {
  const tempFile = path.join(os.tmpdir(), `hw-label-${Date.now()}.txt`);
  await fs.writeFile(tempFile, Buffer.from(content, 'ascii'));

  // Resolve script to a real on-disk path (handles pkg packaging)
  const scriptPath = await getRealScriptPath();

  try {
    await new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', scriptPath,
          '-PrinterName', printerName,
          '-FilePath', tempFile,
        ],
        { windowsHide: true, timeout: 20000 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || stdout || error.message));
            return;
          }
          resolve();
        }
      );
    });
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
};

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

// ── CREATE ────────────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const b = req.body;
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('assetId',         sql.NVarChar, b.assetId)
      .input('category',        sql.NVarChar, b.category)
      .input('manufacturer',    sql.NVarChar, b.manufacturer    || null)
      .input('model',           sql.NVarChar, b.model           || null)
      .input('serialNumber',    sql.NVarChar, b.serialNumber    || null)
      .input('location',        sql.NVarChar, b.location)
      .input('floor',           sql.NVarChar, b.floor           || null)
      .input('department',      sql.NVarChar, b.department      || null)
      .input('assignedTo',      sql.NVarChar, b.assignedTo      || null)
      .input('place',           sql.NVarChar, b.place           || null)
      .input('processor',       sql.NVarChar, b.processor       || null)
      .input('ramGb',           sql.NVarChar, b.ramGb           || null)
      .input('hddGbTb',         sql.NVarChar, b.hddGbTb         || null)
      .input('ssdGbTb',         sql.NVarChar, b.ssdGbTb         || null)
      .input('os',              sql.NVarChar, b.os              || null)
      .input('ipAddress',       sql.NVarChar, b.ipAddress       || null)
      .input('status',          sql.NVarChar, b.status)
      .input('warrantyStatus',  sql.NVarChar, b.warrantyStatus)
      .input('warrantyExpiry',  sql.Date,     b.warrantyExpiry  || null)
      .input('antivirusActive', sql.Bit,      b.antivirusActive != null ? (b.antivirusActive ? 1 : 0) : null)
      .input('remarks',         sql.NVarChar, b.remarks         || null)
      .query(`
        INSERT INTO HwInventory (
          AssetId, Category, Manufacturer, Model, SerialNumber, Location, Floor,
          Department, AssignedTo, Place, Processor, RamGb, HddGbTb, SsdGbTb,
          Os, IpAddress, Status, WarrantyStatus, WarrantyExpiry, AntivirusActive, Remarks
        )
        OUTPUT INSERTED.*
        VALUES (
          @assetId, @category, @manufacturer, @model, @serialNumber, @location, @floor,
          @department, @assignedTo, @place, @processor, @ramGb, @hddGbTb, @ssdGbTb,
          @os, @ipAddress, @status, @warrantyStatus, @warrantyExpiry, @antivirusActive, @remarks
        )
      `);
    res.status(201).json(map(result.recordset[0]));
  } catch (err) {
    console.error('[hw-inventory.create]', err);
    res.status(500).json({ message: 'Failed to create asset'+ err.message, error: err.message });
  }
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b  = req.body;
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id',              sql.Int,      id)
      .input('assetId',         sql.NVarChar, b.assetId)
      .input('category',        sql.NVarChar, b.category)
      .input('manufacturer',    sql.NVarChar, b.manufacturer    || null)
      .input('model',           sql.NVarChar, b.model           || null)
      .input('serialNumber',    sql.NVarChar, b.serialNumber    || null)
      .input('location',        sql.NVarChar, b.location)
      .input('floor',           sql.NVarChar, b.floor           || null)
      .input('department',      sql.NVarChar, b.department      || null)
      .input('assignedTo',      sql.NVarChar, b.assignedTo      || null)
      .input('place',           sql.NVarChar, b.place           || null)
      .input('processor',       sql.NVarChar, b.processor       || null)
      .input('ramGb',           sql.NVarChar, b.ramGb           || null)
      .input('hddGbTb',         sql.NVarChar, b.hddGbTb         || null)
      .input('ssdGbTb',         sql.NVarChar, b.ssdGbTb         || null)
      .input('os',              sql.NVarChar, b.os              || null)
      .input('ipAddress',       sql.NVarChar, b.ipAddress       || null)
      .input('status',          sql.NVarChar, b.status)
      .input('warrantyStatus',  sql.NVarChar, b.warrantyStatus)
      .input('warrantyExpiry',  sql.Date,     b.warrantyExpiry  || null)
      .input('antivirusActive', sql.Bit,      b.antivirusActive != null ? (b.antivirusActive ? 1 : 0) : null)
      .input('remarks',         sql.NVarChar, b.remarks         || null)
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

// ── PRINT LABEL (server-side mode) ────────────────────────────────────────────
exports.printLabel = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const includeUser = req.body?.includeUser !== false;
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM HwInventory WHERE Id = @id');

    if (!result.recordset[0])
      return res.status(404).json({ message: 'Asset not found.' });

    const asset = map(result.recordset[0]);
    const tspl  = buildLabelTspl(asset, includeUser);

    await sendRawLabelToPrinter(tspl, LABEL_PRINTER_NAME);
    res.json({ message: `Label sent to printer: ${LABEL_PRINTER_NAME}` });
  } catch (err) {
    console.error('[hw-inventory.printLabel]', err);
    res.status(500).json({ message: 'Failed to print label', error: err.message });
  }
};

// ── GET LABEL PRINT JOB (client-agent mode) ───────────────────────────────────
exports.getLabelPrintJob = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const includeUser = req.body?.includeUser !== false;
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM HwInventory WHERE Id = @id');

    if (!result.recordset[0])
      return res.status(404).json({ message: 'Asset not found.' });

    const asset = map(result.recordset[0]);
    res.json(buildLabelPrintJob(asset, includeUser));
  } catch (err) {
    console.error('[hw-inventory.getLabelPrintJob]', err);
    res.status(500).json({ message: 'Failed to prepare label print job', error: err.message });
  }
};

// ── QZ TRAY REQUEST SIGNING ───────────────────────────────────────────────────
exports.signQzRequest = (req, res) => {
  const { request } = req.body || {};
  if (!request) {
    return res.status(400).json({ message: 'request field is required.' });
  }
  const privateKey = (process.env.QZ_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!privateKey) {
    return res.status(503).json({ message: 'QZ signing key not configured on server.' });
  }
  try {
    const sign = crypto.createSign('SHA512');
    sign.update(request);
    const signature = sign.sign(privateKey, 'base64');
    res.json({ signature });
  } catch (err) {
    console.error('[hw-inventory.signQzRequest]', err);
    res.status(500).json({ message: 'Failed to sign QZ request', error: err.message });
  }
};