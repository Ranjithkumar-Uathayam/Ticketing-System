const { sql, poolPromise } = require('../db');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const PARSER_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'price_config_parser.py');

const DEFAULT_PYTHON_CANDIDATES = [
  process.env.PRICE_CONFIG_PYTHON,
  process.env.PYTHON_PATH,
  path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
  'python',
  'python3',
].filter(Boolean);

const LABEL_TEMPLATE_FALLBACK = {
  companyName: 'B AND B TEXTILE',
  unitLine: '(A Unit of ENES Textile Mills)',
  website: 'www.uathayam.in',
  email: 'info@uathayam.com',
  customerCare: '9942677757',
  countryOfOrigin: 'India',
};

const ITEM_MASTER_DEFAULT_META = {
  hasData: false,
  totalItems: 0,
  lastUploadFileName: null,
  lastUploadedAt: null,
};

let schemaReadyPromise = null;

const decodeBase64File = (base64Value = '') => {
  const raw = String(base64Value);
  const commaIndex = raw.indexOf(',');
  const payload = commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
  return Buffer.from(payload, 'base64');
};

const writeTempFile = async (prefix, originalName, buffer) => {
  const safeName = (originalName || `${prefix}.bin`).replace(/[^A-Za-z0-9._-]/g, '_');
  const tempPath = path.join(os.tmpdir(), `${prefix}-${crypto.randomUUID()}-${safeName}`);
  await fs.writeFile(tempPath, buffer);
  return tempPath;
};

const tryExecFile = (command, args) => new Promise((resolve, reject) => {
  execFile(command, args, { windowsHide: true, timeout: 120000 }, (error, stdout, stderr) => {
    if (error) {
      reject(new Error(stderr || stdout || error.message));
      return;
    }
    resolve(stdout);
  });
});

const runParser = async (mode, filePath) => {
  let lastError = null;

  for (const pythonCommand of DEFAULT_PYTHON_CANDIDATES) {
    try {
      const stdout = await tryExecFile(pythonCommand, [
        PARSER_SCRIPT_PATH,
        mode,
        '--file',
        filePath,
      ]);
      return JSON.parse(stdout);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to parse the uploaded file. Configure PRICE_CONFIG_PYTHON with a Python runtime that includes openpyxl and pypdf. ${lastError ? `Last error: ${lastError.message}` : ''}`.trim()
  );
};

const normalizeSku = (value) => String(value || '').replace(/\s+/g, '').trim().toUpperCase();
const cleanText = (value, fallback = '') => String(value ?? fallback).trim();
const trimOrNull = (value) => {
  const text = cleanText(value);
  return text ? text : null;
};
const normalizeNumeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const parseDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildSummary = (items = []) => {
  const totalLines = items.length;
  const totalQuantity = items.reduce((sum, item) => sum + normalizeNumeric(item.qty), 0);
  const matchedCount = items.filter((item) => item.matchStatus === 'Matched').length;
  const unmatchedCount = totalLines - matchedCount;
  return { totalLines, totalQuantity, matchedCount, unmatchedCount };
};

const withDerivedFields = (items = []) =>
  items.map((item) => {
    const qty = Math.max(0, normalizeNumeric(item.qty));
    const currentPrice = Math.max(0, normalizeNumeric(item.currentPrice));
    const labelQty = Math.max(0, normalizeNumeric(item.labelQty || qty));

    return {
      serialNo: Math.max(0, normalizeNumeric(item.serialNo)),
      skuCode: cleanText(item.skuCode),
      pickListName: cleanText(item.pickListName),
      itemName: cleanText(item.itemName),
      brand: cleanText(item.brand),
      category: cleanText(item.category),
      shelfCode: cleanText(item.shelfCode),
      size: cleanText(item.size),
      color: cleanText(item.color),
      qty,
      labelQty,
      costPrice: Math.max(0, normalizeNumeric(item.costPrice)),
      currentPrice,
      totalPrice: Number((qty * currentPrice).toFixed(2)),
      hsnCode: cleanText(item.hsnCode),
      ean: cleanText(item.ean),
      weight: cleanText(item.weight),
      pageUrl: cleanText(item.pageUrl),
      matchStatus: item.matchStatus === 'Matched' ? 'Matched' : 'Unmatched',
      notes: cleanText(item.notes),
    };
  });

const sanitizeLabelTemplate = (template = {}) => ({
  companyName: cleanText(template.companyName || LABEL_TEMPLATE_FALLBACK.companyName),
  unitLine: cleanText(template.unitLine || LABEL_TEMPLATE_FALLBACK.unitLine),
  website: cleanText(template.website || LABEL_TEMPLATE_FALLBACK.website),
  email: cleanText(template.email || LABEL_TEMPLATE_FALLBACK.email),
  customerCare: cleanText(template.customerCare || LABEL_TEMPLATE_FALLBACK.customerCare),
  countryOfOrigin: cleanText(template.countryOfOrigin || LABEL_TEMPLATE_FALLBACK.countryOfOrigin),
});

const toItemMasterRow = (row) => ({
  id: row.Id,
  skuCode: row.SkuCode,
  itemName: row.ItemName || '',
  category: row.Category || '',
  color: row.Color || '',
  brand: row.Brand || '',
  hsnCode: row.HsnCode || '',
  tat: row.Tat || '',
  size: row.Size || '',
  weight: row.Weight || '',
  costPrice: normalizeNumeric(row.CostPrice),
  mrp: normalizeNumeric(row.MRP),
  batchGroup: row.BatchGroup || '',
  ean: row.EAN || '',
  dimensions: row.Dimensions || '',
  taxType: row.TaxType || '',
  enabled: row.Enabled || '',
  itemType: row.ItemType || '',
  expirable: row.Expirable || '',
  skuType: row.SkuType || '',
  image: row.Image || '',
  pageUrl: row.PageUrl || '',
  sourceFileName: row.SourceFileName || null,
  updatedAt: row.UpdatedAt,
});

const toItemMasterMeta = (row) => ({
  hasData: normalizeNumeric(row?.TotalItems) > 0,
  totalItems: normalizeNumeric(row?.TotalItems),
  lastUploadFileName: row?.LastUploadFileName || null,
  lastUploadedAt: row?.LastUploadedAt || null,
});

const mapRecord = (row) => {
  const items = JSON.parse(row.ItemsJson || '[]');
  const summary = buildSummary(items);

  return {
    id: row.Id,
    configurationNo: row.ConfigurationNo,
    pickListNo: row.PickListNo,
    pickListCreatedAt: row.PickListCreatedAt || null,
    itemMasterFileName: row.ItemMasterFileName || null,
    itemMasterUploadedAt: row.ItemMasterUploadedAt || null,
    pickListFileName: row.PickListFileName || null,
    labelTemplate: row.LabelTemplateJson ? JSON.parse(row.LabelTemplateJson) : LABEL_TEMPLATE_FALLBACK,
    createdBy: row.CreatedBy || null,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    ...summary,
    items,
  };
};

const ensureSchema = async (pool) => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = pool.request().query(`
      IF OBJECT_ID('dbo.PriceConfigurations', 'U') IS NULL
      BEGIN
          CREATE TABLE PriceConfigurations (
              Id INT PRIMARY KEY IDENTITY(1,1),
              ConfigurationNo NVARCHAR(50) NOT NULL,
              PickListNo NVARCHAR(100) NOT NULL,
              PickListCreatedAt NVARCHAR(100) NULL,
              ItemMasterFileName NVARCHAR(255) NULL,
              PickListFileName NVARCHAR(255) NULL,
              ItemsJson NVARCHAR(MAX) NOT NULL,
              LabelTemplateJson NVARCHAR(MAX) NULL,
              CreatedBy INT NULL,
              CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
              UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
              CONSTRAINT UQ_PriceConfigurations_ConfigurationNo UNIQUE (ConfigurationNo)
          );
      END;

      IF COL_LENGTH('dbo.PriceConfigurations', 'ItemMasterUploadedAt') IS NULL
      BEGIN
          ALTER TABLE PriceConfigurations
          ADD ItemMasterUploadedAt DATETIME2 NULL;
      END;

      IF NOT EXISTS (
          SELECT 1
          FROM sys.foreign_keys
          WHERE name = 'FK_PriceConfigurations_Users'
      ) AND OBJECT_ID('dbo.Users', 'U') IS NOT NULL
      BEGIN
          ALTER TABLE PriceConfigurations
          ADD CONSTRAINT FK_PriceConfigurations_Users
          FOREIGN KEY (CreatedBy) REFERENCES Users(Id);
      END;

      IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE name = 'IX_PriceConfigurations_UpdatedAt'
            AND object_id = OBJECT_ID('dbo.PriceConfigurations')
      )
      BEGIN
          CREATE INDEX IX_PriceConfigurations_UpdatedAt
          ON PriceConfigurations (UpdatedAt DESC, Id DESC);
      END;

      IF OBJECT_ID('dbo.PriceItemMaster', 'U') IS NULL
      BEGIN
          CREATE TABLE PriceItemMaster (
              Id INT PRIMARY KEY IDENTITY(1,1),
              NormalizedSku NVARCHAR(120) NOT NULL,
              SkuCode NVARCHAR(120) NOT NULL,
              ItemName NVARCHAR(255) NULL,
              Category NVARCHAR(120) NULL,
              Color NVARCHAR(120) NULL,
              Brand NVARCHAR(120) NULL,
              HsnCode NVARCHAR(60) NULL,
              Tat NVARCHAR(60) NULL,
              Size NVARCHAR(80) NULL,
              Weight NVARCHAR(80) NULL,
              CostPrice DECIMAL(18,2) NOT NULL DEFAULT 0,
              MRP DECIMAL(18,2) NOT NULL DEFAULT 0,
              BatchGroup NVARCHAR(120) NULL,
              EAN NVARCHAR(120) NULL,
              Dimensions NVARCHAR(120) NULL,
              TaxType NVARCHAR(80) NULL,
              Enabled NVARCHAR(40) NULL,
              ItemType NVARCHAR(80) NULL,
              Expirable NVARCHAR(40) NULL,
              SkuType NVARCHAR(80) NULL,
              Image NVARCHAR(500) NULL,
              PageUrl NVARCHAR(500) NULL,
              SourceFileName NVARCHAR(255) NULL,
              CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
              UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
              CONSTRAINT UQ_PriceItemMaster_NormalizedSku UNIQUE (NormalizedSku)
          );
      END;

      IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE name = 'IX_PriceItemMaster_SkuCode'
            AND object_id = OBJECT_ID('dbo.PriceItemMaster')
      )
      BEGIN
          CREATE INDEX IX_PriceItemMaster_SkuCode ON PriceItemMaster (SkuCode);
      END;

      IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE name = 'IX_PriceItemMaster_ItemName'
            AND object_id = OBJECT_ID('dbo.PriceItemMaster')
      )
      BEGIN
          CREATE INDEX IX_PriceItemMaster_ItemName ON PriceItemMaster (ItemName);
      END;

      IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE name = 'IX_PriceItemMaster_BrandCategory'
            AND object_id = OBJECT_ID('dbo.PriceItemMaster')
      )
      BEGIN
          CREATE INDEX IX_PriceItemMaster_BrandCategory ON PriceItemMaster (Brand, Category);
      END;

      IF OBJECT_ID('dbo.PriceItemMasterMeta', 'U') IS NULL
      BEGIN
          CREATE TABLE PriceItemMasterMeta (
              Id INT PRIMARY KEY,
              LastUploadFileName NVARCHAR(255) NULL,
              LastUploadedAt DATETIME2 NULL,
              TotalItems INT NOT NULL DEFAULT 0,
              UpdatedBy INT NULL,
              UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
          );
      END;

      IF NOT EXISTS (
          SELECT 1
          FROM sys.foreign_keys
          WHERE name = 'FK_PriceItemMasterMeta_Users'
      ) AND OBJECT_ID('dbo.Users', 'U') IS NOT NULL
      BEGIN
          ALTER TABLE PriceItemMasterMeta
          ADD CONSTRAINT FK_PriceItemMasterMeta_Users
          FOREIGN KEY (UpdatedBy) REFERENCES Users(Id);
      END;
    `).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  await schemaReadyPromise;
};

const fetchItemMasterMeta = async (poolOrTransaction) => {
  const result = await poolOrTransaction.request().query(`
    SELECT TOP (1)
      TotalItems,
      LastUploadFileName,
      LastUploadedAt
    FROM PriceItemMasterMeta
    WHERE Id = 1
  `);

  return result.recordset[0] ? toItemMasterMeta(result.recordset[0]) : ITEM_MASTER_DEFAULT_META;
};

const fetchItemMasterPage = async (pool, search = '', page = 1, limit = 15) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  const offset = (safePage - 1) * safeLimit;
  const searchTerm = cleanText(search);
  const like = `%${searchTerm}%`;

  const meta = await fetchItemMasterMeta(pool);

  const countRequest = pool.request().input('search', sql.NVarChar, searchTerm).input('like', sql.NVarChar, like);
  const dataRequest = pool.request()
    .input('search', sql.NVarChar, searchTerm)
    .input('like', sql.NVarChar, like)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, safeLimit);

  const whereClause = `
    WHERE (
      @search = ''
      OR SkuCode LIKE @like
      OR ItemName LIKE @like
      OR Brand LIKE @like
      OR Category LIKE @like
      OR Color LIKE @like
      OR EAN LIKE @like
    )
  `;

  const [countResult, dataResult] = await Promise.all([
    countRequest.query(`SELECT COUNT(*) AS Total FROM PriceItemMaster ${whereClause}`),
    dataRequest.query(`
      SELECT
        Id,
        SkuCode,
        ItemName,
        Category,
        Color,
        Brand,
        HsnCode,
        Tat,
        Size,
        Weight,
        CostPrice,
        MRP,
        BatchGroup,
        EAN,
        Dimensions,
        TaxType,
        Enabled,
        ItemType,
        Expirable,
        SkuType,
        Image,
        PageUrl,
        SourceFileName,
        UpdatedAt
      FROM PriceItemMaster
      ${whereClause}
      ORDER BY SkuCode ASC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `),
  ]);

  const total = normalizeNumeric(countResult.recordset[0]?.Total);
  return {
    meta,
    data: dataResult.recordset.map(toItemMasterRow),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

const toItemMasterImportRow = (row, sourceFileName) => ({
  normalizedSku: normalizeSku(row.skuCode),
  skuCode: cleanText(row.skuCode),
  itemName: cleanText(row.itemName),
  category: cleanText(row.category),
  color: cleanText(row.color),
  brand: cleanText(row.brand),
  hsnCode: cleanText(row.hsnCode),
  tat: cleanText(row.tat),
  size: cleanText(row.size),
  weight: cleanText(row.weight),
  costPrice: normalizeNumeric(row.costPrice),
  mrp: normalizeNumeric(row.mrp),
  batchGroup: cleanText(row.batchGroup),
  ean: cleanText(row.ean),
  dimensions: cleanText(row.dimensions),
  taxType: cleanText(row.taxType),
  enabled: cleanText(row.enabled),
  itemType: cleanText(row.itemType),
  expirable: cleanText(row.expirable),
  skuType: cleanText(row.skuType),
  image: cleanText(row.image),
  pageUrl: cleanText(row.pageUrl),
  sourceFileName: trimOrNull(sourceFileName),
});

const buildItemMasterBulkTable = (rows) => {
  const table = new sql.Table('PriceItemMaster');
  table.create = false;
  table.columns.add('NormalizedSku', sql.NVarChar(120), { nullable: false });
  table.columns.add('SkuCode', sql.NVarChar(120), { nullable: false });
  table.columns.add('ItemName', sql.NVarChar(255), { nullable: true });
  table.columns.add('Category', sql.NVarChar(120), { nullable: true });
  table.columns.add('Color', sql.NVarChar(120), { nullable: true });
  table.columns.add('Brand', sql.NVarChar(120), { nullable: true });
  table.columns.add('HsnCode', sql.NVarChar(60), { nullable: true });
  table.columns.add('Tat', sql.NVarChar(60), { nullable: true });
  table.columns.add('Size', sql.NVarChar(80), { nullable: true });
  table.columns.add('Weight', sql.NVarChar(80), { nullable: true });
  table.columns.add('CostPrice', sql.Decimal(18, 2), { nullable: false });
  table.columns.add('MRP', sql.Decimal(18, 2), { nullable: false });
  table.columns.add('BatchGroup', sql.NVarChar(120), { nullable: true });
  table.columns.add('EAN', sql.NVarChar(120), { nullable: true });
  table.columns.add('Dimensions', sql.NVarChar(120), { nullable: true });
  table.columns.add('TaxType', sql.NVarChar(80), { nullable: true });
  table.columns.add('Enabled', sql.NVarChar(40), { nullable: true });
  table.columns.add('ItemType', sql.NVarChar(80), { nullable: true });
  table.columns.add('Expirable', sql.NVarChar(40), { nullable: true });
  table.columns.add('SkuType', sql.NVarChar(80), { nullable: true });
  table.columns.add('Image', sql.NVarChar(500), { nullable: true });
  table.columns.add('PageUrl', sql.NVarChar(500), { nullable: true });
  table.columns.add('SourceFileName', sql.NVarChar(255), { nullable: true });

  for (const row of rows) {
    table.rows.add(
      row.normalizedSku,
      row.skuCode,
      row.itemName || null,
      row.category || null,
      row.color || null,
      row.brand || null,
      row.hsnCode || null,
      row.tat || null,
      row.size || null,
      row.weight || null,
      row.costPrice,
      row.mrp,
      row.batchGroup || null,
      row.ean || null,
      row.dimensions || null,
      row.taxType || null,
      row.enabled || null,
      row.itemType || null,
      row.expirable || null,
      row.skuType || null,
      row.image || null,
      row.pageUrl || null,
      row.sourceFileName || null,
    );
  }

  return table;
};

const fetchMasterRowsBySkus = async (pool, normalizedSkus = []) => {
  const uniqueSkus = [...new Set(normalizedSkus.filter(Boolean))];
  const records = [];

  for (let chunkStart = 0; chunkStart < uniqueSkus.length; chunkStart += 500) {
    const chunk = uniqueSkus.slice(chunkStart, chunkStart + 500);
    const request = pool.request();
    const params = chunk.map((sku, index) => {
      const name = `sku${chunkStart + index}`;
      request.input(name, sql.NVarChar(120), sku);
      return `@${name}`;
    });

    const result = await request.query(`
      SELECT
        Id,
        NormalizedSku,
        SkuCode,
        ItemName,
        Category,
        Color,
        Brand,
        HsnCode,
        Tat,
        Size,
        Weight,
        CostPrice,
        MRP,
        BatchGroup,
        EAN,
        Dimensions,
        TaxType,
        Enabled,
        ItemType,
        Expirable,
        SkuType,
        Image,
        PageUrl,
        SourceFileName,
        UpdatedAt
      FROM PriceItemMaster
      WHERE NormalizedSku IN (${params.join(', ')})
    `);

    records.push(...result.recordset);
  }

  return new Map(records.map((row) => [row.NormalizedSku, row]));
};

const buildPreviewItems = (pickListItems = [], masterMap = new Map()) =>
  pickListItems.map((line, index) => {
    const master = masterMap.get(normalizeSku(line.skuCode));
    const matched = Boolean(master);
    const qty = Math.max(1, normalizeNumeric(line.qty) || 1);
    const currentPrice = matched ? normalizeNumeric(master.MRP) : 0;

    return {
      serialNo: Math.max(1, normalizeNumeric(line.serialNo) || index + 1),
      skuCode: cleanText(line.skuCode),
      pickListName: cleanText(line.pickListName || line.skuCode),
      itemName: matched ? cleanText(master.ItemName || line.pickListName || line.skuCode) : cleanText(line.pickListName || line.skuCode),
      brand: matched ? cleanText(master.Brand) : '',
      category: matched ? cleanText(master.Category) : '',
      shelfCode: cleanText(line.shelfCode),
      size: matched ? cleanText(master.Size || line.size) : cleanText(line.size),
      color: matched ? cleanText(master.Color || line.color) : cleanText(line.color),
      qty,
      labelQty: qty,
      costPrice: matched ? normalizeNumeric(master.CostPrice) : 0,
      currentPrice,
      totalPrice: Number((qty * currentPrice).toFixed(2)),
      hsnCode: matched ? cleanText(master.HsnCode) : '',
      ean: matched ? cleanText(master.EAN) : '',
      weight: matched ? cleanText(master.Weight) : '',
      pageUrl: matched ? cleanText(master.PageUrl) : '',
      matchStatus: matched ? 'Matched' : 'Unmatched',
      notes: '',
    };
  });

const buildConfigurationNo = (id, createdAt = new Date()) => {
  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getDate()).padStart(2, '0');
  return `PC-${year}${month}${day}-${String(id).padStart(5, '0')}`;
};

exports.getItemMaster = async (req, res) => {
  try {
    const pool = await poolPromise;
    await ensureSchema(pool);
    const result = await fetchItemMasterPage(pool, req.query.search, req.query.page, req.query.limit);
    res.json(result);
  } catch (err) {
    console.error('[price-config.getItemMaster]', err);
    res.status(500).json({ message: 'Failed to load item master data.', error: err.message });
  }
};

exports.importItemMaster = async (req, res) => {
  const { itemMasterFileName, itemMasterBase64 } = req.body || {};

  if (!itemMasterBase64) {
    return res.status(400).json({ message: 'The item master Excel file is required.' });
  }

  let itemMasterPath = null;
  const pool = await poolPromise;
  await ensureSchema(pool);
  const transaction = new sql.Transaction(pool);

  try {
    itemMasterPath = await writeTempFile('item-master', itemMasterFileName, decodeBase64File(itemMasterBase64));
    const parsed = await runParser('item-master', itemMasterPath);
    const rows = (parsed.items || [])
      .map((row) => toItemMasterImportRow(row, itemMasterFileName))
      .filter((row) => row.normalizedSku && row.skuCode);

    if (!rows.length) {
      return res.status(400).json({ message: 'No valid item master rows were found in the uploaded Excel file.' });
    }

    await transaction.begin();
    await transaction.request().query('DELETE FROM PriceItemMaster;');

    const bulkTable = buildItemMasterBulkTable(rows);
    await transaction.request().bulk(bulkTable);

    const uploadedAt = new Date();
    await transaction.request()
      .input('lastUploadFileName', sql.NVarChar(255), trimOrNull(itemMasterFileName))
      .input('lastUploadedAt', sql.DateTime2, uploadedAt)
      .input('totalItems', sql.Int, rows.length)
      .input('updatedBy', sql.Int, req.user?.id || null)
      .query(`
        IF EXISTS (SELECT 1 FROM PriceItemMasterMeta WHERE Id = 1)
        BEGIN
          UPDATE PriceItemMasterMeta
          SET
            LastUploadFileName = @lastUploadFileName,
            LastUploadedAt = @lastUploadedAt,
            TotalItems = @totalItems,
            UpdatedBy = @updatedBy,
            UpdatedAt = GETDATE()
          WHERE Id = 1;
        END
        ELSE
        BEGIN
          INSERT INTO PriceItemMasterMeta (
            Id,
            LastUploadFileName,
            LastUploadedAt,
            TotalItems,
            UpdatedBy
          )
          VALUES (
            1,
            @lastUploadFileName,
            @lastUploadedAt,
            @totalItems,
            @updatedBy
          );
        END
      `);

    await transaction.commit();

    const page = await fetchItemMasterPage(pool, '', 1, 15);
    res.json(page);
  } catch (err) {
    if (transaction._aborted !== true && transaction._acquiredConnection) {
      await transaction.rollback().catch(() => {});
    }
    console.error('[price-config.importItemMaster]', err);
    res.status(500).json({ message: 'Failed to import the item master file.', error: err.message });
  } finally {
    await Promise.all([
      itemMasterPath ? fs.unlink(itemMasterPath).catch(() => {}) : Promise.resolve(),
    ]);
  }
};

exports.updateItemMasterItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: 'A valid item master row id is required.' });
    }

    const body = req.body || {};
    const skuCode = cleanText(body.skuCode);
    const normalizedSku = normalizeSku(skuCode);

    if (!skuCode || !normalizedSku) {
      return res.status(400).json({ message: 'SKU Code is required.' });
    }

    const pool = await poolPromise;
    await ensureSchema(pool);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('normalizedSku', sql.NVarChar(120), normalizedSku)
      .input('skuCode', sql.NVarChar(120), skuCode)
      .input('itemName', sql.NVarChar(255), trimOrNull(body.itemName))
      .input('category', sql.NVarChar(120), trimOrNull(body.category))
      .input('color', sql.NVarChar(120), trimOrNull(body.color))
      .input('brand', sql.NVarChar(120), trimOrNull(body.brand))
      .input('hsnCode', sql.NVarChar(60), trimOrNull(body.hsnCode))
      .input('tat', sql.NVarChar(60), trimOrNull(body.tat))
      .input('size', sql.NVarChar(80), trimOrNull(body.size))
      .input('weight', sql.NVarChar(80), trimOrNull(body.weight))
      .input('costPrice', sql.Decimal(18, 2), normalizeNumeric(body.costPrice))
      .input('mrp', sql.Decimal(18, 2), normalizeNumeric(body.mrp))
      .input('batchGroup', sql.NVarChar(120), trimOrNull(body.batchGroup))
      .input('ean', sql.NVarChar(120), trimOrNull(body.ean))
      .input('dimensions', sql.NVarChar(120), trimOrNull(body.dimensions))
      .input('taxType', sql.NVarChar(80), trimOrNull(body.taxType))
      .input('enabled', sql.NVarChar(40), trimOrNull(body.enabled))
      .input('itemType', sql.NVarChar(80), trimOrNull(body.itemType))
      .input('expirable', sql.NVarChar(40), trimOrNull(body.expirable))
      .input('skuType', sql.NVarChar(80), trimOrNull(body.skuType))
      .input('image', sql.NVarChar(500), trimOrNull(body.image))
      .input('pageUrl', sql.NVarChar(500), trimOrNull(body.pageUrl))
      .query(`
        UPDATE PriceItemMaster
        SET
          NormalizedSku = @normalizedSku,
          SkuCode = @skuCode,
          ItemName = @itemName,
          Category = @category,
          Color = @color,
          Brand = @brand,
          HsnCode = @hsnCode,
          Tat = @tat,
          Size = @size,
          Weight = @weight,
          CostPrice = @costPrice,
          MRP = @mrp,
          BatchGroup = @batchGroup,
          EAN = @ean,
          Dimensions = @dimensions,
          TaxType = @taxType,
          Enabled = @enabled,
          ItemType = @itemType,
          Expirable = @expirable,
          SkuType = @skuType,
          Image = @image,
          PageUrl = @pageUrl,
          UpdatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE Id = @id
      `);

    if (!result.recordset[0]) {
      return res.status(404).json({ message: 'Item master row not found.' });
    }

    res.json(toItemMasterRow(result.recordset[0]));
  } catch (err) {
    console.error('[price-config.updateItemMasterItem]', err);
    res.status(500).json({ message: 'Failed to update the item master row.', error: err.message });
  }
};

exports.getAll = async (_req, res) => {
  try {
    const pool = await poolPromise;
    await ensureSchema(pool);
    const result = await pool.request().query(`
      SELECT
        Id,
        ConfigurationNo,
        PickListNo,
        CreatedAt,
        UpdatedAt,
        ItemsJson
      FROM PriceConfigurations
      ORDER BY UpdatedAt DESC, Id DESC
    `);

    res.json(result.recordset.map((row) => {
      const items = JSON.parse(row.ItemsJson || '[]');
      return {
        id: row.Id,
        configurationNo: row.ConfigurationNo,
        pickListNo: row.PickListNo,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt,
        ...buildSummary(items),
      };
    }));
  } catch (err) {
    console.error('[price-config.getAll]', err);
    res.status(500).json({ message: 'Failed to retrieve saved price configurations.', error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pool = await poolPromise;
    await ensureSchema(pool);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM PriceConfigurations WHERE Id = @id');

    if (!result.recordset[0]) {
      return res.status(404).json({ message: 'Price configuration not found.' });
    }

    res.json(mapRecord(result.recordset[0]));
  } catch (err) {
    console.error('[price-config.getById]', err);
    res.status(500).json({ message: 'Failed to retrieve the price configuration.', error: err.message });
  }
};

exports.preview = async (req, res) => {
  const { pickListFileName, pickListBase64 } = req.body || {};

  if (!pickListBase64) {
    return res.status(400).json({ message: 'The pick list file is required.' });
  }

  let pickListPath = null;

  try {
    const pool = await poolPromise;
    await ensureSchema(pool);
    const meta = await fetchItemMasterMeta(pool);
    if (!meta.hasData) {
      return res.status(400).json({ message: 'Upload the item master before generating a pick list preview.' });
    }

    pickListPath = await writeTempFile('pick-list', pickListFileName, decodeBase64File(pickListBase64));
    const pickList = await runParser('pick-list', pickListPath);
    const pickListItems = Array.isArray(pickList.items) ? pickList.items : [];

    if (!pickListItems.length) {
      return res.status(400).json({
        message: 'No pick list rows were found in the uploaded file. Make sure the PDF is a valid pick list with serial numbers, or try uploading the pick list as an Excel file.',
      });
    }

    const masterMap = await fetchMasterRowsBySkus(
      pool,
      pickListItems.map((item) => normalizeSku(item.skuCode))
    );

    const items = buildPreviewItems(pickListItems, masterMap);
    res.json({
      pickListNo: cleanText(pickList.pickListNo || path.parse(pickListFileName || 'pick-list').name),
      pickListCreatedAt: trimOrNull(pickList.pickListCreatedAt),
      itemMasterFileName: meta.lastUploadFileName,
      itemMasterUploadedAt: meta.lastUploadedAt,
      pickListFileName: trimOrNull(pickListFileName),
      ...buildSummary(items),
      labelTemplate: LABEL_TEMPLATE_FALLBACK,
      items,
    });
  } catch (err) {
    console.error('[price-config.preview]', err);
    res.status(500).json({ message: 'Failed to generate the pick list preview.', error: err.message });
  } finally {
    await Promise.all([
      pickListPath ? fs.unlink(pickListPath).catch(() => {}) : Promise.resolve(),
    ]);
  }
};

exports.create = async (req, res) => {
  const body = req.body || {};
  const items = withDerivedFields(body.items);

  if (!body.pickListNo || items.length === 0) {
    return res.status(400).json({ message: 'pickListNo and at least one pick list row are required.' });
  }

  const labelTemplate = sanitizeLabelTemplate(body.labelTemplate);
  const provisionalConfigurationNo = `TMP-${crypto.randomUUID()}`;

  try {
    const pool = await poolPromise;
    await ensureSchema(pool);
    const insertResult = await pool.request()
      .input('configurationNo', sql.NVarChar(50), provisionalConfigurationNo)
      .input('pickListNo', sql.NVarChar(100), cleanText(body.pickListNo))
      .input('pickListCreatedAt', sql.NVarChar(100), trimOrNull(body.pickListCreatedAt))
      .input('itemMasterFileName', sql.NVarChar(255), trimOrNull(body.itemMasterFileName))
      .input('itemMasterUploadedAt', sql.DateTime2, parseDateOrNull(body.itemMasterUploadedAt))
      .input('pickListFileName', sql.NVarChar(255), trimOrNull(body.pickListFileName))
      .input('itemsJson', sql.NVarChar(sql.MAX), JSON.stringify(items))
      .input('labelTemplateJson', sql.NVarChar(sql.MAX), JSON.stringify(labelTemplate))
      .input('createdBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO PriceConfigurations (
          ConfigurationNo,
          PickListNo,
          PickListCreatedAt,
          ItemMasterFileName,
          ItemMasterUploadedAt,
          PickListFileName,
          ItemsJson,
          LabelTemplateJson,
          CreatedBy
        )
        OUTPUT INSERTED.Id, INSERTED.CreatedAt
        VALUES (
          @configurationNo,
          @pickListNo,
          @pickListCreatedAt,
          @itemMasterFileName,
          @itemMasterUploadedAt,
          @pickListFileName,
          @itemsJson,
          @labelTemplateJson,
          @createdBy
        )
      `);

    const inserted = insertResult.recordset[0];
    const configurationNo = buildConfigurationNo(inserted.Id, inserted.CreatedAt);

    await pool.request()
      .input('id', sql.Int, inserted.Id)
      .input('configurationNo', sql.NVarChar(50), configurationNo)
      .query(`
        UPDATE PriceConfigurations
        SET ConfigurationNo = @configurationNo, UpdatedAt = GETDATE()
        WHERE Id = @id
      `);

    const fullResult = await pool.request()
      .input('id', sql.Int, inserted.Id)
      .query('SELECT * FROM PriceConfigurations WHERE Id = @id');

    res.status(201).json(mapRecord(fullResult.recordset[0]));
  } catch (err) {
    console.error('[price-config.create]', err);
    res.status(500).json({ message: 'Failed to save the price configuration.', error: err.message });
  }
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body || {};
  const items = withDerivedFields(body.items);

  if (!body.pickListNo || items.length === 0) {
    return res.status(400).json({ message: 'pickListNo and at least one pick list row are required.' });
  }

  try {
    const pool = await poolPromise;
    await ensureSchema(pool);
    const updateResult = await pool.request()
      .input('id', sql.Int, id)
      .input('pickListNo', sql.NVarChar(100), cleanText(body.pickListNo))
      .input('pickListCreatedAt', sql.NVarChar(100), trimOrNull(body.pickListCreatedAt))
      .input('itemMasterFileName', sql.NVarChar(255), trimOrNull(body.itemMasterFileName))
      .input('itemMasterUploadedAt', sql.DateTime2, parseDateOrNull(body.itemMasterUploadedAt))
      .input('pickListFileName', sql.NVarChar(255), trimOrNull(body.pickListFileName))
      .input('itemsJson', sql.NVarChar(sql.MAX), JSON.stringify(items))
      .input('labelTemplateJson', sql.NVarChar(sql.MAX), JSON.stringify(sanitizeLabelTemplate(body.labelTemplate)))
      .query(`
        UPDATE PriceConfigurations
        SET
          PickListNo = @pickListNo,
          PickListCreatedAt = @pickListCreatedAt,
          ItemMasterFileName = @itemMasterFileName,
          ItemMasterUploadedAt = @itemMasterUploadedAt,
          PickListFileName = @pickListFileName,
          ItemsJson = @itemsJson,
          LabelTemplateJson = @labelTemplateJson,
          UpdatedAt = GETDATE()
        WHERE Id = @id;

        SELECT * FROM PriceConfigurations WHERE Id = @id;
      `);

    if (!updateResult.recordset[0]) {
      return res.status(404).json({ message: 'Price configuration not found.' });
    }

    res.json(mapRecord(updateResult.recordset[0]));
  } catch (err) {
    console.error('[price-config.update]', err);
    res.status(500).json({ message: 'Failed to update the price configuration.', error: err.message });
  }
};
