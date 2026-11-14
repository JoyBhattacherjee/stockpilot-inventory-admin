import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, notFound, wrap } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { applyMovement } from '../utils/stock.js';

const router = Router();
const WRITE = ['admin', 'manager', 'staff'];

const soSchema = z.object({
  customer_name: z.string().trim().min(2).max(120),
  customer_email: z.string().email().nullish().or(z.literal('')).transform((v) => v || null),
  warehouse_id: z.coerce.number().int().positive(),
  notes: z.string().trim().max(1000).nullish(),
  items: z.array(z.object({
    product_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive(),
    unit_price: z.coerce.number().min(0).optional(),
  })).min(1, 'Add at least one item')
    .refine((a) => new Set(a.map((i) => i.product_id)).size === a.length, 'Each product can only appear once'),
});

async function loadSO(db, id) {
  const { rows } = await db.query(
    `SELECT so.*, w.name AS warehouse_name, u.name AS created_by_name,
            (SELECT COALESCE(SUM(quantity*unit_price),0) FROM sales_order_items i WHERE i.so_id = so.id) AS total
     FROM sales_orders so JOIN warehouses w ON w.id = so.warehouse_id LEFT JOIN users u ON u.id = so.created_by
     WHERE so.id = $1`, [id]);
  if (!rows[0]) return null;
  const items = await db.query(
    `SELECT i.*, p.name AS product_name, p.sku, p.unit,
            COALESCE((SELECT quantity FROM stock_levels sl WHERE sl.product_id = i.product_id AND sl.warehouse_id = $2),0) AS available
     FROM sales_order_items i JOIN products p ON p.id = i.product_id WHERE i.so_id = $1 ORDER BY i.id`, [id, rows[0].warehouse_id]);
  return { ...rows[0], items: items.rows };
}

router.get('/', wrap(async (req, res) => {
  const q = z.object({
    status: z.enum(['pending', 'fulfilled', 'cancelled']).optional(),
    q: z.string().trim().optional(),
  }).parse(req.query);
  const params = [];
  const where = [];
  if (q.status) { params.push(q.status); where.push(`so.status = $${params.length}`); }
  if (q.q) { params.push(`%${q.q}%`); where.push(`(so.so_number ILIKE $${params.length} OR so.customer_name ILIKE $${params.length})`); }
  const { rows } = await query(
    `SELECT so.*, w.name AS warehouse_name,
            (SELECT COALESCE(SUM(quantity*unit_price),0) FROM sales_order_items i WHERE i.so_id = so.id) AS total,
            (SELECT COALESCE(SUM(quantity),0)::int FROM sales_order_items i WHERE i.so_id = so.id) AS units
     FROM sales_orders so JOIN warehouses w ON w.id = so.warehouse_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY so.created_at DESC LIMIT 200`, params);
  res.json(rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const so = await loadSO({ query }, req.params.id);
  if (!so) throw notFound('Sales order not found');
  res.json(so);
}));

router.post('/', requireRole(...WRITE), wrap(async (req, res) => {
  const b = soSchema.parse(req.body);
  const so = await tx(async (client) => {
    // price defaults to the current list price; also validates products are active
    const ids = b.items.map((i) => i.product_id);
    const { rows: prods } = await client.query('SELECT id, sell_price, active, name FROM products WHERE id = ANY($1)', [ids]);
    const byId = new Map(prods.map((p) => [p.id, p]));
    for (const it of b.items) {
      const p = byId.get(it.product_id);
      if (!p) throw new HttpError(400, `Product ${it.product_id} not found`);
      if (!p.active) throw new HttpError(400, `${p.name} is archived and cannot be sold`);
    }
    const { rows } = await client.query(
      `INSERT INTO sales_orders (so_number, customer_name, customer_email, warehouse_id, notes, created_by)
       VALUES ('SO-' || to_char(now(),'YYYY') || '-' || nextval('so_seq'), $1,$2,$3,$4,$5) RETURNING id, so_number`,
      [b.customer_name, b.customer_email, b.warehouse_id, b.notes ?? null, req.user.id]);
    for (const it of b.items) {
      await client.query('INSERT INTO sales_order_items (so_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)',
        [rows[0].id, it.product_id, it.quantity, it.unit_price ?? byId.get(it.product_id).sell_price]);
    }
    await audit(req, 'create', 'sales_order', rows[0].id, { so_number: rows[0].so_number }, client);
    return loadSO(client, rows[0].id);
  });
  res.status(201).json(so);
}));

/** Fulfil: deduct stock atomically; if any line is short the whole order rolls back. */
router.post('/:id/fulfill', requireRole(...WRITE), wrap(async (req, res) => {
  const so = await tx(async (client) => {
    const { rows } = await client.query('SELECT * FROM sales_orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const order = rows[0];
    if (!order) throw notFound('Sales order not found');
    if (order.status !== 'pending') throw new HttpError(409, `Order is already ${order.status}`);
    const { rows: items } = await client.query(
      `SELECT i.*, p.cost_price FROM sales_order_items i JOIN products p ON p.id = i.product_id WHERE i.so_id=$1 ORDER BY i.product_id`, [order.id]);
    for (const it of items) {
      await applyMovement(client, {
        productId: it.product_id, warehouseId: order.warehouse_id, delta: -it.quantity, type: 'SALE',
        refType: 'sales_order', refId: order.id, note: `Shipped on ${order.so_number}`, userId: req.user.id,
      });
      await client.query('UPDATE sales_order_items SET unit_cost = $2 WHERE id = $1', [it.id, it.cost_price]);
    }
    await client.query(`UPDATE sales_orders SET status='fulfilled', fulfilled_at=now() WHERE id=$1`, [order.id]);
    await audit(req, 'fulfill', 'sales_order', order.id, null, client);
    return loadSO(client, order.id);
  });
  res.json(so);
}));

router.post('/:id/cancel', requireRole(...WRITE), wrap(async (req, res) => {
  const { rows } = await query(`UPDATE sales_orders SET status='cancelled' WHERE id=$1 AND status='pending' RETURNING id`, [req.params.id]);
  if (!rows[0]) {
    const cur = await query('SELECT status FROM sales_orders WHERE id=$1', [req.params.id]);
    if (!cur.rows[0]) throw notFound('Sales order not found');
    throw new HttpError(409, `Only pending orders can be cancelled (this one is ${cur.rows[0].status})`);
  }
  await audit(req, 'cancel', 'sales_order', req.params.id);
  res.json(await loadSO({ query }, req.params.id));
}));

export default router;
