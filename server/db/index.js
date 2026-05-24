// server/db/index.js
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected');
    release();
  }
});

async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('DB Error:', err.message, '| Query:', text);
    throw err;
  }
}

async function queryOne(text, params) {
  const r = await query(text, params);
  return r.rows[0] || null;
}

async function queryMany(text, params) {
  const r = await query(text, params);
  return r.rows;
}

module.exports = { pool, query, queryOne, queryMany };

// Run setup: node server/db/index.js setup
if (require.main === module && process.argv[2] === 'setup') {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  pool.query(sql)
    .then(() => { console.log('✅ Database schema created'); process.exit(0); })
    .catch(e => { console.error('❌ Schema failed:', e.message); process.exit(1); });
}
