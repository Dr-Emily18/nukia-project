// server/routes/webhook.js
const express = require('express');
const router  = express.Router();
const { handleMessage } = require('../bot/handler');
const { getPendingJobs, updateJobStatus } = require('../printer/queue');
const db = require('../db');

function escXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function bridgeAuth(req, res, next) {
  if (req.headers['x-api-key'] !== process.env.BRIDGE_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// WhatsApp webhook from Twilio
router.post('/whatsapp', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  if (!from || !body) return res.status(400).send('Missing fields');
  console.log(`📱 ${from}: ${body.substring(0, 50)}`);
  try {
    const reply = await handleMessage(from, body);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${escXml(reply)}</Body></Message></Response>`);
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>❌ Error. Try again or type HELP.</Body></Message></Response>`);
  }
});

// Printer bridge — get pending jobs
router.get('/print-jobs/pending/:shopId', bridgeAuth, async (req, res) => {
  try {
    const jobs = await getPendingJobs(parseInt(req.params.shopId));
    res.json({ jobs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Printer bridge — update job status
router.post('/print-jobs/:jobId/status', bridgeAuth, async (req, res) => {
  const { status, error } = req.body;
  if (!['printed','failed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    await updateJobStatus(parseInt(req.params.jobId), status, error);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', version: '2.0.0', time: new Date().toISOString() });
  } catch { res.status(500).json({ status: 'db_error' }); }
});

module.exports = router;
