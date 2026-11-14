import bcrypt from 'bcryptjs';
import { pool, tx } from './pool.js';
import { migrate } from './migrate.js';
import { applyMovement } from '../utils/stock.js';

// Deterministic PRNG so every seed run produces the same demo data
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));

const USERS = [
  ['Aarav Admin', 'admin@stockpilot.dev', 'admin'],
  ['Meera Manager', 'manager@stockpilot.dev', 'manager'],
  ['Sam Staff', 'staff@stockpilot.dev', 'staff'],
  ['Vera Viewer', 'viewer@stockpilot.dev', 'viewer'],
];
const DEMO_PASSWORD = 'Password123!';

const CATEGORIES = ['Electronics', 'Office Supplies', 'Furniture', 'Packaging', 'Tools', 'Accessories'];
const SUPPLIERS = [
  ['Northwind Traders', 'Priya Nair', 'orders@northwind.example', '+91 98100 11122', 'Mumbai, India', 5],
  ['Apex Components', 'Daniel Cho', 'sales@apexcomp.example', '+1 415 555 0134', 'San Jose, USA', 12],
  ['GreenLeaf Paper Co.', 'Lena Fischer', 'hello@greenleaf.example', '+49 30 5550 1188', 'Berlin, Germany', 8],
  ['Summit Furniture', 'Omar Haddad', 'b2b@summitfurn.example', '+971 4 555 0192', 'Dubai, UAE', 21],
  ['PackRight Ltd.', 'Chloe Martin', 'trade@packright.example', '+44 20 7946 0321', 'London, UK', 6],
];
const WAREHOUSES = [['Main Warehouse', 'MAIN', 'Kolkata, India'], ['East Hub', 'EAST', 'Guwahati, India'], ['Retail Store', 'STORE', 'Kolkata, India']];

// sku, name, category, supplier idx, cost, price, reorder level, reorder qty, unit, main stock, east stock, store stock
const PRODUCTS = [
  ['ELE-001', 'Wireless Mouse M200', 0, 1, 8.5, 18.99, 40, 120, 'pcs', 180, 60, 25],
  ['ELE-002', 'Mechanical Keyboard K87', 0, 1, 34, 69.0, 25, 80, 'pcs', 70, 30, 12],
  ['ELE-003', '27" 4K Monitor', 0, 1, 210, 329.0, 10, 30, 'pcs', 24, 8, 4],
  ['ELE-004', 'USB-C Hub 7-in-1', 0, 1, 14, 34.5, 30, 100, 'pcs', 6, 4, 2],
  ['ELE-005', 'Noise-Cancelling Headset', 0, 0, 48, 99.0, 15, 50, 'pcs', 45, 20, 10],
  ['ELE-006', 'Webcam 1080p', 0, 0, 19, 44.0, 20, 60, 'pcs', 0, 0, 0],
  ['OFF-001', 'A4 Copy Paper (500 sheets)', 1, 2, 3.2, 6.5, 200, 800, 'ream', 900, 350, 120],
  ['OFF-002', 'Ballpoint Pens (box of 50)', 1, 2, 4.1, 9.99, 60, 200, 'box', 140, 60, 40],
  ['OFF-003', 'Sticky Notes 3x3 (12 pk)', 1, 2, 2.4, 5.99, 50, 150, 'pack', 18, 20, 12],
  ['OFF-004', 'Stapler Heavy Duty', 1, 2, 6.8, 14.5, 15, 40, 'pcs', 52, 18, 9],
  ['OFF-005', 'Whiteboard Markers (8 pk)', 1, 2, 3.9, 8.99, 40, 120, 'pack', 75, 22, 30],
  ['OFF-006', 'Document Folders (25 pk)', 1, 2, 5.5, 12.0, 30, 90, 'pack', 64, 28, 16],
  ['FUR-001', 'Ergonomic Office Chair', 2, 3, 95, 189.0, 8, 25, 'pcs', 22, 6, 3],
  ['FUR-002', 'Standing Desk 140cm', 2, 3, 180, 349.0, 5, 15, 'pcs', 3, 2, 0],
  ['FUR-003', 'Filing Cabinet 3-Drawer', 2, 3, 70, 139.0, 6, 20, 'pcs', 14, 5, 0],
  ['FUR-004', 'Desk Lamp LED', 2, 3, 11, 26.0, 20, 60, 'pcs', 58, 24, 15],
  ['PAC-001', 'Cardboard Box Small (bundle 25)', 3, 4, 7.5, 15.0, 50, 200, 'bundle', 160, 80, 0],
  ['PAC-002', 'Cardboard Box Large (bundle 10)', 3, 4, 9.2, 19.5, 40, 150, 'bundle', 95, 40, 0],
  ['PAC-003', 'Bubble Wrap Roll 50m', 3, 4, 8.8, 17.9, 25, 80, 'roll', 41, 15, 0],
  ['PAC-004', 'Packing Tape (6 pk)', 3, 4, 6.1, 13.5, 35, 120, 'pack', 22, 12, 0],
  ['TOO-001', 'Cordless Drill 18V', 4, 0, 42, 89.0, 10, 30, 'pcs', 26, 9, 5],
  ['TOO-002', 'Screwdriver Set (32 pc)', 4, 0, 9.5, 21.9, 20, 60, 'set', 48, 20, 11],
  ['TOO-003', 'Measuring Tape 8m', 4, 0, 3.1, 7.8, 30, 100, 'pcs', 110, 45, 25],
  ['TOO-004', 'Safety Gloves (pair)', 4, 0, 1.8, 4.5, 80, 300, 'pair', 35, 40, 20],
  ['ACC-001', 'Laptop Sleeve 15"', 5, 1, 7.2, 19.0, 30, 100, 'pcs', 88, 35, 18],
  ['ACC-002', 'Monitor Stand Riser', 5, 1, 12, 29.0, 15, 50, 'pcs', 33, 14, 6],
  ['ACC-003', 'Cable Organiser Kit', 5, 1, 2.6, 7.5, 40, 120, 'kit', 130, 55, 33],
  ['ACC-004', 'Wrist Rest Gel', 5, 1, 4.4, 11.9, 25, 80, 'pcs', 0, 5, 2],
  ['ACC-005', 'Screen Cleaning Kit', 5, 1, 2.2, 6.4, 30, 100, 'kit', 72, 30, 21],
];

const CUSTOMERS = ['Bluebird Studios', 'Orion Logistics', 'Kestrel Labs', 'Maple & Co.', 'Zenith Academy', 'Harbor Cafe', 'Nova Retail', 'Pinecrest Clinic', 'Atlas Engineering', 'Lumen Media'];

const daysAgo = (d, h = 10) => new Date(Date.now() - d * 86400000 - (24 - h) * 3600000 * 0);

async function seed() {
  await migrate({ reset: true });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const ids = await tx(async (c) => {
    const users = {};
    for (const [name, email, role] of USERS) {
      const { rows } = await c.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id', [name, email, hash, role]);
      users[role] = rows[0].id;
    }
    const cats = [];
    for (const n of CATEGORIES) cats.push((await c.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [n])).rows[0].id);
    const sups = [];
    for (const [n, cp, e, p, a, lt] of SUPPLIERS) sups.push((await c.query('INSERT INTO suppliers (name,contact_person,email,phone,address,lead_time_days) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [n, cp, e, p, a, lt])).rows[0].id);
    const whs = [];
    for (const [n, code, loc] of WAREHOUSES) whs.push((await c.query('INSERT INTO warehouses (name,code,location) VALUES ($1,$2,$3) RETURNING id', [n, code, loc])).rows[0].id);

    const prods = [];
    for (const [sku, name, ci, si, cost, price, rl, rq, unit, ...stock] of PRODUCTS) {
      const { rows } = await c.query(
        `INSERT INTO products (sku,name,category_id,supplier_id,unit,cost_price,sell_price,reorder_level,reorder_qty)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, sell_price`, [sku, name, cats[ci], sups[si], unit, cost, price, rl, rq]);
      prods.push({ id: rows[0].id, price: rows[0].sell_price, sku });
      // opening stock sized so that sales history below leaves a believable remainder
      for (let w = 0; w < 3; w++) {
        const qty = stock[w] + (stock[w] > 0 ? 40 : 0);
        if (qty > 0) await applyMovement(c, { productId: rows[0].id, warehouseId: whs[w], delta: qty, type: 'PURCHASE', note: 'Opening stock', userId: users.manager });
      }
    }
    await c.query(`UPDATE stock_movements SET created_at = now() - interval '20 days'`);
    return { users, whs, prods, sups };
  });

  // Historical fulfilled sales over the last 14 days (drives the dashboard charts)
  const sellable = ids.prods.filter((p) => !['ELE-006', 'ACC-004'].includes(p.sku));
  for (let day = 13; day >= 0; day--) {
    const ordersToday = int(1, 4);
    for (let o = 0; o < ordersToday; o++) {
      await tx(async (c) => {
        const wh = ids.whs[0];
        const when = daysAgo(day);
        const { rows } = await c.query(
          `INSERT INTO sales_orders (so_number, customer_name, warehouse_id, status, created_by, created_at, fulfilled_at)
           VALUES ('SO-' || to_char(now(),'YYYY') || '-' || nextval('so_seq'), $1,$2,'fulfilled',$3,$4,$4) RETURNING id, so_number`,
          [pick(CUSTOMERS), wh, ids.users.staff, when]);
        const chosen = new Set();
        for (let i = 0; i < int(1, 4); i++) chosen.add(pick(sellable));
        for (const p of chosen) {
          const qty = int(1, 8);
          const { rows: cost } = await c.query('SELECT cost_price FROM products WHERE id=$1', [p.id]);
          await c.query('INSERT INTO sales_order_items (so_id,product_id,quantity,unit_price,unit_cost) VALUES ($1,$2,$3,$4,$5)', [rows[0].id, p.id, qty, p.price, cost[0].cost_price]);
          await applyMovement(c, { productId: p.id, warehouseId: wh, delta: -qty, type: 'SALE', refType: 'sales_order', refId: rows[0].id, note: `Shipped on ${rows[0].so_number}`, userId: ids.users.staff });
        }
        await c.query(`UPDATE stock_movements SET created_at = $2 WHERE reference_type='sales_order' AND reference_id=$1`, [rows[0].id, when]);
      });
    }
  }

  // Controlled shortages so the "low stock" widgets have something real to show
  await tx(async (c) => {
    const adjust = async (sku, whIdx, setTo) => {
      const p = ids.prods.find((x) => x.sku === sku);
      const { rows } = await c.query('SELECT quantity FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2', [p.id, ids.whs[whIdx]]);
      const delta = setTo - (rows[0]?.quantity ?? 0);
      if (delta !== 0) await applyMovement(c, { productId: p.id, warehouseId: ids.whs[whIdx], delta, type: 'ADJUSTMENT', note: 'Cycle count correction', userId: ids.users.manager });
    };
    for (const sku of ['ELE-004', 'FUR-002', 'OFF-003', 'TOO-004', 'PAC-004']) {
      for (let w = 0; w < 3; w++) await adjust(sku, w, w === 0 ? int(2, 9) : int(0, 3));
    }
    for (const sku of ['ELE-006', 'ACC-004']) for (let w = 0; w < 3; w++) await adjust(sku, w, 0);
  });

  // A few open orders so the Purchasing / Sales screens are not empty
  await tx(async (c) => {
    const p = (sku) => ids.prods.find((x) => x.sku === sku).id;
    const po = async (supplierIdx, status, items, expectedDays) => {
      const { rows } = await c.query(
        `INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, expected_date, created_by, ordered_at)
         VALUES ('PO-' || to_char(now(),'YYYY') || '-' || nextval('po_seq'), $1,$2,$3, current_date + $4::int, $5, CASE WHEN $3 <> 'draft' THEN now() - interval '3 days' END) RETURNING id`,
        [ids.sups[supplierIdx], ids.whs[0], status, expectedDays, ids.users.manager]);
      for (const [sku, q, cost] of items) await c.query('INSERT INTO purchase_order_items (po_id,product_id,qty_ordered,unit_cost) VALUES ($1,$2,$3,$4)', [rows[0].id, p(sku), q, cost]);
    };
    await po(1, 'ordered', [['ELE-004', 100, 14], ['ACC-004', 80, 4.4]], 6);
    await po(3, 'draft', [['FUR-002', 15, 180]], 14);
    await po(2, 'ordered', [['OFF-003', 150, 2.4]], 4);
    const { rows } = await c.query(
      `INSERT INTO sales_orders (so_number, customer_name, customer_email, warehouse_id, created_by)
       VALUES ('SO-' || to_char(now(),'YYYY') || '-' || nextval('so_seq'), 'Harbor Cafe', 'ops@harborcafe.example', $1, $2) RETURNING id`, [ids.whs[0], ids.users.staff]);
    await c.query('INSERT INTO sales_order_items (so_id,product_id,quantity,unit_price) VALUES ($1,$2,5,18.99),($1,$3,2,189.0)', [rows[0].id, p('ELE-001'), p('FUR-001')]);
  });

  console.log(`Seeded demo data. Login with any of:\n${USERS.map(([, e, r]) => `  ${r.padEnd(8)} ${e}`).join('\n')}\n  password: ${DEMO_PASSWORD}`);
}

seed().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
