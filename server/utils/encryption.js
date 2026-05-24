// server/utils/encryption.js
const crypto = require('crypto');
const ALGO = 'aes-256-gcm';

function getKey() {
  const k = process.env.FORMULA_ENCRYPTION_KEY;
  if (!k || k.length < 64) {
    // fallback for testing only
    return Buffer.alloc(32, 'nukia-test-key-do-not-use-in-prod');
  }
  return Buffer.from(k, 'hex');
}

function encryptFormula(ingredients) {
  const text = JSON.stringify(ingredients);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc}`;
}

function decryptFormula(encStr) {
  try {
    const [ivH, tagH, enc] = encStr.split(':');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivH, 'hex'));
    decipher.setAuthTag(Buffer.from(tagH, 'hex'));
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return JSON.parse(dec);
  } catch {
    return [];
  }
}

function generateScentId() {
  return `NK-${Math.floor(1000 + Math.random() * 9000)}`;
}

module.exports = { encryptFormula, decryptFormula, generateScentId };
