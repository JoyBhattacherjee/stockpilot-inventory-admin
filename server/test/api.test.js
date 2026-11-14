// Integration tests - run against a seeded database:  npm run db:reset && npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

let server, base;
const tokens = {};
const PW = 'Password123!';

async function api(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

before(async () => {
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}/api`;
  for (const r of ['admin', 'manager', 'staff', 'viewer']) {
    const res = await api('POST', '/auth/login', { body: { email: `${r}@stockpilot.dev`, password: PW } });
    assert.equal(res.status, 200, `login ${r}`);
    tokens[r] = res.body.token;
  }
});
after(async () => { server.close(); await pool.end(); });

test('auth: rejects bad credentials and missing token', async () => {
  assert.equal((await api('POST', '/auth/login', { body: { email: 'admin@stockpilot.dev', password: 'nope' } })).status, 401);
  assert.equal((await api('GET', '/products')).status, 401);
});

test('rbac: viewer is read-only, staff cannot manage catalogue, only admin manages users', async () => {
  const product = { sku: `RB-${Date.now()}`, name: 'RBAC probe', cost_price: 1, sell_price: 2 };
  assert.equal((await api('GET', '/products', { token: tokens.viewer })).status, 200);
  assert.equal((await api('POST', '/products', { token: tokens.viewer, body: product })).status, 403);
  assert.equal((await api('POST', '/products', { token: tokens.staff, body: product })).status, 403);
  assert.equal((await api('GET', '/users', { token: tokens.manager })).status, 403);
  assert.equal((await api('GET', '/audit', { token: tokens.manager })).status, 403);
  assert.equal((await api('GET', '/users', { token: tokens.admin })).status, 200);
  assert.equal((await api('POST', '/stock/adjust', { token: tokens.staff, body: { product_id: 1, warehouse_id: 1, mode: 'add', quantity: 1, reason: 'nope' } })).status, 403);
});

test('admin cannot demote or deactivate themselves', async () => {
  const me = (await api('GET', '/auth/me', { token: tokens.admin })).body.user;
  assert.equal((await api('PATCH', `/users/${me.id}`, { token: tokens.admin, body: { role: 'viewer' } })).status, 400);
  assert.equal((await api('PATCH', `/users/${me.id}`, { token: tokens.admin, body: { active: false } })).status, 400);
});

test('product validation + duplicate SKU', async () => {
  const sku = `T-${Date.now()}`;
  const bad = await api('POST', '/products', { token: tokens.manager, body: { sku: 'x y', name: 'a' } });
  assert.equal(bad.status, 400);
  const ok = await api('POST', '/products', { token: tokens.manager, body: { sku, name: 'Test Widget', cost_price: 10, sell_price: 20 } });
  assert.equal(ok.status, 201);
  assert.equal((await api('POST', '/products', { token: tokens.manager, body: { sku, name: 'Dup', cost_price: 1, sell_price: 1 } })).status, 409);
});

test('purchase order: partial receive, weighted-average cost, over-receive blocked', async () => {
  const sku = `PO-${Date.now()}`;
  const wh = (await api('GET', '/warehouses', { token: tokens.admin })).body[0].id;
  const sup = (await api('GET', '/suppliers', { token: tokens.admin })).body[0].id;
  const p = (await api('POST', '/products', { token: tokens.manager, body: { sku, name: 'PO product', cost_price: 10, sell_price: 30, initial_stock: 10, warehouse_id: wh } })).body;

  const po = (await api('POST', '/purchase-orders', { token: tokens.manager, body: { supplier_id: sup, warehouse_id: wh, items: [{ product_id: p.id, quantity: 10, unit_cost: 20 }] } })).body;
  assert.match(po.po_number, /^PO-\d{4}-\d+$/);
  assert.equal((await api('POST', `/purchase-orders/${po.id}/receive`, { token: tokens.staff, body: { items: [{ item_id: po.items[0].id, quantity: 1 }] } })).status, 409, 'draft cannot be received');
  assert.equal((await api('POST', `/purchase-orders/${po.id}/place`, { token: tokens.staff })).status, 403);
  assert.equal((await api('POST', `/purchase-orders/${po.id}/place`, { token: tokens.manager })).status, 200);

  const r1 = await api('POST', `/purchase-orders/${po.id}/receive`, { token: tokens.staff, body: { items: [{ item_id: po.items[0].id, quantity: 4 }] } });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.status, 'partial');
  // 10 on hand @10 + 4 @20 => (100+80)/14 = 12.86
  const afterOne = (await api('GET', `/products/${p.id}`, { token: tokens.viewer })).body;
  assert.equal(afterOne.stock, 14);
  assert.equal(afterOne.cost_price, 12.86);

  assert.equal((await api('POST', `/purchase-orders/${po.id}/receive`, { token: tokens.staff, body: { items: [{ item_id: po.items[0].id, quantity: 7 }] } })).status, 400, 'cannot over-receive');
  const r2 = await api('POST', `/purchase-orders/${po.id}/receive`, { token: tokens.staff, body: { items: [{ item_id: po.items[0].id, quantity: 6 }] } });
  assert.equal(r2.body.status, 'received');
  assert.equal((await api('POST', `/purchase-orders/${po.id}/cancel`, { token: tokens.manager })).status, 409);
});

test('sales order: fulfilment is all-or-nothing and never oversells', async () => {
  const wh = (await api('GET', '/warehouses', { token: tokens.admin })).body[0].id;
  const mk = async (suffix, stock) => (await api('POST', '/products', { token: tokens.manager, body: { sku: `SO-${suffix}-${Date.now()}`, name: `SO ${suffix}`, cost_price: 5, sell_price: 9, initial_stock: stock, warehouse_id: wh } })).body;
  const a = await mk('A', 10);
  const b = await mk('B', 1);

  // second line is short -> whole order must fail and line A must be untouched
  const so = (await api('POST', '/sales-orders', { token: tokens.staff, body: { customer_name: 'Acme Test', warehouse_id: wh, items: [{ product_id: a.id, quantity: 5 }, { product_id: b.id, quantity: 3 }] } })).body;
  const fail = await api('POST', `/sales-orders/${so.id}/fulfill`, { token: tokens.staff });
  assert.equal(fail.status, 409);
  assert.match(fail.body.error, /Insufficient stock/);
  assert.equal((await api('GET', `/products/${a.id}`, { token: tokens.viewer })).body.stock, 10, 'rolled back');

  // concurrency: two orders of 8 against stock of 10 -> exactly one succeeds
  const mkOrder = async () => (await api('POST', '/sales-orders', { token: tokens.staff, body: { customer_name: 'Race', warehouse_id: wh, items: [{ product_id: a.id, quantity: 8 }] } })).body;
  const [o1, o2] = await Promise.all([mkOrder(), mkOrder()]);
  const results = await Promise.all([o1, o2].map((o) => api('POST', `/sales-orders/${o.id}/fulfill`, { token: tokens.staff })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await api('GET', `/products/${a.id}`, { token: tokens.viewer })).body.stock, 2);

  // double fulfil blocked
  const done = results.find((r) => r.status === 200).body;
  assert.equal((await api('POST', `/sales-orders/${done.id}/fulfill`, { token: tokens.staff })).status, 409);
  assert.equal((await api('POST', `/sales-orders/${done.id}/cancel`, { token: tokens.staff })).status, 409);
});

test('stock: adjust requires reason, transfer moves units between warehouses', async () => {
  const whs = (await api('GET', '/warehouses', { token: tokens.admin })).body;
  const p = (await api('POST', '/products', { token: tokens.manager, body: { sku: `TR-${Date.now()}`, name: 'Transfer item', cost_price: 1, sell_price: 2, initial_stock: 10, warehouse_id: whs[0].id } })).body;
  assert.equal((await api('POST', '/stock/adjust', { token: tokens.manager, body: { product_id: p.id, warehouse_id: whs[0].id, mode: 'set', quantity: 3, reason: '' } })).status, 400);
  const adj = await api('POST', '/stock/adjust', { token: tokens.manager, body: { product_id: p.id, warehouse_id: whs[0].id, mode: 'set', quantity: 8, reason: 'Cycle count' } });
  assert.equal(adj.body.delta, -2);
  assert.equal((await api('POST', '/stock/transfer', { token: tokens.staff, body: { product_id: p.id, from_warehouse_id: whs[0].id, to_warehouse_id: whs[1].id, quantity: 20 } })).status, 409);
  assert.equal((await api('POST', '/stock/transfer', { token: tokens.staff, body: { product_id: p.id, from_warehouse_id: whs[0].id, to_warehouse_id: whs[1].id, quantity: 5 } })).status, 200);
  const d = (await api('GET', `/products/${p.id}`, { token: tokens.viewer })).body;
  assert.equal(d.stock, 8);
  assert.equal(d.levels.find((l) => l.warehouse_id === whs[1].id).quantity, 5);
});

test('dashboard, reorder suggestions and CSV export', async () => {
  const d = await api('GET', '/dashboard', { token: tokens.viewer });
  assert.equal(d.status, 200);
  assert.ok(d.body.kpis.products > 0);
  assert.equal(d.body.movementsByDay.length, 14);
  const r = await api('GET', '/reports/reorder', { token: tokens.manager });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  const csv = await fetch(`${base}/reports/export/products.csv`, { headers: { Authorization: `Bearer ${tokens.manager}` } });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /^sku,name,category/);
  assert.equal((await fetch(`${base}/reports/export/products.csv`, { headers: { Authorization: `Bearer ${tokens.staff}` } })).status, 403);
});
