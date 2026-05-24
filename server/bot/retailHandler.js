// server/bot/retailHandler.js
const db = require('../db');
const M  = require('./messages');
const { parseMessage, parseMixArgs, parseRefillArgs } = require('./parser');
const { encryptFormula, decryptFormula, generateScentId } = require('../utils/encryption');
const { scheduleReminder } = require('../reminders/scheduler');
const { queuePrintJob }    = require('../printer/queue');
const { sendWhatsApp }     = require('../sms/sender');
const { updateStock }      = require('../wholesale/stockEngine');

async function handleRetail(shop, body) {
  const { command, args } = parseMessage(body, 'retail');
  const isHybrid = shop.shop_type === 'hybrid';

  switch (command) {
    case 'HELP':   return M.retailHelp(shop.name, isHybrid);
    case 'CHECK':  return handleCheck(shop);
    case 'PAY':    return M.pay({ mpesaNumber: process.env.MPESA_BUSINESS_NUMBER, shopName: shop.name });
    case 'MIX':    return handleMix(shop, args);
    case 'REFILL': return handleRefill(shop, args);
    case 'FIND':   return handleFind(shop, args);
    case 'LIST':   return handleList(shop);
    case 'EXPORT': return handleExport(shop);
    case 'SWITCH':
      if (isHybrid) {
        await db.query('UPDATE shops SET active_mode=$1 WHERE id=$2', ['wholesale', shop.id]);
        return M.switchedToWholesale(shop.name);
      }
      return M.unknown();
    default: return M.unknown();
  }
}

async function handleCheck(shop) {
  const today = await db.queryOne(
    `SELECT COUNT(*) as mixes, COALESCE(COUNT(*)*200,0) as revenue
     FROM mix_events WHERE shop_id=$1 AND DATE(mixed_at)=CURRENT_DATE AND credited=TRUE`,
    [shop.id]
  );
  return M.balance({
    shopName: shop.name, credits: shop.retail_credits,
    todayMixes: today?.mixes || 0, todayRevenue: today?.revenue || 0
  });
}

async function handleMix(shop, args) {
  if (shop.retail_credits < 1) return M.noCredits(shop.retail_credits);

  // Detect phone number first before parsing
  // Format with phone:    MIX Fatuma +255712345678 30 Oud:72 Rose:18
  // Format without phone: MIX Fatuma 30 Oud:72 Rose:18
  let customerPhone = null;
  let mixArgs = [...args];

  // Check if second argument starts with + (phone number)
  if (mixArgs[1] && /^\+\d{7,15}$/.test(mixArgs[1])) {
    customerPhone = mixArgs[1];
    mixArgs = [mixArgs[0], ...mixArgs.slice(2)];
  }

  const p = parseMixArgs(mixArgs);
  if (!p.valid) return p.error === 'INVALID_VOLUME'
    ? '❌ Bottle size must be a number.\ne.g. MIX Fatuma 30 Oud:72 Rose:18\nWith phone: MIX Fatuma +255712345678 30 Oud:72 Rose:18'
    : M.formatError();

  // Generate unique scent ID
  let scentId, existing;
  do { scentId = generateScentId(); existing = await db.queryOne('SELECT id FROM formulas WHERE scent_id=$1', [scentId]); } while (existing);

  const formula = await db.queryOne(
    `INSERT INTO formulas (shop_id, customer_name, customer_phone, scent_id, ingredients, bottle_ml)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [shop.id, p.customerName, customerPhone, scentId, encryptFormula(p.ingredients), p.bottleMl]
  );

  await db.query(`INSERT INTO mix_events (formula_id,shop_id,bottle_ml,credited,is_new) VALUES ($1,$2,$3,TRUE,TRUE)`, [formula.id, shop.id, p.bottleMl]);
  await db.query('UPDATE shops SET retail_credits=retail_credits-1 WHERE id=$1', [shop.id]);

  // Schedule reminder
  const days = p.bottleMl <= 10 ? 12 : p.bottleMl <= 30 ? 28 : 35;
  const sendAt = new Date(); sendAt.setDate(sendAt.getDate() + days);
  await scheduleReminder({ formulaId: formula.id, shopId: shop.id, customerName: p.customerName, shopName: shop.name, scentId, bottleMl: p.bottleMl, sendAt });

  // Print label
  await queuePrintJob({ shopId: shop.id, formulaId: formula.id, scentId, shopName: shop.name, customer: p.customerName, bottleMl: p.bottleMl, ingredients: p.ingredients });

  // Update stock levels
  await updateStock(shop.id, p.ingredients);

  const updated = await db.queryOne('SELECT retail_credits FROM shops WHERE id=$1', [shop.id]);
  if (updated.retail_credits < 10) sendWhatsApp(shop.phone, M.lowCreditAlert({ shopName: shop.name, credits: updated.retail_credits })).catch(() => {});

  // Send digital WhatsApp card to customer if phone provided
  const reminderDate = sendAt.toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long' });
  if (customerPhone) {
    const card = M.customerScentCard({
      scentId, shopName: shop.name, shopPhone: shop.phone,
      customerName: p.customerName, bottleMl: p.bottleMl, reminderDate
    });
    sendWhatsApp(customerPhone, card).catch(() => {});
    console.log(`📱 Scent card sent to customer ${customerPhone}`);
  }

  return M.mixSaved({
    scentId, customerName: p.customerName, bottleMl: p.bottleMl,
    ingredients: p.ingredients, creditsLeft: updated.retail_credits,
    reminderDate
  }) + (customerPhone
    ? `\n\n📱 Scent card sent to ${customerPhone}`
    : '\n\n💡 _Tip: Add customer phone to send a digital card_\ne.g. MIX Fatuma +255712345678 30 Oud:72 Rose:18');
}

async function handleRefill(shop, args) {
  if (shop.retail_credits < 1) return M.noCredits(shop.retail_credits);
  const p = parseRefillArgs(args);
  if (!p.valid) return M.formatError();

  const formula = await db.queryOne('SELECT * FROM formulas WHERE scent_id=$1 AND shop_id=$2', [p.scentId, shop.id]);
  if (!formula) return M.notFound(p.scentId);

  const bottleMl = p.bottleMl || formula.bottle_ml;
  const ingredients = decryptFormula(formula.ingredients);

  await db.query(`INSERT INTO mix_events (formula_id,shop_id,bottle_ml,credited,is_new) VALUES ($1,$2,$3,TRUE,FALSE)`, [formula.id, shop.id, bottleMl]);
  await db.query(`UPDATE formulas SET last_mixed_at=NOW(), mix_count=mix_count+1, bottle_ml=$1 WHERE id=$2`, [bottleMl, formula.id]);
  await db.query('UPDATE shops SET retail_credits=retail_credits-1 WHERE id=$1', [shop.id]);

  const days = bottleMl <= 10 ? 12 : bottleMl <= 30 ? 28 : 35;
  const sendAt = new Date(); sendAt.setDate(sendAt.getDate() + days);
  const reminderDate = sendAt.toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long' });

  await scheduleReminder({ formulaId: formula.id, shopId: shop.id, customerName: formula.customer_name, shopName: shop.name, scentId: formula.scent_id, bottleMl, sendAt });
  await queuePrintJob({ shopId: shop.id, formulaId: formula.id, scentId: formula.scent_id, shopName: shop.name, customer: formula.customer_name, bottleMl, ingredients });
  await updateStock(shop.id, ingredients);

  // Send digital refill card to customer if phone is saved
  if (formula.customer_phone) {
    const card = M.customerRefillCard({
      scentId: formula.scent_id, shopName: shop.name,
      shopPhone: shop.phone, customerName: formula.customer_name,
      bottleMl, reminderDate
    });
    sendWhatsApp(formula.customer_phone, card).catch(() => {});
    console.log(`📱 Refill card sent to ${formula.customer_phone}`);
  }

  const updated = await db.queryOne('SELECT retail_credits FROM shops WHERE id=$1', [shop.id]);
  return M.refillDone({
    scentId: formula.scent_id, customerName: formula.customer_name,
    bottleMl, ingredients, creditsLeft: updated.retail_credits
  }) + (formula.customer_phone ? `\n\n📱 Refill card sent to customer.` : '');
}

async function handleFind(shop, args) {
  if (!args.length) return M.formatError();
  const q = args.join(' ');
  let formula;
  if (/^NK-\d{4}$/i.test(q)) {
    formula = await db.queryOne('SELECT * FROM formulas WHERE scent_id=$1 AND shop_id=$2', [q.toUpperCase(), shop.id]);
  } else {
    formula = await db.queryOne(`SELECT * FROM formulas WHERE shop_id=$1 AND LOWER(customer_name) LIKE LOWER($2) ORDER BY last_mixed_at DESC LIMIT 1`, [shop.id, `%${q}%`]);
  }
  if (!formula) return M.notFound(q);
  return M.formulaFound({
    scentId: formula.scent_id, customerName: formula.customer_name,
    bottleMl: formula.bottle_ml, ingredients: decryptFormula(formula.ingredients),
    lastMixed: new Date(formula.last_mixed_at).toLocaleDateString('en-TZ'),
    mixCount: formula.mix_count
  });
}

async function handleList(shop) {
  const mixes = await db.queryMany(
    `SELECT me.*, f.customer_name, f.scent_id FROM mix_events me
     JOIN formulas f ON f.id=me.formula_id
     WHERE me.shop_id=$1 AND DATE(me.mixed_at)=CURRENT_DATE ORDER BY me.mixed_at ASC`,
    [shop.id]
  );
  return M.todayList({ shopName: shop.name, mixes, total: mixes.length, revenue: mixes.length * 200 });
}

async function handleExport(shop) {
  const formulas = await db.queryMany('SELECT * FROM formulas WHERE shop_id=$1 ORDER BY created_at ASC', [shop.id]);
  if (!formulas.length) return '📭 No formulas saved yet. Use MIX to save your first.';
  return formulas.map((f, i) => {
    const ing = decryptFormula(f.ingredients);
    return `─ Formula ${i + 1} ─\n🆔 ${f.scent_id} | 👤 ${f.customer_name} | 🫙 ${f.bottle_ml}ml\n${ing.map(i => `  ${i.name}: ${i.amount}`).join('\n')}\n📅 ${new Date(f.created_at).toLocaleDateString('en-TZ')}`;
  }).join('\n\n');
}

module.exports = { handleRetail };
