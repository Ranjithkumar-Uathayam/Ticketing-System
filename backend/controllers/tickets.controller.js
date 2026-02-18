const { sql, poolPromise } = require('../db');

const mapTicketToCamelCase = (ticket) => ({
    id: ticket.Id,
    title: ticket.Title,
    description: ticket.Description,
    status: ticket.Status,
    priority: ticket.Priority,
    category: ticket.Category,
    subCategory: ticket.SubCategory,
    reporterId: ticket.ReporterId,
    assigneeId: ticket.AssigneeId,
    createdAt: ticket.CreatedAt,
    updatedAt: ticket.UpdatedAt,
    screenshotUrl: ticket.ScreenshotUrl,
    screenshotFileName: ticket.ScreenshotFileName,
});

exports.getAllTickets = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Tickets ORDER BY UpdatedAt DESC');
    res.status(200).json(result.recordset.map(mapTicketToCamelCase));
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).send({ message: 'Failed to retrieve tickets', error: err.message });
  }
};

exports.createTicket = async (req, res) => {
  const { title, description, status, priority, category, subCategory, reporterId, assigneeId, screenshotUrl, screenshotFileName } = req.body;
  
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    const ticketRequest = new sql.Request(transaction);

    const result = await ticketRequest
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description)
      .input('status', sql.NVarChar, status)
      .input('priority', sql.NVarChar, priority)
      .input('category', sql.NVarChar, category)
      .input('subCategory', sql.NVarChar, subCategory)
      .input('reporterId', sql.Int, reporterId)
      .input('assigneeId', sql.Int, assigneeId)
      .input('screenshotUrl', sql.NVarChar, screenshotUrl)
      .input('screenshotFileName', sql.NVarChar, screenshotFileName)
      .query(`
        INSERT INTO Tickets (Title, Description, Status, Priority, Category, SubCategory, ReporterId, AssigneeId, ScreenshotUrl, ScreenshotFileName) 
        OUTPUT INSERTED.*
        VALUES (@title, @description, @status, @priority, @category, @subCategory, @reporterId, @assigneeId, @screenshotUrl, @screenshotFileName)
      `);
    
    const newTicket = result.recordset[0];

    // Create notification for assignee if there is one
    if (newTicket.AssigneeId) {
        const notificationRequest = new sql.Request(transaction);
        await notificationRequest
            .input('userId', sql.Int, newTicket.AssigneeId)
            .input('ticketId', sql.Int, newTicket.Id)
            .input('message', sql.NVarChar, `You have been assigned to ticket #${newTicket.Id}: "${newTicket.Title}"`)
            .query('INSERT INTO Notifications (UserId, TicketId, Message) VALUES (@userId, @ticketId, @message)');
    }

    await transaction.commit();
    res.status(201).json(mapTicketToCamelCase(newTicket));
  } catch (err) {
    await transaction.rollback();
    console.error('Database insert error:', err);
    res.status(500).send({ message: 'Failed to create ticket', error: err.message });
  }
};

exports.updateTicket = async (req, res) => {
  const ticketId = parseInt(req.params.id, 10);
  const { title, description, status, priority, category, subCategory, assigneeId, screenshotUrl, screenshotFileName } = req.body;
  
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // Get the state of the ticket before updating
    const oldTicketRequest = new sql.Request(transaction);
    const oldTicketResult = await oldTicketRequest
        .input('id', sql.Int, ticketId)
        .query('SELECT * FROM Tickets WHERE Id = @id');
    const oldTicket = oldTicketResult.recordset[0];

    if (!oldTicket) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const updateRequest = new sql.Request(transaction);
    const result = await updateRequest
      .input('id', sql.Int, ticketId)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description)
      .input('status', sql.NVarChar, status)
      .input('priority', sql.NVarChar, priority)
      .input('category', sql.NVarChar, category)
      .input('subCategory', sql.NVarChar, subCategory)
      .input('assigneeId', sql.Int, assigneeId)
      .input('screenshotUrl', sql.NVarChar, screenshotUrl)
      .input('screenshotFileName', sql.NVarChar, screenshotFileName)
      .query(`
        UPDATE Tickets 
        SET 
          Title = @title, 
          Description = @description, 
          Status = @status, 
          Priority = @priority, 
          Category = @category,
          SubCategory = @subCategory,
          AssigneeId = @assigneeId, 
          ScreenshotUrl = @screenshotUrl,
          ScreenshotFileName = @screenshotFileName,
          UpdatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE Id = @id
      `);

    const updatedTicket = result.recordset[0];

    // 1. Check if assignee changed and notify the new assignee
    if (updatedTicket.AssigneeId && oldTicket.AssigneeId !== updatedTicket.AssigneeId) {
        const notificationRequest = new sql.Request(transaction);
        await notificationRequest
            .input('userId', sql.Int, updatedTicket.AssigneeId)
            .input('ticketId', sql.Int, updatedTicket.Id)
            .input('message', sql.NVarChar, `You have been assigned to ticket #${updatedTicket.Id}: "${updatedTicket.Title}"`)
            .query('INSERT INTO Notifications (UserId, TicketId, Message) VALUES (@userId, @ticketId, @message)');
    }

    // 2. Check if status changed and notify the reporter
    if (oldTicket.Status !== updatedTicket.Status) {
        const notificationRequest = new sql.Request(transaction);
        await notificationRequest
            .input('userId', sql.Int, updatedTicket.ReporterId)
            .input('ticketId', sql.Int, updatedTicket.Id)
            .input('message', sql.NVarChar, `Status of ticket #${updatedTicket.Id} was updated to "${updatedTicket.Status}"`)
            .query('INSERT INTO Notifications (UserId, TicketId, Message) VALUES (@userId, @ticketId, @message)');
    }

    await transaction.commit();
    res.status(200).json(mapTicketToCamelCase(updatedTicket));
    
  } catch (err) {
    await transaction.rollback();
    console.error('Database update error:', err);
    res.status(500).send({ message: 'Failed to update ticket', error: err.message });
  }
};