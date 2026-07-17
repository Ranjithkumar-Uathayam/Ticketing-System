const { sql, poolPromise } = require('../db');

let schemaReadyPromise = null;

const ensureSchema = async (pool) => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = pool.request().query(`
      IF OBJECT_ID('dbo.LabelPrintLogs', 'U') IS NULL
      BEGIN
          CREATE TABLE LabelPrintLogs (
              Id INT PRIMARY KEY IDENTITY(1,1),
              FileName NVARCHAR(255) NULL,
              PageNumber INT NOT NULL,
              GlobalLabelIndex INT NOT NULL,
              TotalLabels INT NOT NULL,
              PrinterName NVARCHAR(255) NULL,
              LabelWidthMm DECIMAL(10,2) NULL,
              LabelHeightMm DECIMAL(10,2) NULL,
              Status NVARCHAR(20) NOT NULL,
              ErrorMessage NVARCHAR(MAX) NULL,
              PrintedBy INT NULL,
              PrintedAt DATETIME2 NOT NULL DEFAULT GETDATE()
          );

          CREATE INDEX IX_LabelPrintLogs_PrintedAt
          ON LabelPrintLogs (PrintedAt DESC, Id DESC);
      END;

      IF NOT EXISTS (
          SELECT 1
          FROM sys.foreign_keys
          WHERE name = 'FK_LabelPrintLogs_Users'
      ) AND OBJECT_ID('dbo.Users', 'U') IS NOT NULL
      BEGIN
          ALTER TABLE LabelPrintLogs
          ADD CONSTRAINT FK_LabelPrintLogs_Users
          FOREIGN KEY (PrintedBy) REFERENCES Users(Id);
      END;
    `).catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
};

const trimOrNull = (v) => {
  const s = typeof v === 'string' ? v.trim() : v;
  return s === '' || s === undefined || s === null ? null : s;
};

exports.create = async (req, res) => {
  const body = req.body || {};
  const status = body.status === 'Success' || body.status === 'Failed' ? body.status : null;

  if (!status) {
    return res.status(400).json({ message: 'status must be "Success" or "Failed".' });
  }
  if (!Number.isInteger(body.pageNumber) || !Number.isInteger(body.globalIndex) || !Number.isInteger(body.totalLabels)) {
    return res.status(400).json({ message: 'pageNumber, globalIndex, and totalLabels are required integers.' });
  }

  try {
    const pool = await poolPromise;
    await ensureSchema(pool);

    await pool.request()
      .input('fileName', sql.NVarChar(255), trimOrNull(body.fileName))
      .input('pageNumber', sql.Int, body.pageNumber)
      .input('globalLabelIndex', sql.Int, body.globalIndex)
      .input('totalLabels', sql.Int, body.totalLabels)
      .input('printerName', sql.NVarChar(255), trimOrNull(body.printerName))
      .input('labelWidthMm', sql.Decimal(10, 2), body.widthMm ?? null)
      .input('labelHeightMm', sql.Decimal(10, 2), body.heightMm ?? null)
      .input('status', sql.NVarChar(20), status)
      .input('errorMessage', sql.NVarChar(sql.MAX), trimOrNull(body.errorMessage))
      .input('printedBy', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO LabelPrintLogs (
          FileName, PageNumber, GlobalLabelIndex, TotalLabels, PrinterName,
          LabelWidthMm, LabelHeightMm, Status, ErrorMessage, PrintedBy
        ) VALUES (
          @fileName, @pageNumber, @globalLabelIndex, @totalLabels, @printerName,
          @labelWidthMm, @labelHeightMm, @status, @errorMessage, @printedBy
        );
      `);

    res.status(201).json({ message: 'Logged.' });
  } catch (err) {
    console.error('[label-print-log.create]', err);
    res.status(500).json({ message: 'Failed to record the print log entry.', error: err.message });
  }
};

exports.getRecent = async (req, res) => {
  try {
    const pool = await poolPromise;
    await ensureSchema(pool);

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const fileName = trimOrNull(req.query.fileName);

    const request = pool.request().input('limit', sql.Int, limit);
    let where = '';
    if (fileName) {
      request.input('fileName', sql.NVarChar(255), fileName);
      where = 'WHERE FileName = @fileName';
    }

    const result = await request.query(`
      SELECT TOP (@limit) *
      FROM LabelPrintLogs
      ${where}
      ORDER BY PrintedAt DESC, Id DESC
    `);

    res.json(result.recordset.map((row) => ({
      globalIndex: row.GlobalLabelIndex,
      pageNumber: row.PageNumber,
      fileName: row.FileName,
      totalLabels: row.TotalLabels,
      printerName: row.PrinterName,
      widthMm: row.LabelWidthMm,
      heightMm: row.LabelHeightMm,
      status: row.Status,
      errorMessage: row.ErrorMessage,
      printedAt: row.PrintedAt,
    })));
  } catch (err) {
    console.error('[label-print-log.getRecent]', err);
    res.status(500).json({ message: 'Failed to retrieve print log history.', error: err.message });
  }
};
