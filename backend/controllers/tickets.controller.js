const { sql, poolPromise } = require('../db');

const mapTicketToCamelCase = (ticket) => ({
  id: ticket.Id,
  title: ticket.Title,
  description: ticket.Description,
  status: ticket.Status,
  priority: ticket.Priority,
  category: ticket.Category,
  subCategory: ticket.SubCategory,
  division: ticket.Division,
  reporterId: ticket.ReporterId,
  assigneeId: ticket.AssigneeId,
  createdAt: ticket.CreatedAt,
  updatedAt: ticket.UpdatedAt,
  screenshotUrl: ticket.ScreenshotUrl,
  screenshotFileName: ticket.ScreenshotFileName,
  createdBy: ticket.CreatedBy,
  employeeId: ticket.EmployeeId,
  extensionNumber: ticket.ExtensionNumber,
});

exports.getAllTickets = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Tickets ORDER BY UpdatedAt DESC');
    res.status(200).json(result.recordset.map(mapTicketToCamelCase));
  } catch (err) {
    res.status(500).send({ message: 'Failed to retrieve tickets', error: err.message });
  }
};

exports.createTicket = async (req, res) => {
  const {
    title, description, status, priority, category, subCategory, division,
    reporterId, assigneeId, screenshotUrl, screenshotFileName,
    createdBy, employeeId, extensionNumber,
  } = req.body;

  // Business rule: default status is 'New'.
  // If an assignee is set at creation time, auto-promote to 'Open'.
  let resolvedStatus = status || 'New';
  if (assigneeId && resolvedStatus === 'New') {
    resolvedStatus = 'Open';
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const ticketRequest = new sql.Request(transaction);

    const result = await ticketRequest
      .input('title',              sql.NVarChar, title)
      .input('description',        sql.NVarChar, description)
      .input('status',             sql.NVarChar, resolvedStatus)
      .input('priority',           sql.NVarChar, priority)
      .input('category',           sql.NVarChar, category)
      .input('subCategory',        sql.NVarChar, subCategory)
      .input('reporterId',         sql.Int,      reporterId)
      .input('assigneeId',         sql.Int,      assigneeId || null)
      .input('screenshotUrl',      sql.NVarChar, screenshotUrl   || null)
      .input('screenshotFileName', sql.NVarChar, screenshotFileName || null)
      .input('createdBy',          sql.NVarChar, createdBy       || null)
      .input('employeeId',         sql.NVarChar, employeeId      || null)
      .input('extensionNumber',    sql.NVarChar, extensionNumber || null)
      .input('division',           sql.NVarChar, division        || null)
      .query(`
        INSERT INTO Tickets (
          Title, Description, Status, Priority, Category, SubCategory, Division,
          ReporterId, AssigneeId, ScreenshotUrl, ScreenshotFileName,
          CreatedBy, EmployeeId, ExtensionNumber
        )
        OUTPUT INSERTED.*
        VALUES (
          @title, @description, @status, @priority, @category, @subCategory, @division,
          @reporterId, @assigneeId, @screenshotUrl, @screenshotFileName,
          @createdBy, @employeeId, @extensionNumber
        )
      `);

    const newTicket = result.recordset[0];

    // Notify the assignee if one was set
    if (newTicket.AssigneeId) {
      const notificationRequest = new sql.Request(transaction);
      await notificationRequest
        .input('userId',  sql.Int,      newTicket.AssigneeId)
        .input('ticketId', sql.Int,     newTicket.Id)
        .input('message', sql.NVarChar, `You have been assigned to ticket #${newTicket.Id}: "${newTicket.Title}"`)
        .query('INSERT INTO Notifications (UserId, TicketId, Message) VALUES (@userId, @ticketId, @message)');
    }

    await transaction.commit();
    res.status(201).json(mapTicketToCamelCase(newTicket));
  } catch (err) {
    await transaction.rollback();
    res.status(500).send({ message: 'Failed to create ticket', error: err.message });
  }
};

exports.updateTicket = async (req, res) => {
  const ticketId = parseInt(req.params.id, 10);
  const {
    title, description, status, priority, category, subCategory, division,
    assigneeId, screenshotUrl, screenshotFileName,
    createdBy, employeeId, extensionNumber,
  } = req.body;
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // Fetch old ticket state for change-detection notifications
    const oldTicketRequest = new sql.Request(transaction);
    const oldTicketResult = await oldTicketRequest
      .input('id', sql.Int, ticketId)
      .query('SELECT * FROM Tickets WHERE Id = @id');
    const oldTicket = oldTicketResult.recordset[0];

    if (!oldTicket) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Business rule: if status is 'New' and an assignee is being added, promote to 'Open'
    let resolvedStatus = status;
    const oldAssigneeId = oldTicket.AssigneeId;
    const newAssigneeId = assigneeId || null;
    if (resolvedStatus === 'New' && newAssigneeId && newAssigneeId !== oldAssigneeId) {
      resolvedStatus = 'Open';
    }

    const updateRequest = new sql.Request(transaction);
    const result = await updateRequest
      .input('id',              sql.Int,      ticketId)
      .input('title',           sql.NVarChar, title)
      .input('description',     sql.NVarChar, description)
      .input('status',          sql.NVarChar, resolvedStatus)
      .input('priority',        sql.NVarChar, priority)
      .input('category',        sql.NVarChar, category)
      .input('subCategory',     sql.NVarChar, subCategory)
      .input('assigneeId',      sql.Int,      assigneeId || null)
      .input('screenshotUrl',   sql.NVarChar, screenshotUrl   || null)
      .input('screenshotFileName', sql.NVarChar, screenshotFileName || null)
      .input('createdBy',       sql.NVarChar, createdBy       || null)
      .input('employeeId',      sql.NVarChar, employeeId      || null)
      .input('extensionNumber', sql.NVarChar, extensionNumber || null)
      .input('division',        sql.NVarChar, division        || null)
      .query(`
        UPDATE Tickets
        SET
          Title              = @title,
          Description        = @description,
          Status             = @status,
          Priority           = @priority,
          Category           = @category,
          SubCategory        = @subCategory,
          Division           = @division,
          AssigneeId         = @assigneeId,
          ScreenshotUrl      = @screenshotUrl,
          ScreenshotFileName = @screenshotFileName,
          CreatedBy          = @createdBy,
          EmployeeId         = @employeeId,
          ExtensionNumber    = @extensionNumber,
          UpdatedAt          = GETDATE()
        OUTPUT INSERTED.*
        WHERE Id = @id
      `);

    const updatedTicket = result.recordset[0];

    // 1. Notify new assignee if assignee changed
    if (updatedTicket.AssigneeId && oldTicket.AssigneeId !== updatedTicket.AssigneeId) {
      const notificationRequest = new sql.Request(transaction);
      await notificationRequest
        .input('userId',   sql.Int,      updatedTicket.AssigneeId)
        .input('ticketId', sql.Int,      updatedTicket.Id)
        .input('message',  sql.NVarChar, `You have been assigned to ticket #${updatedTicket.Id}: "${updatedTicket.Title}"`)
        .query('INSERT INTO Notifications (UserId, TicketId, Message) VALUES (@userId, @ticketId, @message)');
    }

    // 2. Notify reporter if status changed
    if (oldTicket.Status !== updatedTicket.Status) {
      const notificationRequest = new sql.Request(transaction);
      await notificationRequest
        .input('userId',   sql.Int,      updatedTicket.ReporterId)
        .input('ticketId', sql.Int,      updatedTicket.Id)
        .input('message',  sql.NVarChar, `Status of ticket #${updatedTicket.Id} was updated to "${updatedTicket.Status}"`)
        .query('INSERT INTO Notifications (UserId, TicketId, Message) VALUES (@userId, @ticketId, @message)');
    }

    await transaction.commit();
    res.status(200).json(mapTicketToCamelCase(updatedTicket));
  } catch (err) {
    await transaction.rollback();
    res.status(500).send({ message: 'Failed to update ticket', error: err.message });
  }
};