// server/wholesale/stockEngine.js
// Tracks oil consumption per retailer
// Fires reorder alerts to wholesalers when stock runs low

const db = require('../db');
const { sendWhatsApp, sendSMS } = require('../sms/sender');
const M = require('../bot/messages');

const LOW_STOCK_THRESHOLD_ML = 150;  // alert when below 150ml
const DAYS_WARNING = 7;              // alert when ~7 days left

/**
 * Called after every mix — deducts ingredient amounts from stock
 */
async function updateStock(shopId, ingredients) {
  for (const ing of ingredients) {
    try {
      // Upsert stock level — create if not exists, deduct if exists
      await db.query(
        `INSERT INTO stock_levels (shop_id, oil_name, estimated_ml)
         VALUES ($1, $2, 500)
         ON CONFLICT (shop_id, oil_name)
         DO UPDATE SET estimated_ml = GREATEST(0, stock_levels.estimated_ml - $3),
                       last_updated = NOW()`,
        [shopId, ing.name, ing.amount]
      );
    } catch (err) {
      console.error('Stock update error:', err.message);
    }
  }
  // Check if any stock is low and fire alerts
  await checkAndFireAlerts(shopId);
}

/**
 * Restock — called when wholesaler delivers to retailer
 */
async function restockOil(shopId, oilName, amountMl) {
  await db.query(
    `INSERT INTO stock_levels (shop_id, oil_name, estimated_ml, last_restocked)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (shop_id, oil_name)
     DO UPDATE SET estimated_ml = stock_levels.estimated_ml + $3,
                   last_restocked = NOW(),
                   last_updated = NOW()`,
    [shopId, oilName, amountMl]
  );
}

/**
 * Check stock levels and fire alerts to wholesalers
 */
async function checkAndFireAlerts(retailerId) {
  // Get low stock items for this retailer
  const lowStock = await db.queryMany(
    `SELECT oil_name, estimated_ml FROM stock_levels
     WHERE shop_id=$1 AND estimated_ml < $2`,
    [retailerId, LOW_STOCK_THRESHOLD_ML]
  );

  if (!lowStock.length) return;

  // Find wholesalers supplying this retailer
  const wholesalers = await db.queryMany(
    `SELECT sr.wholesaler_id, s.name as wholesaler_name, s.phone as wholesaler_phone,
            s.whatsapp as wholesaler_whatsapp, sr.oils_supplied
     FROM supply_relationships sr
     JOIN shops s ON s.id=sr.wholesaler_id
     WHERE sr.retailer_id=$1 AND sr.active=TRUE AND s.wholesale_active=TRUE`,
    [retailerId]
  );

  if (!wholesalers.length) return;

  const retailer = await db.queryOne('SELECT name, phone FROM shops WHERE id=$1', [retailerId]);
  if (!retailer) return;

  for (const oil of lowStock) {
    // Estimate days remaining (assume avg 20ml/day consumption)
    const daysLeft = Math.max(1, Math.round(oil.estimated_ml / 20));

    for (const w of wholesalers) {
      // Only alert if this wholesaler supplies this oil
      const suppliesThisOil = !w.oils_supplied || w.oils_supplied.length === 0 ||
        w.oils_supplied.some(o => o.toLowerCase() === oil.oil_name.toLowerCase());

      if (!suppliesThisOil) continue;

      // Check if we already sent this alert recently (avoid spam)
      const recentAlert = await db.queryOne(
        `SELECT id FROM reorder_alerts
         WHERE wholesaler_id=$1 AND retailer_id=$2 AND oil_name=$3
         AND created_at > NOW() - INTERVAL '24 hours' AND sent=TRUE`,
        [w.wholesaler_id, retailerId, oil.oil_name]
      );
      if (recentAlert) continue;

      // Record the alert
      await db.query(
        `INSERT INTO reorder_alerts (wholesaler_id, retailer_id, retailer_name, oil_name, estimated_ml, days_remaining)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [w.wholesaler_id, retailerId, retailer.name, oil.oil_name, oil.estimated_ml, daysLeft]
      );

      // Send alert to wholesaler
      const msg = M.reorderAlert({ retailerName: retailer.name, oilName: oil.oil_name, daysLeft });
      const phone = w.wholesaler_whatsapp || w.wholesaler_phone;
      const result = await sendWhatsApp(phone, msg).catch(() => ({ success: false }));

      if (result.success) {
        await db.query(
          `UPDATE reorder_alerts SET sent=TRUE, sent_at=NOW()
           WHERE wholesaler_id=$1 AND retailer_id=$2 AND oil_name=$3 AND sent=FALSE`,
          [w.wholesaler_id, retailerId, oil.oil_name]
        );
        console.log(`🔔 Reorder alert sent to ${w.wholesaler_name} for ${retailer.name} — ${oil.oil_name}`);
      }
    }
  }
}

/**
 * Run by cron job daily — check all retailers for low stock
 */
async function dailyStockCheck() {
  const retailers = await db.queryMany(
    `SELECT DISTINCT retailer_id FROM supply_relationships WHERE active=TRUE`
  );
  for (const r of retailers) {
    await checkAndFireAlerts(r.retailer_id);
    await new Promise(res => setTimeout(res, 500)); // throttle
  }
  console.log(`✅ Daily stock check complete — ${retailers.length} retailers checked`);
}

module.exports = { updateStock, restockOil, checkAndFireAlerts, dailyStockCheck };
