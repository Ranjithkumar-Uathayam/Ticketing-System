const { sql, poolPromise } = require('../db');

const TICKET_COLUMNS = `
  Id, Title, Description, Status, Priority, Category, SubCategory, Division,
  ReporterId, AssigneeId, CreatedAt, UpdatedAt,
  ScreenshotUrl, ScreenshotFileName, CreatedBy, EmployeeId, ExtensionNumber
`;

const mapTicketToCamelCase = (t) => ({
  id:                t.Id,
  title:             t.Title,
  description:       t.Description,
  status:            t.Status,
  priority:          t.Priority,
  category:          t.Category,
  subCategory:       t.SubCategory,
  division:          t.Division,
  reporterId:        t.ReporterId,
  assigneeId:        t.AssigneeId,
  createdAt:         t.CreatedAt,
  updatedAt:         t.UpdatedAt,
  screenshotUrl:     t.ScreenshotUrl,
  screenshotFileName:t.ScreenshotFileName,
  createdBy:         t.CreatedBy,
  employeeId:        t.EmployeeId,
  extensionNumber:   t.ExtensionNumber,
});

// GET /api/tickets?page=1&limit=50&status=Open&priority=High&assigneeId=5
exports.getAllTickets = async (req, res) => {
  const page       = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit      = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset     = (page - 1) * limit;

  // Optional server-side filters
  const { status, priority, assigneeId, reporterId } = req.query;

  try {
    const pool    = await poolPromise;
    const request = pool.request()
      .input('limit',  sql.Int, limit)
      .input('offset', sql.Int, offset);

    let where = 'WHERE 1=1';
    if (status)     { request.input('status',     sql.NVarChar, status);         where += ' AND Status = @status'; }
    if (priority)   { request.input('priority',   sql.NVarChar, priority);       where += ' AND Priority = @priority'; }
    if (assigneeId) { request.input('assigneeId', sql.Int, parseInt(assigneeId, 10)); where += ' AND AssigneeId = @assigneeId'; }
    if (reporterId) { request.input('reporterId', sql.Int, parseInt(reporterId, 10)); where += ' AND ReporterId = @reporterId'; }

    const result = await request.query(`
      SELECT ${TICKET_COLUMNS}
      FROM Tickets
      ${where}
      ORDER BY UpdatedAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    // Return total count so the frontend can display pagination info
    const countReq = pool.request();
    if (status)     countReq.input('status',     sql.NVarChar, status);
    if (priority)   countReq.input('priority',   sql.NVarChar, priority);
    if (assigneeId) countReq.input('assigneeId', sql.Int, parseInt(assigneeId, 10));
    if (reporterId) countReq.input('reporterId', sql.Int, parseInt(reporterId, 10));
    const countResult = await countReq.query(`SELECT COUNT(*) AS Total FROM Tickets ${where}`);
    const total = countResult.recordset[0].Total;

    res.status(200).json({
      data:  result.recordset.map(mapTicketToCamelCase),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[tickets.getAllTickets]', err);
    res.status(500).json({ message: 'Failed to retrieve tickets.' });
  }
};

exports.createTicket = async (req, res) => {
  const {
    title, description, status, priority, category, subCategory, division,
    reporterId, assigneeId, screenshotUrl, screenshotFileName,
    createdBy, employeeId, extensionNumber,
  } = req.body;

  let resolvedStatus = status || 'New';
  if (assigneeId && resolvedStatus === 'New') resolvedStatus = 'Open';

  const pool        = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const result = await new sql.Request(transaction)
      .input('title',              sql.NVarChar, title)
      .input('description',        sql.NVarChar, description)
      .input('status',             sql.NVarChar, resolvedStatus)
      .input('priority',           sql.NVarChar, priority)
      .input('category',           sql.NVarChar, category           || null)
      .input('subCategory',        sql.NVarChar, subCategory        || null)
      .input('reporterId',         sql.Int,      reporterId)
      .input('assigneeId',         sql.Int,      assigneeId         || null)
      .input('screenshotUrl',      sql.NVarChar, screenshotUrl      || null)
      .input('screenshotFileName', sql.NVarChar, screenshotFileName || null)
      .input('createdBy',          sql.NVarChar, createdBy          || null)
      .input('employeeId',         sql.NVarChar, employeeId         || null)
      .input('extensionNumber',    sql.NVarChar, extensionNumber    || null)
      .input('division',           sql.NVarChar, division           || null)
      .query(`
        INSERT INTO Tickets (
          Title, Description, Status, Priority, Category, SubCategory, Division,
          ReporterId, AssigneeId, ScreenshotUrl, ScreenshotFileName,
          CreatedBy, EmployeeId, ExtensionNumber
        )
        OUTPUT ${TICKET_COLUMNS.split('\n').map(l => `INSERTED.${l.trim()}`).join(', ').replace(/^INSERTED\.\s*/,'INSERTED.')}
        VALUES (
          @title, @description, @status, @priority, @category, @subCategory, @division,
          @reporterId, @assigneeId, @screenshotUrl, @screenshotFileName,
          @createdBy, @employeeId, @extensionNumber
        )
      `);

    const newTicket = result.recordset[0];

    if (newTicket.AssigneeId) {
      await new sql.Request(transaction)
        .input('userId',   sql.Int,      newTicket.AssigneeId)
        .input('ticketId', sql.Int,      newTicket.Id)
        .input('message',  sql.NVarChar, `You have been assigned to ticket #${newTicket.Id}: "${newTicket.Title}"`)
        .query('INSERT INTO Notifications (UserId, TicketId, Message) VALUES (@userId, @ticketId, @message)');
    }

    await transaction.commit();
    res.status(201).json(mapTicketToCamelCase(newTicket));
  } catch (err) {
    await transaction.rollback();
    console.error('[tickets.createTicket]', err);
    res.status(500).json({ message: 'Failed to create ticket.' });
  }
};

exports.updateTicket = async (req, res) => {
  const ticketId = parseInt(req.params.id, 10);
  const {
    title, description, status, priority, category, subCategory, division,
    assigneeId, screenshotUrl, screenshotFileName,
    createdBy, employeeId, extensionNumber,
  } = req.body;

  const pool        = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const oldTicketResult = await new sql.Request(transaction)
      .input('id', sql.Int, ticketId)
      .query(`SELECT ${TICKET_COLUMNS} FROM Tickets WHERE Id = @id`);

    const oldTicket = oldTicketResult.recordset[0];
    if (!oldTicket) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    let resolvedStatus = status;
    const newAssigneeId = assigneeId || null;
    if (resolvedStatus === 'New' && newAssigneeId && newAssigneeId !== oldTicket.AssigneeId) {
      resolvedStatus = 'Open';
    }

    const result = await new sql.Request(transaction)
      .input('id',              sql.Int,      ticketId)
      .input('title',           sql.NVarChar, title)
      .input('description',     sql.NVarChar, description)
      .input('status',          sql.NVarChar, resolvedStatus)
      .input('priority',        sql.NVarChar, priority)
      .input('category',        sql.NVarChar, category           || null)
      .input('subCategory',     sql.NVarChar, subCategory        || null)
      .input('assigneeId',      sql.Int,      newAssigneeId)
      .input('screenshotUrl',   sql.NVarChar, screenshotUrl      || null)
      .input('screenshotFileName', sql.NVarChar, screenshotFileName || null)
      .input('createdBy',       sql.NVarChar, createdBy          || null)
      .input('employeeId',      sql.NVarChar, employeeId         || null)
      .input('extensionNumber', sql.NVarChar, extensionNumber    || null)
      .input('division',        sql.NVarChar, division           || null)
      .query(`
        UPDATE Tickets SET
          Title = @title, Description = @description, Status = @status,
          Priority = @priority, Category = @category, SubCategory = @subCategory,
          Division = @division, AssigneeId = @assigneeId,
          ScreenshotUrl = @screenshotUrl, ScreenshotFileName = @screenshotFileName,
          CreatedBy = @createdBy, EmployeeId = @employeeId,
          ExtensionNumber = @extensionNumber, UpdatedAt = GETDATE()
        OUTPUT ${TICKET_COLUMNS.trim().split(',').map(c => `INSERTED.${c.trim()}`).join(', ')}
        WHERE Id = @id
      `);

    const updatedTicket = result.recordset[0];

    if (updatedTicket.AssigneeId && oldTicket.AssigneeId !== updatedTicket.AssigneeId) {
      await new sql.Request(transaction)
        .input('userId',   sql.Int,      updatedTicket.AssigneeId)
        .input('ticketId', sql.Int,      updatedTicket.Id)
        .input('message',  sql.NVarChar, `You have been assigned to ticket #${updatedTicket.Id}: "${updatedTicket.Title}"`)
        .query('INSERT INTO Notifications (UserId, TicketId, Message) VALUES (@userId, @ticketId, @message)');
    }

    if (oldTicket.Status !== updatedTicket.Status) {
      await new sql.Request(transaction)
        .input('userId',   sql.Int,      updatedTicket.ReporterId)
        .input('ticketId', sql.Int,      updatedTicket.Id)
        .input('message',  sql.NVarChar, `Status of ticket #${updatedTicket.Id} was updated to "${updatedTicket.Status}"`)
        .query('INSERT INTO Notifications (UserId, TicketId, Message) VALUES (@userId, @ticketId, @message)');
    }

    await transaction.commit();
    res.status(200).json(mapTicketToCamelCase(updatedTicket));
  } catch (err) {
    await transaction.rollback();
    console.error('[tickets.updateTicket]', err);
    res.status(500).json({ message: 'Failed to update ticket.' });
  }
};