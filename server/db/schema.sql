-- ═══════════════════════════════════════════════════════
-- NUKIA v2.0 Database Schema
-- Supports: Retail shops, Wholesale suppliers, Hybrid shops
-- Run: node server/db/setup.js
-- ═══════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────
-- SHOPS — every registered shop (retail, wholesale, or both)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id                      SERIAL PRIMARY KEY,
  name                    VARCHAR(200) NOT NULL,
  phone                   VARCHAR(20) UNIQUE NOT NULL,
  whatsapp                VARCHAR(20),
  -- SHOP TYPE: retail, wholesale, or hybrid
  shop_type               VARCHAR(20) DEFAULT 'retail' CHECK (shop_type IN ('retail','wholesale','hybrid')),
  -- current mode for hybrid shops
  active_mode             VARCHAR(20) DEFAULT 'retail' CHECK (active_mode IN ('retail','wholesale')),
  -- credits for retail mixing (200 TSH per mix)
  retail_credits          INTEGER DEFAULT 0,
  -- wholesale subscription status
  wholesale_active        BOOLEAN DEFAULT FALSE,
  wholesale_fee_tsh       INTEGER DEFAULT 20000,
  wholesale_paid_until    DATE,
  -- printer settings
  printer_ip              VARCHAR(45),
  printer_port            INTEGER DEFAULT 9100,
  printer_enabled         BOOLEAN DEFAULT TRUE,
  -- status
  active                  BOOLEAN DEFAULT TRUE,
  onboarded_at            TIMESTAMP DEFAULT NOW(),
  notes                   TEXT
);

-- ─────────────────────────────────────────────────────────
-- SUPPLY RELATIONSHIPS — wholesaler → retailer links
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supply_relationships (
  id                SERIAL PRIMARY KEY,
  wholesaler_id     INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  retailer_id       INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  oils_supplied     TEXT[],           -- list of oil names this wholesaler supplies
  supply_frequency  VARCHAR(50),      -- e.g. "weekly", "monthly"
  active            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP DEFAULT NOW(),
  UNIQUE(wholesaler_id, retailer_id)
);

-- ─────────────────────────────────────────────────────────
-- FORMULAS — encrypted scent recipes
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS formulas (
  id                SERIAL PRIMARY KEY,
  shop_id           INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  -- who originally created this formula
  created_by_wholesaler_id INTEGER REFERENCES shops(id) ON DELETE SET NULL,
  customer_name     VARCHAR(200) NOT NULL,
  customer_phone    VARCHAR(20),
  scent_id          VARCHAR(20) UNIQUE NOT NULL,
  ingredients       TEXT NOT NULL,    -- AES-256 encrypted JSON
  bottle_ml         INTEGER NOT NULL,
  notes             TEXT,
  -- sharing
  shared_to_network BOOLEAN DEFAULT FALSE,
  -- counters
  mix_count         INTEGER DEFAULT 1,
  created_at        TIMESTAMP DEFAULT NOW(),
  last_mixed_at     TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- MIX EVENTS — every mixing transaction
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mix_events (
  id          SERIAL PRIMARY KEY,
  formula_id  INTEGER REFERENCES formulas(id) ON DELETE SET NULL,
  shop_id     INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  bottle_ml   INTEGER NOT NULL,
  is_new      BOOLEAN DEFAULT TRUE,   -- FALSE = refill
  credited    BOOLEAN DEFAULT FALSE,  -- TRUE = 200 TSH deducted
  mixed_at    TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- STOCK LEVELS — oil inventory tracking per retailer
-- Updated automatically when mixes are logged
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_levels (
  id              SERIAL PRIMARY KEY,
  shop_id         INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  oil_name        VARCHAR(200) NOT NULL,
  estimated_ml    DECIMAL(10,2) DEFAULT 0,
  last_restocked  TIMESTAMP,
  last_updated    TIMESTAMP DEFAULT NOW(),
  UNIQUE(shop_id, oil_name)
);

-- ─────────────────────────────────────────────────────────
-- REORDER ALERTS — sent to wholesaler when retailer runs low
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reorder_alerts (
  id              SERIAL PRIMARY KEY,
  wholesaler_id   INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  retailer_id     INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  retailer_name   VARCHAR(200),
  oil_name        VARCHAR(200),
  estimated_ml    DECIMAL(10,2),
  days_remaining  INTEGER,
  sent            BOOLEAN DEFAULT FALSE,
  sent_at         TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- REMINDERS — scheduled customer refill nudges
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id              SERIAL PRIMARY KEY,
  formula_id      INTEGER REFERENCES formulas(id) ON DELETE CASCADE,
  shop_id         INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  customer_phone  VARCHAR(20) NOT NULL,
  customer_name   VARCHAR(200),
  shop_name       VARCHAR(200),
  scent_id        VARCHAR(20),
  bottle_ml       INTEGER,
  send_at         TIMESTAMP NOT NULL,
  sent            BOOLEAN DEFAULT FALSE,
  sent_at         TIMESTAMP,
  channel         VARCHAR(10) DEFAULT 'sms',
  failed          BOOLEAN DEFAULT FALSE,
  error_msg       TEXT
);

-- ─────────────────────────────────────────────────────────
-- PRINT JOBS — label print queue
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS print_jobs (
  id          SERIAL PRIMARY KEY,
  shop_id     INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  formula_id  INTEGER REFERENCES formulas(id) ON DELETE SET NULL,
  scent_id    VARCHAR(20),
  label_text  TEXT NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT NOW(),
  printed_at  TIMESTAMP,
  error_msg   TEXT
);

-- ─────────────────────────────────────────────────────────
-- MPESA TRANSACTIONS — payment records
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mpesa_transactions (
  id              SERIAL PRIMARY KEY,
  shop_id         INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  amount_tsh      INTEGER NOT NULL,
  credits_added   INTEGER DEFAULT 0,
  payment_type    VARCHAR(20) DEFAULT 'retail',  -- retail or wholesale
  mpesa_ref       VARCHAR(50),
  confirmed_by    VARCHAR(100) DEFAULT 'manual',
  confirmed_at    TIMESTAMP DEFAULT NOW(),
  notes           TEXT
);

-- ─────────────────────────────────────────────────────────
-- WHOLESALE BATCHES — bulk mixing events (liters not ml)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wholesale_batches (
  id              SERIAL PRIMARY KEY,
  wholesaler_id   INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  formula_name    VARCHAR(200),
  ingredients     TEXT,              -- encrypted JSON
  volume_liters   DECIMAL(10,3),
  produced_at     TIMESTAMP DEFAULT NOW(),
  distributed_to  INTEGER[],         -- array of retailer shop IDs
  notes           TEXT
);

-- ─────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_formulas_shop      ON formulas(shop_id);
CREATE INDEX IF NOT EXISTS idx_formulas_scent     ON formulas(scent_id);
CREATE INDEX IF NOT EXISTS idx_reminders_send_at  ON reminders(send_at, sent);
CREATE INDEX IF NOT EXISTS idx_mix_events_shop    ON mix_events(shop_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status  ON print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_supply_wholesaler  ON supply_relationships(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_supply_retailer    ON supply_relationships(retailer_id);
CREATE INDEX IF NOT EXISTS idx_stock_shop         ON stock_levels(shop_id);
CREATE INDEX IF NOT EXISTS idx_reorder_wholesaler ON reorder_alerts(wholesaler_id, sent);

-- ─────────────────────────────────────────────────────────
-- USEFUL VIEWS
-- ─────────────────────────────────────────────────────────

-- Today's revenue per shop
CREATE OR REPLACE VIEW daily_revenue AS
SELECT
  s.name AS shop_name,
  s.shop_type,
  COUNT(me.id) AS mixes_today,
  COUNT(me.id) * 200 AS revenue_tsh
FROM mix_events me
JOIN shops s ON s.id = me.shop_id
WHERE DATE(me.mixed_at) = CURRENT_DATE AND me.credited = TRUE
GROUP BY s.name, s.shop_type
ORDER BY revenue_tsh DESC;

-- Pending reminders
CREATE OR REPLACE VIEW pending_reminders AS
SELECT * FROM reminders
WHERE sent = FALSE AND failed = FALSE AND send_at <= NOW()
ORDER BY send_at ASC;

-- Wholesaler network summary
CREATE OR REPLACE VIEW wholesaler_network AS
SELECT
  w.name AS wholesaler_name,
  w.phone AS wholesaler_phone,
  COUNT(sr.retailer_id) AS retailer_count,
  SUM(sl.estimated_ml) AS total_network_stock_ml
FROM shops w
JOIN supply_relationships sr ON sr.wholesaler_id = w.id
LEFT JOIN stock_levels sl ON sl.shop_id = sr.retailer_id
WHERE w.shop_type IN ('wholesale','hybrid')
GROUP BY w.name, w.phone;
