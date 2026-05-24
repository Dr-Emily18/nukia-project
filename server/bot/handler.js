// server/bot/handler.js
// Main entry point — routes to retail or wholesale handler
const db = require('../db');
const M  = require('./messages');
const { handleRetail }    = require('./retailHandler');
const { handleWholesale } = require('./wholesaleHandler');

async function handleMessage(from, body) {
  const phone = from.replace('whatsapp:', '').trim();

  const shop = await db.queryOne(
    'SELECT * FROM shops WHERE (phone=$1 OR whatsapp=$1) AND active=TRUE',
    [phone]
  );

  if (!shop) return M.shopNotFound();

  // Route based on shop type and active mode
  const isWholesaleMode =
    (shop.shop_type === 'wholesale') ||
    (shop.shop_type === 'hybrid' && shop.active_mode === 'wholesale');

  if (isWholesaleMode && shop.wholesale_active) {
    return handleWholesale(shop, body);
  }

  return handleRetail(shop, body);
}

module.exports = { handleMessage };
