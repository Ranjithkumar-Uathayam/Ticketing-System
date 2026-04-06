require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');

const authRoutes         = require('./routes/auth.routes');
const ticketRoutes       = require('./routes/tickets.routes');
const userRoutes         = require('./routes/users.routes');
const roleRoutes         = require('./routes/roles.routes');
const notificationRoutes = require('./routes/notifications.routes');
const dispatchRoutes     = require('./routes/dispatch.routes');
const customerEntryRoutes = require('./routes/customer-entry.routes');
const hwInventoryRoutes = require('./routes/hw-inventory.routes');

const app = express();

// ── Security headers (must be first) ──────────────────────────────────────
app.use(helmet());

// ── Request logging ────────────────────────────────────────────────────────
app.use(morgan('combined'));

// ── CORS — restrict to known origin(s) ────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization']
}));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl during dev)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Body parsing — 1 MB is sufficient; screenshots belong in object storage
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);        
app.use('/api/tickets',       ticketRoutes);       
app.use('/api/users',         userRoutes);         
app.use('/api/roles',         roleRoutes);         
app.use('/api/notifications', notificationRoutes); 
app.use('/api/dispatch',      dispatchRoutes);     
app.use('/api/customer-entries', customerEntryRoutes);
app.use('/api/hw-inventory', hwInventoryRoutes);

app.get('/', (_req, res) => res.json({ message: 'Uathayam Ticketing & Dispatch API' }));

// ── Global error handler ───────────────────────────────────────────────────
// Catches any error thrown via next(err) or unhandled promise rejections
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 4401;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));