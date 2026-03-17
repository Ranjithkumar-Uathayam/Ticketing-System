const { sql, poolPromise } = require('../db');

const mapNotificationToCamelCase = (n) => ({
  id:        n.Id,
  userId:    n.UserId,
  ticketId:  n.TicketId,
  message:   n.Message,
  isRead:    n.IsRead,
  createdAt: n.CreatedAt,
});

exports.getNotificationsForUser = async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID.' });

  // Users may only fetch their own notifications
  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Forbidden.' });
  }

  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT Id, UserId, TicketId, Message, IsRead, CreatedAt
        FROM Notifications
        WHERE UserId = @userId
        ORDER BY CreatedAt DESC
      `);
    res.status(200).json(result.recordset.map(mapNotificationToCamelCase));
  } catch (err) {
    console.error('[notifications.getNotificationsForUser]', err);
    res.status(500).json({ message: 'Failed to retrieve notifications.' });
  }
};

exports.markNotificationsAsRead = async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID.' });

  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Forbidden.' });
  }

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('userId', sql.Int, userId)
      .query('UPDATE Notifications SET IsRead = 1 WHERE UserId = @userId AND IsRead = 0');
    res.status(200).json({ message: 'Notifications marked as read.' });
  } catch (err) {
    console.error('[notifications.markNotificationsAsRead]', err);
    res.status(500).json({ message: 'Failed to mark notifications as read.' });
  }
};

exports.deleteNotificationsForUser = async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID.' });

  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Forbidden.' });
  }

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Notifications WHERE UserId = @userId');
    res.status(200).json({ message: 'Notifications cleared.' });
  } catch (err) {
    console.error('[notifications.deleteNotificationsForUser]', err);
    res.status(500).json({ message: 'Failed to clear notifications.' });
  }
};