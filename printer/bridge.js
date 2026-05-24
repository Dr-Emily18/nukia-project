// printer/bridge.js
// Run on any device in the shop:
// node bridge.js --shop-id=1 --server=https://nukia.onrender.com --printer-ip=192.168.1.100

require('dotenv').config();
const axios = require('axios');
const net   = require('net');

const SHOP_ID      = getArg('shop-id')     || process.env.SHOP_ID;
const SERVER_URL   = getArg('server')      || process.env.NUKIA_SERVER_URL || 'http://localhost:3000';
const PRINTER_IP   = getArg('printer-ip')  || process.env.DEFAULT_PRINTER_IP;
const PRINTER_PORT = parseInt(getArg('printer-port') || process.env.DEFAULT_PRINTER_PORT || '9100');
const API_KEY      = getArg('api-key')     || process.env.BRIDGE_API_KEY;
const POLL_MS      = 30000;

if (!SHOP_ID) { console.error('❌ Missing --shop-id'); process.exit(1); }

console.log(`🖨️  NUKIA Printer Bridge v2.0\n   Shop: ${SHOP_ID} | Server: ${SERVER_URL} | Printer: ${PRINTER_IP}:${PRINTER_PORT}`);

async function poll() {
  try {
    const { data } = await axios.get(`${SERVER_URL}/webhook/print-jobs/pending/${SHOP_ID}`, {
      headers: { 'x-api-key': API_KEY }, timeout: 10000
    });
    for (const job of data.jobs || []) await printLabel(job);
  } catch (err) {
    if (err.code !== 'ECONNREFUSED') console.warn('Poll error:', err.message);
  }
}

async function printLabel(job) {
  const label = JSON.parse(job.label_text);
  const ip    = job.printer_ip || PRINTER_IP;
  const port  = job.printer_port || PRINTER_PORT;
  console.log(`🖨️  Printing ${label.scentId} → ${ip}:${port}`);
  try {
    await sendToThermal(ip, port, buildEscPos(label));
    await axios.post(`${SERVER_URL}/webhook/print-jobs/${job.id}/status`, { status: 'printed' }, { headers: { 'x-api-key': API_KEY } });
    console.log(`✅ Printed: ${label.scentId}`);
  } catch (err) {
    console.error(`❌ Print failed:`, err.message);
    await axios.post(`${SERVER_URL}/webhook/print-jobs/${job.id}/status`, { status: 'failed', error: err.message }, { headers: { 'x-api-key': API_KEY } }).catch(() => {});
  }
}

function buildEscPos(label) {
  const ESC = 0x1B, GS = 0x1D;
  const t = s => Buffer.from(s + '\n', 'utf8');
  return Buffer.concat([
    Buffer.from([ESC, 0x40]),                    // init
    Buffer.from([ESC, 0x61, 0x01]),              // center
    Buffer.from([GS,  0x21, 0x11]),              // double size
    Buffer.from([ESC, 0x45, 0x01]),              // bold
    t(label.shopName.toUpperCase()),
    Buffer.from([GS, 0x21, 0x00]),
    Buffer.from([ESC, 0x45, 0x00]),
    t('─────────────────'),
    Buffer.from([GS, 0x21, 0x11]),
    t(label.scentId),
    Buffer.from([GS, 0x21, 0x00]),
    t(`For: ${label.customer}`),
    t(`${label.bottleMl}ml · ${label.date}`),
    t('─────────────────'),
    Buffer.from([ESC, 0x61, 0x00]),              // left
    ...(label.ingredients || []).map(i => t(`${i.name}: ${i.amount} (${i.percentage}%)`)),
    Buffer.from([ESC, 0x61, 0x01]),              // center
    ...buildQR(label.qrData || `nukia/${label.scentId}`),
    t('Scan to reorder'),
    t('NUKIA · Harufu ya Akili'),
    t(''),
    Buffer.from([ESC, 0x64, 0x05]),              // feed
    Buffer.from([GS, 0x56, 0x42, 0x00]),         // cut
  ]);
}

function buildQR(data) {
  const len = data.length + 3;
  return [
    Buffer.from([0x1D,0x28,0x6B,0x04,0x00,0x31,0x41,0x32,0x00]),
    Buffer.from([0x1D,0x28,0x6B,0x03,0x00,0x31,0x43,0x05]),
    Buffer.from([0x1D,0x28,0x6B,0x03,0x00,0x31,0x45,0x31]),
    Buffer.from([0x1D,0x28,0x6B, len%256, Math.floor(len/256), 0x31,0x50,0x30]),
    Buffer.from(data,'utf8'),
    Buffer.from([0x1D,0x28,0x6B,0x03,0x00,0x31,0x51,0x30]),
  ];
}

function sendToThermal(ip, port, data) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('Printer timeout')); }, 10000);
    sock.connect(port, ip, () => {
      sock.write(data, err => {
        if (err) { clearTimeout(timer); sock.destroy(); reject(err); return; }
        setTimeout(() => { clearTimeout(timer); sock.destroy(); resolve(); }, 500);
      });
    });
    sock.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

function getArg(name) {
  const a = process.argv.find(a => a.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : null;
}

console.log('🟢 Bridge running. Ctrl+C to stop.\n');
poll();
setInterval(poll, POLL_MS);
