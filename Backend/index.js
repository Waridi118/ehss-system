const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./config/db');

const app = express();
app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      'http://localhost:5173',
      'https://ehss-system.vercel.app',
    ];
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
  credentials: true
}));

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());

app.get('/', (req, res) => {
  res.send('EHSS Backend API running');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).send('DB OK');
  } catch (err) {
    res.status(500).send('DB unreachable');
  }
});

const { requireAuth } = require('./middleware/auth');

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const usersRoutes = require("./routes/usersRoutes");
app.use("/api/users", usersRoutes);

const ppeRoutes = require('./routes/ppeRoutes');
app.use('/api/ppe', requireAuth, ppeRoutes);

const safetyRoutes = require('./routes/safetyRoutes');
app.use('/api/safety', requireAuth, safetyRoutes);

const calendarRoutes = require('./routes/calendarRoutes');
app.use('/api/calendar', requireAuth, calendarRoutes);

const costsRoutes = require('./routes/costsRoutes');
app.use('/api/costs', requireAuth, costsRoutes);

const complianceRoutes = require('./routes/complianceRoutes');
app.use('/api/compliance', requireAuth, complianceRoutes);

const sustainabilityRoutes = require('./routes/sustainabilityRoutes');
app.use('/api/sustainability', requireAuth, sustainabilityRoutes);

const reportsRoutes = require('./routes/reportsRoutes');
app.use('/api/reports', requireAuth, reportsRoutes);

const equipmentRoutes = require('./routes/equipmentRoutes');
app.use('/api/equipment', requireAuth, equipmentRoutes);

const actionTrackerRoutes = require('./routes/actionTrackerRoutes');
app.use('/api/actionTracker', requireAuth, actionTrackerRoutes);

const ppeMatrixRoutes = require('./routes/ppeMatrixRoutes');
app.use('/api/ppe-matrix', requireAuth, ppeMatrixRoutes);

const publicActionsRouter = require('./routes/publicActions');
app.use('/api/public/actions', publicActionsRouter);

const auditLogsRouter = require('./routes/auditLogs');
app.use('/api/audit-logs', auditLogsRouter);

const publicPPEMatrixRouter = require('./routes/publicPPEMatrix');
app.use('/api/public/ppe-matrix', publicPPEMatrixRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
