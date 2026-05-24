// server/printer/queue.js
const db = require('../db');

async function queuePrintJob({ shopId, formulaId, scentId, shopName, customer, bottleMl, ingredients }) {
  const shop = await db.queryOne('SELECT printer_enabled, printer_ip FROM shops WHERE id=$1', [shopId]);
  if (!shop?.printer_enabled || !shop?.printer_ip) return null;

  const label = JSON.stringify({ shopName, scentId, customer, bottleMl, ingredients: ingredients.slice(0, 4), date: new Date().toLocaleDateString('en-TZ'), qrData: `nukia.app/scent/${scentId}` });
  return db.queryOne(`INSERT INTO print_jobs (shop_id,formula_id,scent_id,label_text) VALUES ($1,$2,$3,$4) RETURNING *`, [shopId, formulaId, scentId, label]);
}

async function getPendingJobs(shopId) {
  return db.queryMany(
    `SELECT pj.*, s.printer_ip, s.printer_port FROM print_jobs pj
     JOIN shops s ON s.id=pj.shop_id
     WHERE pj.shop_id=$1 AND pj.status='pending' AND s.printer_enabled=TRUE
     ORDER BY pj.created_at ASC LIMIT 10`,
    [shopId]
  );
}

async function updateJobStatus(jobId, status, errorMsg = null) {
  await db.query('UPDATE print_jobs SET status=$1, printed_at=NOW(), error_msg=$2 WHERE id=$3', [status, errorMsg, jobId]);
}

module.exports = { queuePrintJob, getPendingJobs, updateJobStatus };
