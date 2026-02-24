// backend/server.js  (UPDATED - add dispatch route)
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRoutes         = require('./routes/auth.routes');
const ticketRoutes       = require('./routes/tickets.routes');
const userRoutes         = require('./routes/users.routes');
const roleRoutes         = require('./routes/roles.routes');
const notificationRoutes = require('./routes/notifications.routes');
const dispatchRoutes     = require('./routes/dispatch.routes');   // ← NEW

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api/auth',          authRoutes);
app.use('/api/tickets',       ticketRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/roles',         roleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dispatch',      dispatchRoutes);                    // ← NEW

app.get('/', (_req, res) => res.json({ message: 'Uathayam Ticketing & Dispatch API' }));

const PORT = process.env.PORT || 4401;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));