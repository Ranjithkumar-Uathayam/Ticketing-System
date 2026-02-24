// backend/controllers/dispatch.controller.js
const { sql, poolPromise } = require('../db');

// ── Mappers ──────────────────────────────────────────────────────────────────

const mapHeader = (h) => ({
  id:            h.Id,
  dispatchDate:  h.DispatchDate ? h.DispatchDate.toISOString().split('T')[0] : null,
  totalPersons:  h.TotalPersons,
  pendingOrders: h.PendingOrders,
  onlyInvoiced:  h.OnlyInvoiced,
  createdAt:     h.CreatedAt,
  updatedAt:     h.UpdatedAt,
});

const mapDispatchItem = (d) => ({
  id:        d.Id,
  headerId:  d.HeaderId,
  channel:   d.Channel,
  courier:   d.Courier,
  quantity:  d.Quantity,
  sortOrder: d.SortOrder,
});

const mapReturnItem = (r) => ({
  id:        r.Id,
  headerId:  r.HeaderId,
  channel:   r.Channel,
  courier:   r.Courier,
  rto:       r.RTO,
  cus:       r.CUS,
  sortOrder: r.SortOrder,
});

// ── GET all ──────────────────────────────────────────────────────────────────

exports.getAll = async (req, res) => {
  try {
    const pool = await poolPromise;

    const headers = await pool.request()
      .query('SELECT * FROM DispatchHeaders ORDER BY DispatchDate DESC');

    if (headers.recordset.length === 0) return res.json([]);

    const ids = headers.recordset.map(h => h.Id).join(',');

    const [dispatches, returns] = await Promise.all([
      pool.request().query(`SELECT * FROM DispatchItems WHERE HeaderId IN (${ids}) ORDER BY SortOrder`),
      pool.request().query(`SELECT * FROM ReturnItems  WHERE HeaderId IN (${ids}) ORDER BY SortOrder`),
    ]);

    const result = headers.recordset.map(h => ({
      ...mapHeader(h),
      dispatchItems: dispatches.recordset.filter(d => d.HeaderId === h.Id).map(mapDispatchItem),
      returnItems:   returns.recordset.filter(r => r.HeaderId === h.Id).map(mapReturnItem),
    }));

    res.json(result);
  } catch (err) {
    console.error('dispatch getAll error:', err);
    res.status(500).json({ message: 'Failed to retrieve dispatch records', error: err.message });
  }
};

// ── GET single by id ──────────────────────────────────────────────────────────

exports.getById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const pool = await poolPromise;

    const headerRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM DispatchHeaders WHERE Id = @id');

    if (!headerRes.recordset.length)
      return res.status(404).json({ message: 'Record not found.' });

    const h = headerRes.recordset[0];

    const [dispatches, returns] = await Promise.all([
      pool.request().input('hid', sql.Int, h.Id)
          .query('SELECT * FROM DispatchItems WHERE HeaderId = @hid ORDER BY SortOrder'),
      pool.request().input('hid', sql.Int, h.Id)
          .query('SELECT * FROM ReturnItems  WHERE HeaderId = @hid ORDER BY SortOrder'),
    ]);

    res.json({
      ...mapHeader(h),
      dispatchItems: dispatches.recordset.map(mapDispatchItem),
      returnItems:   returns.recordset.map(mapReturnItem),
    });
  } catch (err) {
    console.error('dispatch getById error:', err);
    res.status(500).json({ message: 'Failed to retrieve record', error: err.message });
  }
};

// ── POST create ───────────────────────────────────────────────────────────────

exports.create = async (req, res) => {
  const {
    dispatchDate, totalPersons = 0, pendingOrders = 0, onlyInvoiced = 'NIL',
    dispatchItems = [], returnItems = [],
  } = req.body;

  if (!dispatchDate)
    return res.status(400).json({ message: 'dispatchDate is required.' });

  const pool   = await poolPromise;
  const trans  = new sql.Transaction(pool);

  try {
    await trans.begin();

    const hRes = await new sql.Request(trans)
      .input('dispatchDate',  sql.Date,     dispatchDate)
      .input('totalPersons',  sql.Int,      totalPersons)
      .input('pendingOrders', sql.Int,      pendingOrders)
      .input('onlyInvoiced',  sql.NVarChar, onlyInvoiced)
      .query(`
        INSERT INTO DispatchHeaders (DispatchDate, TotalPersons, PendingOrders, OnlyInvoiced)
        OUTPUT INSERTED.*
        VALUES (@dispatchDate, @totalPersons, @pendingOrders, @onlyInvoiced)
      `);

    const headerId = hRes.recordset[0].Id;

    for (let i = 0; i < dispatchItems.length; i++) {
      const { channel, courier, quantity = 0 } = dispatchItems[i];
      await new sql.Request(trans)
        .input('hid',      sql.Int,      headerId)
        .input('channel',  sql.NVarChar, channel  || null)
        .input('courier',  sql.NVarChar, courier)
        .input('qty',      sql.Int,      quantity)
        .input('sort',     sql.Int,      i + 1)
        .query(`INSERT INTO DispatchItems (HeaderId,Channel,Courier,Quantity,SortOrder)
                VALUES (@hid,@channel,@courier,@qty,@sort)`);
    }

    for (let i = 0; i < returnItems.length; i++) {
      const { channel, courier, rto = 0, cus = 0 } = returnItems[i];
      await new sql.Request(trans)
        .input('hid',     sql.Int,      headerId)
        .input('channel', sql.NVarChar, channel || null)
        .input('courier', sql.NVarChar, courier)
        .input('rto',     sql.Int,      rto)
        .input('cus',     sql.Int,      cus)
        .input('sort',    sql.Int,      i + 1)
        .query(`INSERT INTO ReturnItems (HeaderId,Channel,Courier,RTO,CUS,SortOrder)
                VALUES (@hid,@channel,@courier,@rto,@cus,@sort)`);
    }

    await trans.commit();

    res.status(201).json({
      ...mapHeader(hRes.recordset[0]),
      dispatchItems,
      returnItems,
    });
  } catch (err) {
    await trans.rollback();
    if (err.number === 2627 || err.number === 2601)
      return res.status(409).json({ message: 'A dispatch entry for this date already exists.' });
    console.error('dispatch create error:', err);
    res.status(500).json({ message: 'Failed to create dispatch record', error: err.message });
  }
};

// ── PUT update ────────────────────────────────────────────────────────────────

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const {
    dispatchDate, totalPersons = 0, pendingOrders = 0, onlyInvoiced = 'NIL',
    dispatchItems = [], returnItems = [],
  } = req.body;

  const pool  = await poolPromise;
  const trans = new sql.Transaction(pool);

  try {
    await trans.begin();

    const hRes = await new sql.Request(trans)
      .input('id',            sql.Int,      id)
      .input('dispatchDate',  sql.Date,     dispatchDate)
      .input('totalPersons',  sql.Int,      totalPersons)
      .input('pendingOrders', sql.Int,      pendingOrders)
      .input('onlyInvoiced',  sql.NVarChar, onlyInvoiced)
      .query(`
        UPDATE DispatchHeaders
        SET DispatchDate  = @dispatchDate,
            TotalPersons  = @totalPersons,
            PendingOrders = @pendingOrders,
            OnlyInvoiced  = @onlyInvoiced,
            UpdatedAt     = GETDATE()
        OUTPUT INSERTED.*
        WHERE Id = @id
      `);

    if (!hRes.recordset.length) {
      await trans.rollback();
      return res.status(404).json({ message: 'Record not found.' });
    }

    // Delete old lines and re-insert
    await new sql.Request(trans).input('hid', sql.Int, id)
      .query('DELETE FROM DispatchItems WHERE HeaderId = @hid');
    await new sql.Request(trans).input('hid', sql.Int, id)
      .query('DELETE FROM ReturnItems WHERE HeaderId = @hid');

    for (let i = 0; i < dispatchItems.length; i++) {
      const { channel, courier, quantity = 0 } = dispatchItems[i];
      await new sql.Request(trans)
        .input('hid', sql.Int, id).input('channel', sql.NVarChar, channel || null)
        .input('courier', sql.NVarChar, courier).input('qty', sql.Int, quantity).input('sort', sql.Int, i + 1)
        .query(`INSERT INTO DispatchItems (HeaderId,Channel,Courier,Quantity,SortOrder)
                VALUES (@hid,@channel,@courier,@qty,@sort)`);
    }

    for (let i = 0; i < returnItems.length; i++) {
      const { channel, courier, rto = 0, cus = 0 } = returnItems[i];
      await new sql.Request(trans)
        .input('hid', sql.Int, id).input('channel', sql.NVarChar, channel || null)
        .input('courier', sql.NVarChar, courier).input('rto', sql.Int, rto)
        .input('cus', sql.Int, cus).input('sort', sql.Int, i + 1)
        .query(`INSERT INTO ReturnItems (HeaderId,Channel,Courier,RTO,CUS,SortOrder)
                VALUES (@hid,@channel,@courier,@rto,@cus,@sort)`);
    }

    await trans.commit();
    res.json({ ...mapHeader(hRes.recordset[0]), dispatchItems, returnItems });
  } catch (err) {
    await trans.rollback();
    console.error('dispatch update error:', err);
    res.status(500).json({ message: 'Failed to update dispatch record', error: err.message });
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM DispatchHeaders OUTPUT DELETED.Id WHERE Id = @id');

    if (!result.recordset.length)
      return res.status(404).json({ message: 'Record not found.' });

    res.json({ message: 'Deleted successfully.' });
  } catch (err) {
    console.error('dispatch remove error:', err);
    res.status(500).json({ message: 'Failed to delete record', error: err.message });
  }
};