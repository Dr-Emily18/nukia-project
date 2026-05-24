// tests/test.js
// NUKIA v2.0 Test Suite
// Run: node tests/test.js

process.env.FORMULA_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';

const { encryptFormula, decryptFormula, generateScentId } = require('../server/utils/encryption');
const { parseMessage, parseMixArgs, parseRefillArgs }     = require('../server/bot/parser');
const M = require('../server/bot/messages');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}
function eq(a, b) { if (a !== b) throw new Error(`Expected "${b}" got "${a}"`); }
function ok(v, msg) { if (!v) throw new Error(msg || 'Assertion failed'); }

// ── ENCRYPTION ───────────────────────────────────────────
console.log('\n🔐 ENCRYPTION');

test('Encrypt and decrypt round-trip', () => {
  const orig = [{ name: 'Oud', amount: 72, percentage: 72 }, { name: 'Rose', amount: 28, percentage: 28 }];
  const enc  = encryptFormula(orig);
  const dec  = decryptFormula(enc);
  eq(dec[0].name, 'Oud');
  eq(dec[1].amount, 28);
});

test('Two encryptions produce different ciphertexts', () => {
  const e1 = encryptFormula([{ name: 'X', amount: 1 }]);
  const e2 = encryptFormula([{ name: 'X', amount: 1 }]);
  ok(e1 !== e2, 'Same ciphertext — IV not random');
});

test('Scent ID format NK-XXXX', () => {
  const id = generateScentId();
  ok(/^NK-\d{4}$/.test(id), `Bad format: ${id}`);
});

test('Decrypt returns empty array on bad input', () => {
  const result = decryptFormula('bad:data:here');
  ok(Array.isArray(result), 'Should return array');
});

// ── PARSER — RETAIL ──────────────────────────────────────
console.log('\n📱 RETAIL PARSER');

test('MIX command English', () => { eq(parseMessage('MIX Fatuma 30 Oud:72', 'retail').command, 'MIX'); });
test('MIX command Swahili (changanya)', () => { eq(parseMessage('changanya Amina 7 Hindi:80', 'retail').command, 'MIX'); });
test('REFILL command', () => { eq(parseMessage('REFILL NK-2847', 'retail').command, 'REFILL'); });
test('FIND command', () => { eq(parseMessage('find Fatuma', 'retail').command, 'FIND'); });
test('Bare Scent ID treated as FIND', () => { eq(parseMessage('NK-2847', 'retail').command, 'FIND'); });
test('CHECK (salio)', () => { eq(parseMessage('salio', 'retail').command, 'CHECK'); });
test('LIST (orodha)', () => { eq(parseMessage('orodha', 'retail').command, 'LIST'); });
test('HELP (msaada)', () => { eq(parseMessage('msaada', 'retail').command, 'HELP'); });
test('PAY (lipa)', () => { eq(parseMessage('lipa', 'retail').command, 'PAY'); });
test('SWITCH command', () => { eq(parseMessage('switch', 'retail').command, 'SWITCH'); });
test('Unknown returns UNKNOWN', () => { eq(parseMessage('habari yako', 'retail').command, 'UNKNOWN'); });
test('Empty message handled', () => { eq(parseMessage('', 'retail').command, 'UNKNOWN'); });

// ── PARSER — WHOLESALE ───────────────────────────────────
console.log('\n🏭 WHOLESALE PARSER');

test('STOCK command', () => { eq(parseMessage('stock', 'wholesale').command, 'WSTOCK'); });
test('STOCK (Swahili: hesabu)', () => { eq(parseMessage('hesabu', 'wholesale').command, 'WSTOCK'); });
test('NETWORK command', () => { eq(parseMessage('network', 'wholesale').command, 'WNETWORK'); });
test('NETWORK (mtandao)', () => { eq(parseMessage('mtandao', 'wholesale').command, 'WNETWORK'); });
test('PUSH command', () => { eq(parseMessage('push NK-1234 +255712', 'wholesale').command, 'WPUSH'); });
test('ALERTS command', () => { eq(parseMessage('alerts', 'wholesale').command, 'WALERT'); });
test('SWITCH wholesale to retail', () => { eq(parseMessage('switch', 'wholesale').command, 'WSWITCH'); });
test('HELP in wholesale', () => { eq(parseMessage('help', 'wholesale').command, 'WHELP'); });

// ── MIX ARGS ─────────────────────────────────────────────
console.log('\n⚗️  MIX ARGS');

test('Parses valid mix correctly', () => {
  const r = parseMixArgs(['fatuma', '30', 'oud:72', 'rose:18', 'musk:10']);
  ok(r.valid, r.error);
  eq(r.bottleMl, 30);
  eq(r.ingredients[0].name, 'Oud');
  eq(r.ingredients[0].percentage, 72);
  eq(r.ingredients.length, 3);
});

test('Auto-calculates percentages', () => {
  const r = parseMixArgs(['test', '30', 'a:60', 'b:40']);
  ok(r.valid);
  eq(r.ingredients[0].percentage, 60);
  eq(r.ingredients[1].percentage, 40);
});

test('Rejects invalid volume (text)', () => {
  const r = parseMixArgs(['test', 'abc', 'oud:100']);
  ok(!r.valid); eq(r.error, 'INVALID_VOLUME');
});

test('Rejects too few arguments', () => {
  const r = parseMixArgs(['test', '30']);
  ok(!r.valid);
});

test('Rejects malformed ingredient', () => {
  const r = parseMixArgs(['test', '30', 'oudjusttext']);
  ok(!r.valid);
});

test('Handles single ingredient', () => {
  const r = parseMixArgs(['test', '7', 'oud:100']);
  ok(r.valid);
  eq(r.ingredients[0].percentage, 100);
});

// ── REFILL ARGS ──────────────────────────────────────────
console.log('\n🔁 REFILL ARGS');

test('Valid refill with bottle ml', () => {
  const r = parseRefillArgs(['nk-2847', '50']);
  ok(r.valid); eq(r.scentId, 'NK-2847'); eq(r.bottleMl, 50);
});

test('Valid refill without bottle ml', () => {
  const r = parseRefillArgs(['nk-2847']);
  ok(r.valid); ok(r.bottleMl === null);
});

test('Rejects invalid scent ID', () => {
  ok(!parseRefillArgs(['2847']).valid);
});

test('Rejects empty args', () => {
  ok(!parseRefillArgs([]).valid);
});

// ── MESSAGES ─────────────────────────────────────────────
console.log('\n💬 MESSAGES');

test('Retail help contains all commands', () => {
  const m = M.retailHelp('Test Shop', false);
  ['MIX','REFILL','FIND','LIST','CHECK','PAY','EXPORT'].forEach(cmd => {
    ok(m.includes(cmd), `Missing: ${cmd}`);
  });
});

test('Retail help for hybrid shows SWITCH', () => {
  const m = M.retailHelp('Test Shop', true);
  ok(m.includes('SWITCH'), 'Hybrid should show SWITCH');
});

test('Wholesale help contains all commands', () => {
  const m = M.wholesaleHelp('Kariakoo Oils');
  ['STOCK','NETWORK','PUSH','BATCH','ALERTS','SWITCH'].forEach(cmd => {
    ok(m.includes(cmd), `Missing: ${cmd}`);
  });
});

test('Mix saved message shows all fields', () => {
  const m = M.mixSaved({
    scentId: 'NK-1234', customerName: 'Fatuma', bottleMl: 30,
    ingredients: [{ name: 'Oud', amount: 72, percentage: 72 }],
    creditsLeft: 45, reminderDate: 'Monday, 28 Jan'
  });
  ok(m.includes('NK-1234')); ok(m.includes('Fatuma')); ok(m.includes('45'));
});

test('SMS reminder under 160 characters', () => {
  const m = M.reminderSms({ customerName: 'Amina Hassan', shopName: 'Premium Scents Kariakoo', scentId: 'NK-5678', bottleMl: 30 });
  ok(m.length <= 160, `Too long: ${m.length} chars`);
  ok(m.includes('NK-5678'));
});

test('Low credit warning for 3 credits', () => {
  const m = M.balance({ shopName: 'X', credits: 3, todayMixes: 0, todayRevenue: 0 });
  ok(m.toLowerCase().includes('critical') || m.toLowerCase().includes('almost'), 'No warning shown');
});

test('OK message for 50 credits', () => {
  const m = M.balance({ shopName: 'X', credits: 50, todayMixes: 10, todayRevenue: 2000 });
  ok(m.includes('✅'));
});

test('Reorder alert contains retailer name', () => {
  const m = M.reorderAlert({ retailerName: 'Mabibo Shop', oilName: 'Oud', daysLeft: 5 });
  ok(m.includes('Mabibo Shop')); ok(m.includes('Oud'));
});

test('Formula pushed message contains scent ID', () => {
  const m = M.formulaPushed({ scentId: 'NK-9999', retailerName: 'Street Shop A' });
  ok(m.includes('NK-9999')); ok(m.includes('Street Shop A'));
});

test('Switched to wholesale message', () => {
  const m = M.switchedToWholesale('Kariakoo Oils');
  ok(m.includes('Wholesale')); ok(m.includes('Kariakoo Oils'));
});

test('Switched to retail message', () => {
  const m = M.switchedToRetail('Kariakoo Oils');
  ok(m.includes('Retail'));
});

// ── RESULTS ──────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`  ${passed} passed · ${failed} failed · ${passed + failed} total`);
if (failed === 0) {
  console.log('  🎉 ALL TESTS PASSED — ready to deploy!');
} else {
  console.log(`  ⚠️  Fix ${failed} failing test(s) before deploying.`);
  process.exit(1);
}
console.log('══════════════════════════════════════════\n');
