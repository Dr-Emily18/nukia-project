// server/bot/wholesaleHandler.js
const db = require('../db');
const M  = require('./messages');
const { parseMessage } = require('./parser');
const { decryptFormula, encryptFormula, generateScentId } = require('../utils/encryption');
const { sendWhatsApp } = require('../sms/sender');

async function handleWholesale(shop, body) {
  const { command, args } = parseMessage(body, 'wholesale');

  switch (command) {
    case 'WHELP':    return M.wholesaleHelp(shop.name);
    case 'WNETWORK': return handleNetwork(shop);
    case 'WSTOCK':   return handleStock(shop);
    case 'WALERT':   return handleAlerts(shop);
    case 'WPUSH':    return handlePush(shop, args);
    case 'WSWITCH':
      await db.query('UPDATE shops SET active_mode=$1 WHERE id=$2', ['retail', shop.id]);
      return M.switchedToRetail(shop.name);
    default: return M.unknown();
  }
}

async function handleNetwork(shop) {
  const retailers = await db.queryMany(
    `SELECT s.name as retailer_name, s.phone as retailer_phone
     FROM supply_relationships sr
     JOIN shops s ON s.id=sr.retailer_id
     WHERE sr.wholesaler_id=$1 AND sr.active=TRUE`,
    [shop.id]
  );
  return M.networkList({ shopName: shop.name, retailers });
}

async function handleStock(shop) {
  const retailers = await db.queryMany(
    `SELECT s.id, s.name as retailer_name FROM supply_relationships sr
     JOIN shops s ON s.id=sr.retailer_id WHERE sr.wholesaler_id=$1 AND sr.active=TRUE`,
    [shop.id]
  );
  const retailersWithStock = await Promise.all(retailers.map(async r => {
    const stocks = await db.queryMany(
      'SELECT oil_name, estimated_ml FROM stock_levels WHERE shop_id=$1 ORDER BY estimated_ml ASC',
      [r.id]
    );
    return { ...r, stocks };
  }));
  return M.stockReport({ shopName: shop.name, retailers: retailersWithStock });
}

async function handleAlerts(shop) {
  const alerts = await db.queryMany(
    `SELECT ra.*, s.name as retailer_name FROM reorder_alerts ra
     JOIN shops s ON s.id=ra.retailer_id
     WHERE ra.wholesaler_id=$1 AND ra.sent=FALSE
     ORDER BY ra.estimated_ml ASC LIMIT 10`,
    [shop.id]
  );
  return M.alertsList({ alerts });
}

async function handlePush(shop, args) {
  // Usage: PUSH NK-2847 +255712345678
  if (!args || args.length < 2) {
    return '❌ Format: PUSH NK-2847 +255712345678\nScent ID and retailer phone required.';
  }
  const scentId   = args[0].toUpperCase();
  const retailerPhone = args[1];

  // Find formula in wholesaler's vault
  const formula = await db.queryOne('SELECT * FROM formulas WHERE scent_id=$1 AND shop_id=$2', [scentId, shop.id]);
  if (!formula) return M.notFound(scentId);

  // Find retailer
  const retailer = await db.queryOne('SELECT * FROM shops WHERE phone=$1 OR whatsapp=$1', [retailerPhone]);
  if (!retailer) return `❌ No NUKIA shop found with phone ${retailerPhone}`;

  // Check supply relationship exists
  const rel = await db.queryOne(
    'SELECT id FROM supply_relationships WHERE wholesaler_id=$1 AND retailer_id=$2',
    [shop.id, retailer.id]
  );
  if (!rel) {
    return `❌ ${retailer.name} is not in your network. Contact NUKIA to link them.`;
  }

  // Copy formula to retailer — generate new scent ID for their vault
  let newScentId, existing;
  do { newScentId = generateScentId(); existing = await db.queryOne('SELECT id FROM formulas WHERE scent_id=$1', [newScentId]); } while (existing);

  await db.query(
    `INSERT INTO formulas (shop_id, created_by_wholesaler_id, customer_name, scent_id, ingredients, bottle_ml)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [retailer.id, shop.id, formula.customer_name, newScentId, formula.ingredients, formula.bottle_ml]
  );

  // Notify retailer via WhatsApp
  const ingredients = decryptFormula(formula.ingredients);
  const notifyMsg = M.formulaReceivedFromWholesaler({ scentId: newScentId, wholesalerName: shop.name, ingredients });
  await sendWhatsApp(retailer.phone, notifyMsg).catch(() => {});

  return M.formulaPushed({ scentId: newScentId, retailerName: retailer.name });
}

module.exports = { handleWholesale };
