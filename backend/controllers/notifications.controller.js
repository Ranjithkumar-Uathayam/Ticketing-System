const { sql, poolPromise } = require('../db');

const mapNotificationToCamelCase = (notification) => ({
  id: notification.Id,
  userId: notification.UserId,
  ticketId: notification.TicketId,
  message: notification.Message,
  isRead: notification.IsRead,
  createdAt: notification.CreatedAt,
});

exports.getNotificationsForUser = async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM Notifications WHERE UserId = @userId ORDER BY CreatedAt DESC');
    
    res.status(200).json(result.recordset.map(mapNotificationToCamelCase));
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).send({ message: 'Failed to retrieve notifications', error: err.message });
  }
};

exports.markNotificationsAsRead = async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('userId', sql.Int, userId)
      .query('UPDATE Notifications SET IsRead = 1 WHERE UserId = @userId AND IsRead = 0');
    
    res.status(200).send({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error('Database update error:', err);
    res.status(500).send({ message: 'Failed to mark notifications as read', error: err.message });
  }
};

exports.deleteNotificationsForUser = async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Notifications WHERE UserId = @userId');
    
    res.status(200).send({ message: 'Notifications cleared' });
  } catch (err) {
    console.error('Database delete error:', err);
    res.status(500).send({ message: 'Failed to clear notifications', error: err.message });
  }
};