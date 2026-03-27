// backend/controllers/customer-entry.controller.js
const { sql, poolPromise } = require('../db');

// ── camelCase mapper ──────────────────────────────────────────────────────────
const map = (r) => ({
  id:           r.Id,
  entryDate:    r.EntryDate,
  employeeName: r.EmployeeName,
  employeeId:   r.EmployeeId,

  avcQty:           r.AvcQty,
  pvcQty:           r.PvcQty,
  emailWhatsappQty: r.EmailWhatsappQty,

  engatiAriserQty:  r.EngatiAriserQty,
  engatiUdhayamQty: r.EngatiUdhayamQty,

  exchangePickupQty:           r.ExchangePickupQty,
  exchangeCallQty:             r.ExchangeCallQty,
  exchangeOrderReplacementQty: r.ExchangeOrderReplacementQty,

  poQty: r.PoQty,

  mailAriser:  !!r.MailAriser,
  mailUdhayam: !!r.MailUdhayam,

  looxAriser:  !!r.LooxAriser,
  looxUdhayam: !!r.LooxUdhayam,

  facebookAriser:  !!r.FacebookAriser,
  facebookUdhayam: !!r.FacebookUdhayam,

  ndr:           !!r.Ndr,
  mis:           !!r.Mis,
  postOfficeMail: !!r.PostOfficeMail,

  refundPrepaidAmount: r.RefundPrepaidAmount,
  refundCodAmount:     r.RefundCodAmount,
  paymentLinkAmount:   r.PaymentLinkAmount,

  offlineOrderQty:    r.OfflineOrderQty,
  offlineOrderAmount: r.OfflineOrderAmount,

  manualOrderQty:    r.ManualOrderQty,
  manualOrderAmount: r.ManualOrderAmount,

  createdAt: r.CreatedAt,
  updatedAt: r.UpdatedAt,
});

// ── GET all ───────────────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .query('SELECT * FROM CustomerEntries ORDER BY EntryDate DESC, Id DESC');
    res.json(result.recordset.map(map));
  } catch (err) {
    console.error('customerEntry getAll error:', err);
    res.status(500).json({ message: 'Failed to retrieve records', error: err.message });
  }
};

// ── GET by ID ─────────────────────────────────────────────────────────────────
exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM CustomerEntries WHERE Id = @id');
    if (!result.recordset[0])
      return res.status(404).json({ message: 'Entry not found.' });
    res.json(map(result.recordset[0]));
  } catch (err) {
    console.error('customerEntry getById error:', err);
    res.status(500).json({ message: 'Failed to retrieve record', error: err.message });
  }
};

// ── POST create ───────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const b = req.body;
  if (!b.entryDate)    return res.status(400).json({ message: 'entryDate is required.' });
  if (!b.employeeName) return res.status(400).json({ message: 'employeeName is required.' });
  if (!b.employeeId)   return res.status(400).json({ message: 'employeeId is required.' });

  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('entryDate',    sql.Date,     b.entryDate)
      .input('employeeName', sql.NVarChar, b.employeeName)
      .input('employeeId',   sql.NVarChar, b.employeeId)
      .input('avcQty',           sql.Int, b.avcQty           ?? 0)
      .input('pvcQty',           sql.Int, b.pvcQty           ?? 0)
      .input('emailWhatsappQty', sql.Int, b.emailWhatsappQty ?? 0)
      .input('engatiAriserQty',  sql.Int, b.engatiAriserQty  ?? 0)
      .input('engatiUdhayamQty', sql.Int, b.engatiUdhayamQty ?? 0)
      .input('exchangePickupQty',            sql.Int, b.exchangePickupQty            ?? 0)
      .input('exchangeCallQty',              sql.Int, b.exchangeCallQty              ?? 0)
      .input('exchangeOrderReplacementQty',  sql.Int, b.exchangeOrderReplacementQty  ?? 0)
      .input('poQty',            sql.Int, b.poQty            ?? 0)
      .input('mailAriser',       sql.Bit, b.mailAriser   ? 1 : 0)
      .input('mailUdhayam',      sql.Bit, b.mailUdhayam  ? 1 : 0)
      .input('looxAriser',       sql.Bit, b.looxAriser   ? 1 : 0)
      .input('looxUdhayam',      sql.Bit, b.looxUdhayam  ? 1 : 0)
      .input('facebookAriser',   sql.Bit, b.facebookAriser   ? 1 : 0)
      .input('facebookUdhayam',  sql.Bit, b.facebookUdhayam  ? 1 : 0)
      .input('ndr',              sql.Bit, b.ndr           ? 1 : 0)
      .input('mis',              sql.Bit, b.mis           ? 1 : 0)
      .input('postOfficeMail',   sql.Bit, b.postOfficeMail ? 1 : 0)
      .input('refundPrepaidAmount', sql.Decimal(12,2), b.refundPrepaidAmount ?? 0)
      .input('refundCodAmount',     sql.Decimal(12,2), b.refundCodAmount     ?? 0)
      .input('paymentLinkAmount',   sql.Decimal(12,2), b.paymentLinkAmount   ?? 0)
      .input('offlineOrderQty',    sql.Int,          b.offlineOrderQty    ?? 0)
      .input('offlineOrderAmount', sql.Decimal(12,2), b.offlineOrderAmount ?? 0)
      .input('manualOrderQty',    sql.Int,           b.manualOrderQty    ?? 0)
      .input('manualOrderAmount', sql.Decimal(12,2), b.manualOrderAmount ?? 0)
      .query(`
        INSERT INTO CustomerEntries (
          EntryDate, EmployeeName, EmployeeId,
          AvcQty, PvcQty, EmailWhatsappQty,
          EngatiAriserQty, EngatiUdhayamQty,
          ExchangePickupQty, ExchangeCallQty, ExchangeOrderReplacementQty,
          PoQty,
          MailAriser, MailUdhayam,
          LooxAriser, LooxUdhayam,
          FacebookAriser, FacebookUdhayam,
          Ndr, Mis, PostOfficeMail,
          RefundPrepaidAmount, RefundCodAmount,
          PaymentLinkAmount,
          OfflineOrderQty, OfflineOrderAmount,
          ManualOrderQty, ManualOrderAmount
        )
        OUTPUT INSERTED.*
        VALUES (
          @entryDate, @employeeName, @employeeId,
          @avcQty, @pvcQty, @emailWhatsappQty,
          @engatiAriserQty, @engatiUdhayamQty,
          @exchangePickupQty, @exchangeCallQty, @exchangeOrderReplacementQty,
          @poQty,
          @mailAriser, @mailUdhayam,
          @looxAriser, @looxUdhayam,
          @facebookAriser, @facebookUdhayam,
          @ndr, @mis, @postOfficeMail,
          @refundPrepaidAmount, @refundCodAmount,
          @paymentLinkAmount,
          @offlineOrderQty, @offlineOrderAmount,
          @manualOrderQty, @manualOrderAmount
        )
      `);
    res.status(201).json(map(result.recordset[0]));
  } catch (err) {
    console.error('customerEntry create error:', err);
    res.status(500).json({ message: 'Failed to create entry', error: err.message });
  }
};

// ── PUT update ────────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b  = req.body;

  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id',           sql.Int,      id)
      .input('entryDate',    sql.Date,     b.entryDate)
      .input('employeeName', sql.NVarChar, b.employeeName)
      .input('employeeId',   sql.NVarChar, b.employeeId)
      .input('avcQty',           sql.Int, b.avcQty           ?? 0)
      .input('pvcQty',           sql.Int, b.pvcQty           ?? 0)
      .input('emailWhatsappQty', sql.Int, b.emailWhatsappQty ?? 0)
      .input('engatiAriserQty',  sql.Int, b.engatiAriserQty  ?? 0)
      .input('engatiUdhayamQty', sql.Int, b.engatiUdhayamQty ?? 0)
      .input('exchangePickupQty',            sql.Int, b.exchangePickupQty            ?? 0)
      .input('exchangeCallQty',              sql.Int, b.exchangeCallQty              ?? 0)
      .input('exchangeOrderReplacementQty',  sql.Int, b.exchangeOrderReplacementQty  ?? 0)
      .input('poQty',            sql.Int, b.poQty            ?? 0)
      .input('mailAriser',       sql.Bit, b.mailAriser   ? 1 : 0)
      .input('mailUdhayam',      sql.Bit, b.mailUdhayam  ? 1 : 0)
      .input('looxAriser',       sql.Bit, b.looxAriser   ? 1 : 0)
      .input('looxUdhayam',      sql.Bit, b.looxUdhayam  ? 1 : 0)
      .input('facebookAriser',   sql.Bit, b.facebookAriser   ? 1 : 0)
      .input('facebookUdhayam',  sql.Bit, b.facebookUdhayam  ? 1 : 0)
      .input('ndr',              sql.Bit, b.ndr           ? 1 : 0)
      .input('mis',              sql.Bit, b.mis           ? 1 : 0)
      .input('postOfficeMail',   sql.Bit, b.postOfficeMail ? 1 : 0)
      .input('refundPrepaidAmount', sql.Decimal(12,2), b.refundPrepaidAmount ?? 0)
      .input('refundCodAmount',     sql.Decimal(12,2), b.refundCodAmount     ?? 0)
      .input('paymentLinkAmount',   sql.Decimal(12,2), b.paymentLinkAmount   ?? 0)
      .input('offlineOrderQty',    sql.Int,           b.offlineOrderQty    ?? 0)
      .input('offlineOrderAmount', sql.Decimal(12,2), b.offlineOrderAmount ?? 0)
      .input('manualOrderQty',    sql.Int,            b.manualOrderQty    ?? 0)
      .input('manualOrderAmount', sql.Decimal(12,2),  b.manualOrderAmount ?? 0)
      .query(`
        UPDATE CustomerEntries SET
          EntryDate    = @entryDate,
          EmployeeName = @employeeName,
          EmployeeId   = @employeeId,
          AvcQty = @avcQty, PvcQty = @pvcQty, EmailWhatsappQty = @emailWhatsappQty,
          EngatiAriserQty = @engatiAriserQty, EngatiUdhayamQty = @engatiUdhayamQty,
          ExchangePickupQty = @exchangePickupQty, ExchangeCallQty = @exchangeCallQty,
          ExchangeOrderReplacementQty = @exchangeOrderReplacementQty,
          PoQty = @poQty,
          MailAriser = @mailAriser, MailUdhayam = @mailUdhayam,
          LooxAriser = @looxAriser, LooxUdhayam = @looxUdhayam,
          FacebookAriser = @facebookAriser, FacebookUdhayam = @facebookUdhayam,
          Ndr = @ndr, Mis = @mis, PostOfficeMail = @postOfficeMail,
          RefundPrepaidAmount = @refundPrepaidAmount, RefundCodAmount = @refundCodAmount,
          PaymentLinkAmount = @paymentLinkAmount,
          OfflineOrderQty = @offlineOrderQty, OfflineOrderAmount = @offlineOrderAmount,
          ManualOrderQty = @manualOrderQty, ManualOrderAmount = @manualOrderAmount,
          UpdatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE Id = @id
      `);
    if (!result.recordset[0])
      return res.status(404).json({ message: 'Entry not found.' });
    res.json(map(result.recordset[0]));
  } catch (err) {
    console.error('customerEntry update error:', err);
    res.status(500).json({ message: 'Failed to update entry', error: err.message });
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM CustomerEntries WHERE Id = @id');
    res.status(204).send();
  } catch (err) {
    console.error('customerEntry remove error:', err);
    res.status(500).json({ message: 'Failed to delete entry', error: err.message });
  }
};