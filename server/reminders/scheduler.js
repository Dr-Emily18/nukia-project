// server/reminders/scheduler.js
require('dotenv').config();
const cron = require('node-cron');
const db   = require('../db');
const { sendReminder } = require('../sms/sender');
const M = require('../bot/messages');
const { dailyStockCheck } = require('../wholesale/stockEngine');

async function scheduleReminder({ formulaId, shopId, customerName, shopName, scentId, bottleMl, sendAt }) {
  // Cancel old pending reminder for this formula
  await db.query(
    'UPDATE reminders SET failed=TRUE WHERE formula_id=$1 AND sent=FALSE AND failed=FALSE',
    [formulaId]
  );
  // Get customer phone from formula
  const formula = await db.queryOne('SELECT customer_phone FROM formulas WHERE id=$1', [formulaId]);
  if (!formula?.customer_phone) return; // no phone — skip

  await db.query(
    `INSERT INTO reminders (formula_id, shop_id, customer_phone, customer_name, shop_name, scent_id, bottle_ml, send_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [formulaId, shopId, formula.customer_phone, customerName, shopName, scentId, bottleMl, sendAt]
  );
  console.log(`🔔 Reminder set for ${customerName} (${scentId}) on ${sendAt.toDateString()}`);
}

async function processPendingReminders() {
  const due = await db.queryMany(
    `SELECT r.*, s.phone as shop_phone FROM reminders r
     JOIN shops s ON s.id=r.shop_id
     WHERE r.sent=FALSE AND r.failed=FALSE AND r.send_at<=NOW() LIMIT 100`
  );
  if (!due.length) return;
  console.log(`🔔 Processing ${due.length} reminder(s)...`);

  for (const r of due) {
    const msg = M.reminderSms({
      customerName: r.customer_name,
      shopName: r.shop_name,
      shopPhone: r.shop_phone,
      scentId: r.scent_id,
      bottleMl: r.bottle_ml
    });
    const result = await sendReminder(r.customer_phone, msg, r.channel);

    if (result.success) {
      await db.query('UPDATE reminders SET sent=TRUE, sent_at=NOW(), channel=$1 WHERE id=$2', [result.channel, r.id]);
    } else {
      await db.query('UPDATE reminders SET failed=TRUE, error_msg=$1 WHERE id=$2', [result.error, r.id]);
    }
    await new Promise(res => setTimeout(res, 1000));
  }
}

function startReminderScheduler() {
  // Reminders — every hour
  cron.schedule('0 * * * *', async () => {
    try { await processPendingReminders(); } catch (e) { console.error('Reminder error:', e.message); }
  });

  // Stock check — every day at 8am
  cron.schedule('0 8 * * *', async () => {
    try { await dailyStockCheck(); } catch (e) { console.error('Stock check error:', e.message); }
  });

  console.log('✅ Schedulers started (reminders: hourly, stock: 8am daily)');
}

module.exports = { scheduleReminder, processPendingReminders, startReminderScheduler };
