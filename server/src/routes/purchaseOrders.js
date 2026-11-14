import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, notFound, wrap } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { applyMovement } from '../utils/stock.js';

const router = Router();
const MANAGE = ['admin', 'manager'];

const itemSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
  unit_cost: z.coerce.number().min(0),
});
const poSchema = z.object({
  supplier_id: z.coerce.number().int().positive(),
  warehouse_id: z.coerce.number().int().positive(),
  expected_date: z.string().date().nullish(),
  notes: z.string().trim().max(1000).nullish(),
  items: z.array(itemSchema).min(1, 'Add at least one item')
    .refine((a) => new Set(a.map((i) => i.product_id)).size === a.length, 'Each product can only appear once'),
});

async function loadPO(db, id) {
  const { rows } = await db.query(
    `SELECT po.*, s.name AS supplier_name, w.name AS warehouse_name, u.name AS created_by_name,
            (SELECT COALESCE(SUM(qty_ordered*unit_cost),0) FROM purchase_order_items i WHERE i.po_id = po.id) AS total
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id JOIN warehouses w ON w.id = po.warehouse_id
     LEFT JOIN users u ON u.id = po.created_by WHERE po.id = $1`, [id]);
  if (!rows[0]) return null;
  const items = await db.query(
    `SELECT i.*, p.name AS product_name, p.sku, p.unit FROM purchase_order_items i
     JOIN products p ON p.id = i.product_id WHERE i.po_id = $1 ORDER BY i.id`, [id]);
  return { ...rows[0], items: items.rows };
}

router.get('/', wrap(async (req, res) => {
  const q = z.object({
    status: z.enum(['draft', 'ordered', 'partial', 'received', 'cancelled']).optional(),
    supplier_id: z.coerce.number().int().optional(),
    q: z.string().trim().optional(),
  }).parse(req.query);
  const params = [];
  const where = [];
  if (q.status) { params.push(q.status); where.push(`po.status = $${params.length}`); }
  if (q.supplier_id) { params.push(q.supplier_id); where.push(`po.supplier_id = $${params.length}`); }
  if (q.q) { params.push(`%${q.q}%`); where.push(`po.po_number ILIKE $${params.length}`); }
  const { rows } = await query(
    `SELECT po.*, s.name AS supplier_name, w.name AS warehouse_name,
            (SELECT COALESCE(SUM(qty_ordered*unit_cost),0) FROM purchase_order_items i WHERE i.po_id = po.id) AS total,
            (SELECT COALESCE(SUM(qty_ordered),0)::int FROM purchase_order_items i WHERE i.po_id = po.id) AS units_ordered,
            (SELECT COALESCE(SUM(qty_received),0)::int FROM purchase_order_items i WHERE i.po_id = po.id) AS units_received
     FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id JOIN warehouses w ON w.id = po.warehouse_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY po.created_at DESC LIMIT 200`, params);
  res.json(rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const po = await loadPO({ query }, req.params.id);
  if (!po) throw notFound('Purchase order not found');
  res.json(po);
}));

async function insertItems(client, poId, items) {
  for (const it of items) {
    await client.query(
      'INSERT INTO purchase_order_items (po_id, product_id, qty_ordered, unit_cost) VALUES ($1,$2,$3,$4)',
      [poId, it.product_id, it.quantity, it.unit_cost]);
  }
}

router.post('/', requireRole(...MANAGE), wrap(async (req, res) => {
  const b = poSchema.parse(req.body);
  const po = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, expected_date, notes, created_by)
       VALUES ('PO-' || to_char(now(),'YYYY') || '-' || nextval('po_seq'), $1,$2,$3,$4,$5) RETURNING id, po_number`,
      [b.supplier_id, b.warehouse_id, b.expected_date ?? null, b.notes ?? null, req.user.id]);
    await insertItems(client, rows[0].id, b.items);
    await audit(req, 'create', 'purchase_order', rows[0].id, { po_number: rows[0].po_number, items: b.items.length }, client);
    return loadPO(client, rows[0].id);
  });
  res.status(201).json(po);
}));

router.put('/:id', requireRole(...MANAGE), wrap(async (req, res) => {
  const b = poSchema.parse(req.body);
  const po = await tx(async (client) => {
    const { rows } = await client.query('SELECT status FROM purchase_orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!rows[0]) throw notFound('Purchase order not found');
    if (rows[0].status !== 'draft') throw new HttpError(409, 'Only draft purchase orders can be edited');
    await client.query(
      'UPDATE purchase_orders SET supplier_id=$2, warehouse_id=$3, expected_date=$4, notes=$5 WHERE id=$1',
      [req.params.id, b.supplier_id, b.warehouse_id, b.expected_date ?? null, b.notes ?? null]);
    await client.query('DELETE FROM purchase_order_items WHERE po_id=$1', [req.params.id]);
    await insertItems(client, req.params.id, b.items);
    await audit(req, 'update', 'purchase_order', req.params.id, null, client);
    return loadPO(client, req.params.id);
  });
  res.json(po);
}));

async function transition(req, res, { from, to, action, extra = '' }) {
  const { rows } = await query(
    `UPDATE purchase_orders SET status = $2 ${extra} WHERE id = $1 AND status = ANY($3) RETURNING id`,
    [req.params.id, to, from]);
  if (!rows[0]) {
    const cur = await query('SELECT status FROM purchase_orders WHERE id=$1', [req.params.id]);
    if (!cur.rows[0]) throw notFound('Purchase order not found');
    throw new HttpError(409, `Cannot ${action} an order that is "${cur.rows[0].status}"`);
  }
  await audit(req, action, 'purchase_order', req.params.id);
  res.json(await loadPO({ query }, req.params.id));
}

router.post('/:id/place', requireRole(...MANAGE), wrap((req, res) =>
  transition(req, res, { from: ['draft'], to: 'ordered', action: 'place', extra: ', ordered_at = now()' })));

router.post('/:id/cancel', requireRole(...MANAGE), wrap(async (req, res) => {
  const { rows } = await query('SELECT COALESCE(SUM(qty_received),0)::int AS r FROM purchase_order_items WHERE po_id=$1', [req.params.id]);
  if (rows[0].r > 0) throw new HttpError(409, 'Goods were already received against this order, it cannot be cancelled');
  return transition(req, res, { from: ['draft', 'ordered'], to: 'cancelled', action: 'cancel' });
}));

/**
 * Receive goods (full or partial). Increases stock, writes ledger rows and
 * updates product cost with a weighted-average of existing stock and the new delivery.
 */
router.post('/:id/receive', requireRole('admin', 'manager', 'staff'), wrap(async (req, res) => {
  const b = z.object({
    items: z.array(z.object({ item_id: z.coerce.number().int(), quantity: z.coerce.number().int().min(0) })).min(1),
  }).parse(req.body);
  const toReceive = b.items.filter((i) => i.quantity > 0);
  if (!toReceive.length) throw new HttpError(400, 'Enter a quantity to receive for at least one item');

  const po = await tx(async (client) => {
    const { rows } = await client.query('SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const order = rows[0];
    if (!order) throw notFound('Purchase order not found');
    if (!['ordered', 'partial'].includes(order.status)) throw new HttpError(409, `Cannot receive goods on an order that is "${order.status}"`);

    for (const line of toReceive) {
      const { rows: r } = await client.query('SELECT * FROM purchase_order_items WHERE id=$1 AND po_id=$2 FOR UPDATE', [line.item_id, order.id]);
      const item = r[0];
      if (!item) throw new HttpError(400, `Item ${line.item_id} does not belong to this order`);
      const outstanding = item.qty_ordered - item.qty_received;
      if (line.quantity > outstanding) throw new HttpError(400, `Cannot receive ${line.quantity}: only ${outstanding} outstanding for this line`);

      // weighted-average cost across all warehouses
      const { rows: s } = await client.query('SELECT COALESCE(SUM(quantity),0)::int AS qty FROM stock_levels WHERE product_id=$1', [item.product_id]);
      const { rows: p } = await client.query('SELECT cost_price FROM products WHERE id=$1 FOR UPDATE', [item.product_id]);
      const before = s[0].qty;
      const newCost = before + line.quantity > 0
        ? (before * p[0].cost_price + line.quantity * item.unit_cost) / (before + line.quantity)
        : item.unit_cost;
      await client.query('UPDATE products SET cost_price = round($2::numeric, 2), updated_at = now() WHERE id = $1', [item.product_id, newCost]);

      await applyMovement(client, {
        productId: item.product_id, warehouseId: order.warehouse_id, delta: line.quantity, type: 'PURCHASE',
        refType: 'purchase_order', refId: order.id, note: `Received on ${order.po_number}`, userId: req.user.id,
      });
      await client.query('UPDATE purchase_order_items SET qty_received = qty_received + $2 WHERE id = $1', [item.id, line.quantity]);
    }

    const { rows: totals } = await client.query(
      'SELECT bool_and(qty_received = qty_ordered) AS done FROM purchase_order_items WHERE po_id=$1', [order.id]);
    await client.query(
      `UPDATE purchase_orders SET status = $2, received_at = CASE WHEN $2 = 'received' THEN now() ELSE received_at END WHERE id = $1`,
      [order.id, totals[0].done ? 'received' : 'partial']);
    await audit(req, 'receive', 'purchase_order', order.id, { lines: toReceive.length }, client);
    return loadPO(client, order.id);
  });
  res.json(po);
}));

router.delete('/:id', requireRole('admin', 'manager'), wrap(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM purchase_orders WHERE id=$1 AND status='draft'`, [req.params.id]);
  if (!rowCount) throw new HttpError(409, 'Only draft purchase orders can be deleted');
  await audit(req, 'delete', 'purchase_order', req.params.id);
  res.json({ ok: true });
}));

export default router;
