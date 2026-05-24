// server/bot/parser.js
// Handles both retail and wholesale WhatsApp commands
// Supports English and Swahili

const RETAIL_COMMANDS = {
  MIX:    ['mix', 'changanya', 'new', 'mpya'],
  REFILL: ['refill', 'jaza', 'repeat', 'rudia'],
  FIND:   ['find', 'tafuta', 'search'],
  LIST:   ['list', 'orodha', 'today', 'leo'],
  CHECK:  ['check', 'balance', 'salio', 'credits', 'krediti'],
  PAY:    ['pay', 'lipa', 'topup'],
  EXPORT: ['export', 'hamisha'],
  SWITCH: ['switch', 'badilisha', 'mode'],
  HELP:   ['help', 'msaada', 'menu', 'start'],
};

const WHOLESALE_COMMANDS = {
  WSTOCK:   ['stock', 'hesabu', 'inventory'],
  WNETWORK: ['network', 'mtandao', 'retailers', 'shops'],
  WPUSH:    ['push', 'tuma', 'send'],
  WBATCH:   ['batch', 'bulk', 'kundi'],
  WALERT:   ['alerts', 'tahadhari', 'runout'],
  WSWITCH:  ['switch', 'badilisha', 'retail', 'mode'],
  WHELP:    ['help', 'msaada', 'menu', 'start'],
};

function parseMessage(body, mode = 'retail') {
  if (!body) return { command: 'UNKNOWN', args: [], raw: '' };
  const cleaned = body.trim().toLowerCase();
  const parts = cleaned.split(/\s+/);
  const first = parts[0];
  const args = parts.slice(1);

  const commands = mode === 'wholesale' ? WHOLESALE_COMMANDS : RETAIL_COMMANDS;

  for (const [cmd, aliases] of Object.entries(commands)) {
    if (aliases.includes(first)) return { command: cmd, args, raw: body.trim() };
  }

  // Bare scent ID
  if (/^nk-\d{4}$/i.test(first)) {
    return { command: 'FIND', args: [first.toUpperCase()], raw: body.trim() };
  }

  return { command: 'UNKNOWN', args: parts, raw: body.trim() };
}

function parseMixArgs(args) {
  if (!args || args.length < 3) return { valid: false, error: 'FORMAT_ERROR' };
  const customerName = args[0];
  const bottleMl = parseInt(args[1], 10);
  if (isNaN(bottleMl) || bottleMl < 1) return { valid: false, error: 'INVALID_VOLUME' };

  const ingredients = [];
  for (const ing of args.slice(2)) {
    const [name, amtStr] = ing.split(':');
    if (!name || !amtStr) return { valid: false, error: 'INVALID_INGREDIENT', ingredient: ing };
    const amount = parseFloat(amtStr);
    if (isNaN(amount)) return { valid: false, error: 'INVALID_AMOUNT' };
    ingredients.push({ name: name.charAt(0).toUpperCase() + name.slice(1), amount });
  }

  if (!ingredients.length) return { valid: false, error: 'NO_INGREDIENTS' };
  const total = ingredients.reduce((s, i) => s + i.amount, 0);
  return {
    valid: true, customerName, bottleMl,
    ingredients: ingredients.map(i => ({ ...i, percentage: Math.round((i.amount / total) * 100) })),
    totalAmount: total
  };
}

function parseRefillArgs(args) {
  if (!args || !args[0]) return { valid: false, error: 'FORMAT_ERROR' };
  const scentId = args[0].toUpperCase();
  if (!/^NK-\d{4}$/.test(scentId)) return { valid: false, error: 'INVALID_SCENT_ID' };
  return { valid: true, scentId, bottleMl: args[1] ? parseInt(args[1], 10) : null };
}

module.exports = { parseMessage, parseMixArgs, parseRefillArgs };
