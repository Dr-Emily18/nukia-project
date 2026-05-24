// server/routes/admin.js
// Admin panel — for you (the founder) to manage everything
// Access via browser or Postman with your ADMIN_SECRET key

require('dotenv').config();
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { sendWhatsApp } = require('../sms/sender');
const { restockOil }   = require('../wholesale/stockEngine');

function auth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
router.use(auth);

// ─────────────────────────────────────────────────────────
// SHOPS
// ─────────────────────────────────────────────────────────

// Register a new shop
// POST /admin/shops
// Body: { name, phone, shop_type: "retail"|"wholesale"|"hybrid", printer_ip }
router.post('/shops', async (req, res) => {
  const { name, phone, shop_type = 'retail', whatsapp, printer_ip, printer_port } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });

  try {
    const credits = parseInt(process.env.FREE_TRIAL_CREDITS) || 50;
    const shop = await db.queryOne(
      `INSERT INTO shops (name, phone, whatsapp, shop_type, active_mode, retail_credits, printer_ip, printer_port)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, phone, whatsapp || phone, shop_type,
       shop_type === 'wholesale' ? 'wholesale' : 'retail',
       shop_type === 'wholesale' ? 0 : credits,
       printer_ip || null, printer_port || 9100]
    );

    // Welcome message
    const welcomeMsg = shop_type === 'wholesale'
      ? `🏭 Welcome to NUKIA Wholesale!\n*${name}* is now registered.\n\nType *HELP* to see your commands.\nContact us to link your retail customers.`
      : `🌺 Welcome to NUKIA!\n*${name}* is now registered with *${credits} free credits*.\n\nType *HELP* to get started.\nEach mix costs 1 credit (200 TSH).`;

    await sendWhatsApp(phone, welcomeMsg).catch(() => {});
    console.log(`✅ New shop: ${name} (${shop_type})`);
    res.json({ success: true, shop });
  } catch (err) {
    if (err.message.includes('unique')) return res.status(400).json({ error: 'Phone already registered' });
    res.status(500).json({ error: err.message });
  }
});

// List all shops
// GET /admin/shops
router.get('/shops', async (req, res) => {
  const shops = await db.queryMany(
    `SELECT id, name, phone, shop_type, active_mode, retail_credits,
            wholesale_active, active, printer_enabled, onboarded_at
     FROM shops ORDER BY onboarded_at DESC`
  );
  res.json({ shops, total: shops.length });
});

// Get one shop
// GET /admin/shops/:id
router.get('/shops/:id', async (req, res) => {
  const shop = await db.queryOne('SELECT * FROM shops WHERE id=$1', [req.params.id]);
  if (!shop) return res.status(404).json({ error: 'Not found' });

  const stats = await db.queryOne(
    `SELECT COUNT(DISTINCT f.id) as formulas, COUNT(me.id) as total_mixes,
            COUNT(CASE WHEN DATE(me.mixed_at)=CURRENT_DATE THEN 1 END) as mixes_today
     FROM shops s
     LEFT JOIN formulas f ON f.shop_id=s.id
     LEFT JOIN mix_events me ON me.shop_id=s.id
     WHERE s.id=$1`, [req.params.id]
  );
  res.json({ shop, stats });
});

// Toggle printer kill switch
// PATCH /admin/shops/:id/printer
router.patch('/shops/:id/printer', async (req, res) => {
  const { enabled } = req.body;
  await db.query('UPDATE shops SET printer_enabled=$1 WHERE id=$2', [enabled, req.params.id]);
  res.json({ success: true, printer_enabled: enabled });
});

// Activate wholesale for a shop
// PATCH /admin/shops/:id/wholesale
router.patch('/shops/:id/wholesale', async (req, res) => {
  const { active, paid_until } = req.body;
  await db.query(
    'UPDATE shops SET wholesale_active=$1, wholesale_paid_until=$2 WHERE id=$3',
    [active, paid_until || null, req.params.id]
  );
  res.json({ success: true });
});

// Deactivate shop
// PATCH /admin/shops/:id/deactivate
router.patch('/shops/:id/deactivate', async (req, res) => {
  await db.query('UPDATE shops SET active=FALSE WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────
// SUPPLY RELATIONSHIPS — link wholesaler to retailer
// ─────────────────────────────────────────────────────────

// POST /admin/supply-link
// Body: { wholesaler_id, retailer_id, oils_supplied: ["Oud","Rose"], supply_frequency: "weekly" }
router.post('/supply-link', async (req, res) => {
  const { wholesaler_id, retailer_id, oils_supplied = [], supply_frequency = 'weekly' } = req.body;
  if (!wholesaler_id || !retailer_id) return res.status(400).json({ error: 'wholesaler_id and retailer_id required' });

  try {
    const rel = await db.queryOne(
      `INSERT INTO supply_relationships (wholesaler_id, retailer_id, oils_supplied, supply_frequency)
       VALUES ($1,$2,$3,$4) ON CONFLICT (wholesaler_id,retailer_id) DO UPDATE
       SET oils_supplied=$3, supply_frequency=$4, active=TRUE RETURNING *`,
      [wholesaler_id, retailer_id, oils_supplied, supply_frequency]
    );

    // Notify retailer
    const [w, r] = await Promise.all([
      db.queryOne('SELECT name, phone FROM shops WHERE id=$1', [wholesaler_id]),
      db.queryOne('SELECT name, phone FROM shops WHERE id=$1', [retailer_id])
    ]);
    await sendWhatsApp(r.phone,
      `🔗 *NUKIA Network Update*\n${w.name} is now your linked supplier on NUKIA.\nThey can send you formulas and will be notified when your stock runs low.`
    ).catch(() => {});

    res.json({ success: true, relationship: rel });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /admin/supply-links
router.get('/supply-links', async (req, res) => {
  const links = await db.queryMany(
    `SELECT sr.*, w.name as wholesaler_name, r.name as retailer_name
     FROM supply_relationships sr
     JOIN shops w ON w.id=sr.wholesaler_id
     JOIN shops r ON r.id=sr.retailer_id
     ORDER BY sr.created_at DESC`
  );
  res.json({ links });
});

// ─────────────────────────────────────────────────────────
// M-PESA CREDIT TOP-UPS
// ─────────────────────────────────────────────────────────

const TOPUP = [
  { min: 5000,  max: 9999,     credits: 25  },
  { min: 10000, max: 19999,    credits: 55  },
  { min: 20000, max: 49999,    credits: 115 },
  { min: 50000, max: Infinity, credits: 300 },
];

function creditsFor(tsh) {
  const t = TOPUP.find(t => tsh >= t.min && tsh <= t.max);
  return t ? t.credits : Math.floor(tsh / 200);
}

// POST /admin/topup
// Body: { shop_id, amount_tsh, mpesa_ref, confirmed_by }
router.post('/topup', async (req, res) => {
  const { shop_id, amount_tsh, mpesa_ref, confirmed_by = 'admin' } = req.body;
  if (!shop_id || !amount_tsh) return res.status(400).json({ error: 'shop_id and amount_tsh required' });

  const credits = creditsFor(parseInt(amount_tsh));
  try {
    await db.query(
      `INSERT INTO mpesa_transactions (shop_id, amount_tsh, credits_added, mpesa_ref, confirmed_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [shop_id, amount_tsh, credits, mpesa_ref || 'MANUAL', confirmed_by]
    );
    const shop = await db.queryOne(
      'UPDATE shops SET retail_credits=retail_credits+$1 WHERE id=$2 RETURNING name, retail_credits',
      [credits, shop_id]
    );
    const shopFull = await db.queryOne('SELECT phone FROM shops WHERE id=$1', [shop_id]);
    await sendWhatsApp(shopFull.phone,
      `✅ *Credits Added!*\n+${credits} credits\nNew balance: *${shop.retail_credits} credits*\nHappy mixing! 🌺`
    ).catch(() => {});

    console.log(`💳 ${shop.name}: +${credits} credits (${amount_tsh} TSH)`);
    res.json({ success: true, credits_added: credits, new_balance: shop.retail_credits });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /admin/topups
router.get('/topups', async (req, res) => {
  const topups = await db.queryMany(
    `SELECT mt.*, s.name as shop_name FROM mpesa_transactions mt
     JOIN shops s ON s.id=mt.shop_id ORDER BY mt.confirmed_at DESC LIMIT 50`
  );
  res.json({ topups });
});

// ─────────────────────────────────────────────────────────
// STOCK MANAGEMENT
// ─────────────────────────────────────────────────────────

// POST /admin/restock
// Body: { shop_id, oil_name, amount_ml }
router.post('/restock', async (req, res) => {
  const { shop_id, oil_name, amount_ml } = req.body;
  if (!shop_id || !oil_name || !amount_ml) return res.status(400).json({ error: 'shop_id, oil_name, amount_ml required' });
  await restockOil(shop_id, oil_name, parseFloat(amount_ml));
  res.json({ success: true, message: `Added ${amount_ml}ml of ${oil_name} to shop ${shop_id}` });
});

// GET /admin/stock/:shop_id
router.get('/stock/:shopId', async (req, res) => {
  const stock = await db.queryMany(
    'SELECT * FROM stock_levels WHERE shop_id=$1 ORDER BY estimated_ml ASC',
    [req.params.shopId]
  );
  res.json({ stock });
});

// ─────────────────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────────────────

// GET /admin/stats
router.get('/stats', async (req, res) => {
  const [overview, topShops, recentMixes, pendingAlerts] = await Promise.all([
    db.queryOne(`
      SELECT
        COUNT(DISTINCT s.id) as total_shops,
        COUNT(DISTINCT CASE WHEN s.active THEN s.id END) as active_shops,
        COUNT(DISTINCT CASE WHEN s.shop_type='wholesale' OR s.shop_type='hybrid' THEN s.id END) as wholesale_shops,
        COUNT(me.id) as total_mixes,
        COUNT(CASE WHEN DATE(me.mixed_at)=CURRENT_DATE THEN 1 END) as mixes_today,
        COUNT(me.id)*200 as total_revenue_tsh,
        COUNT(CASE WHEN DATE(me.mixed_at)=CURRENT_DATE THEN 1 END)*200 as revenue_today_tsh
      FROM shops s LEFT JOIN mix_events me ON me.shop_id=s.id AND me.credited=TRUE
    `),
    db.queryMany(`
      SELECT s.name, s.shop_type, COUNT(me.id) as mixes, COUNT(me.id)*200 as revenue_tsh
      FROM shops s JOIN mix_events me ON me.shop_id=s.id WHERE me.credited=TRUE
      GROUP BY s.id, s.name, s.shop_type ORDER BY mixes DESC LIMIT 10
    `),
    db.queryMany(`
      SELECT me.mixed_at, f.customer_name, f.scent_id, me.bottle_ml, s.name as shop_name, s.shop_type
      FROM mix_events me JOIN formulas f ON f.id=me.formula_id JOIN shops s ON s.id=me.shop_id
      ORDER BY me.mixed_at DESC LIMIT 20
    `),
    db.queryMany(`
      SELECT ra.*, s.name as retailer_name, w.name as wholesaler_name
      FROM reorder_alerts ra JOIN shops s ON s.id=ra.retailer_id JOIN shops w ON w.id=ra.wholesaler_id
      WHERE ra.sent=FALSE ORDER BY ra.estimated_ml ASC LIMIT 10
    `)
  ]);
  res.json({ overview, topShops, recentMixes, pendingAlerts });
});

// ─────────────────────────────────────────────────────────
// PRINT JOBS
// ─────────────────────────────────────────────────────────

router.get('/print-jobs', async (req, res) => {
  const { status = 'pending' } = req.query;
  const jobs = await db.queryMany(
    `SELECT pj.*, s.name as shop_name FROM print_jobs pj JOIN shops s ON s.id=pj.shop_id
     WHERE pj.status=$1 ORDER BY pj.created_at DESC LIMIT 50`,
    [status]
  );
  res.json({ jobs });
});

module.exports = router;
