const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { testConnection } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const metaRoutes = require('./routes/metaRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const caseReportRoutes = require('./routes/caseReportRoutes');
const alertRoutes = require('./routes/alertRoutes');
const investigationRoutes = require('./routes/investigationRoutes');
const reportRoutes = require('./routes/reportRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);
      // In development, allow localhost on any port or configured CLIENT_URL
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:') || origin === CLIENT_URL) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive for local dev prototype
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// API Health Check & Database Diagnostic Endpoint
app.get('/api/health', async (req, res) => {
  const dbStatus = await testConnection();
  res.json({
    status: dbStatus.connected ? 'healthy' : 'database_unavailable',
    timestamp: new Date().toISOString(),
    service: 'Community Disease Surveillance & Early-Warning API',
    database: dbStatus,
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/cases', caseReportRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/investigations', investigationRoutes);
app.use('/api/reports', reportRoutes);

// Educational & Prototype Notice Route
app.get('/api', (req, res) => {
  res.json({
    name: 'Community Disease Surveillance and Early-Warning System (CDSEWS) API',
    version: '1.0.0',
    disclaimer: 'Educational prototype only. Alerts indicate patterns requiring human review, not medical diagnosis.',
    endpoints: [
      '/api/health',
      '/api/dashboard/summary',
      '/api/meta/all',
      '/api/meta/thresholds',
      '/api/cases',
      '/api/alerts',
      '/api/investigations',
      '/api/reports/cases',
      '/api/reports/export-csv',
    ],
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handler
app.use(errorHandler);

const AlertScheduler = require('./services/alertScheduler');

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`\n======================================================`);
    console.log(` CDSEWS Backend API server running on port ${PORT}`);
    console.log(` Endpoint: http://localhost:${PORT}/api/health`);
    console.log(`======================================================`);

    const dbStatus = await testConnection();
    if (dbStatus.connected) {
      console.log(` MySQL 8.0 connected to database: '${dbStatus.database}' at ${dbStatus.host}:${dbStatus.port}`);
      // Initialize automated periodic threshold surveillance scheduler
      AlertScheduler.startScheduler();
    } else {
      console.warn(` [Notice] Database connection test status:`);
      console.warn(`   ${dbStatus.error}`);
      console.warn(`   Tip: ${dbStatus.suggestion}\n`);
    }
  });
}

module.exports = app;
