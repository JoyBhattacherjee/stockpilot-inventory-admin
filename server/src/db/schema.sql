-- StockPilot schema (idempotent)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','manager','staff','viewer')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  lead_time_days INT NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  code     TEXT NOT NULL UNIQUE,
  location TEXT,
  active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  category_id   INT REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id   INT REFERENCES suppliers(id) ON DELETE SET NULL,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  cost_price    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sell_price    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  reorder_level INT NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  reorder_qty   INT NOT NULL DEFAULT 0 CHECK (reorder_qty >= 0),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);

CREATE TABLE IF NOT EXISTS stock_levels (
  product_id   INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity     INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id             BIGSERIAL PRIMARY KEY,
  product_id     INT NOT NULL REFERENCES products(id),
  warehouse_id   INT NOT NULL REFERENCES warehouses(id),
  type           TEXT NOT NULL CHECK (type IN ('PURCHASE','SALE','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT')),
  quantity       INT NOT NULL CHECK (quantity <> 0), -- signed delta
  balance_after  INT NOT NULL,
  reference_type TEXT,
  reference_id   INT,
  note           TEXT,
  user_id        INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at DESC);

CREATE SEQUENCE IF NOT EXISTS po_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS so_seq START 5001;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            SERIAL PRIMARY KEY,
  po_number     TEXT NOT NULL UNIQUE,
  supplier_id   INT NOT NULL REFERENCES suppliers(id),
  warehouse_id  INT NOT NULL REFERENCES warehouses(id),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','partial','received','cancelled')),
  expected_date DATE,
  notes         TEXT,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ordered_at    TIMESTAMPTZ,
  received_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id           SERIAL PRIMARY KEY,
  po_id        INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id   INT NOT NULL REFERENCES products(id),
  qty_ordered  INT NOT NULL CHECK (qty_ordered > 0),
  qty_received INT NOT NULL DEFAULT 0 CHECK (qty_received >= 0 AND qty_received <= qty_ordered),
  unit_cost    NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0)
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id             SERIAL PRIMARY KEY,
  so_number      TEXT NOT NULL UNIQUE,
  customer_name  TEXT NOT NULL,
  customer_email TEXT,
  warehouse_id   INT NOT NULL REFERENCES warehouses(id),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','cancelled')),
  notes          TEXT,
  created_by     INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id         SERIAL PRIMARY KEY,
  so_id      INT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity   INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost  NUMERIC(12,2) -- snapshot taken at fulfilment, used for profit
);
CREATE INDEX IF NOT EXISTS idx_so_status ON sales_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  user_name  TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
