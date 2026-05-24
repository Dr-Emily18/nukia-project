// server/index.js
// NUKIA v2.0 — Main Server
// Retail + Wholesale + Hybrid architecture

require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');

const webhookRoutes = require('./routes/webhook');
const adminRoutes   = require('./routes/admin');
const { startReminderScheduler } = require('./reminders/scheduler');

const app  = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Routes
app.use('/webhook', webhookRoutes);
app.use('/admin',   adminRoutes);

// Root
app.get('/', (req, res) => {
  res.json({
    service: 'NUKIA Server',
    version: '2.0.0',
    architecture: 'Retail + Wholesale + Hybrid',
    status: 'running',
    time: new Date().toISOString(),
    endpoints: {
      health:   '/webhook/health',
      whatsapp: '/webhook/whatsapp',
      stats:    '/admin/stats?key=YOUR_ADMIN_SECRET',
    }
  });
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║         NUKIA v2.0 Server Running        ║
║  Port      : ${PORT}                         ║
║  WhatsApp  : POST /webhook/whatsapp      ║
║  Health    : GET  /webhook/health        ║
║  Stats     : GET  /admin/stats           ║
║  Architecture: Retail + Wholesale        ║
╚══════════════════════════════════════════╝
  `);
  startReminderScheduler();
});

module.exports = app;
