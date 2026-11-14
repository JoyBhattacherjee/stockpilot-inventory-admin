import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { applyMovement } from '../utils/stock.js';

const router = Router();

router.get('/levels', wrap(async (req, res) => {
  const q = z.object({
    warehouse_id: z.coerce.number().int().optional(),
    q: z.string().trim().optional(),
  }).parse(req.query);
  const params = [];
  const where = ['p.active'];
  if (q.warehouse_id) { params.push(q.warehouse_id); where.push(`sl.warehouse_id = $${params.length}`); }
  if (q.q) { params.push(`%${q.q}%`); where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`); }
  const { rows } = await query(
    `SELECT p.id AS product_id, p.sku, p.name, p.unit, p.reorder_level, w.id AS warehouse_id, w.name AS warehouse_name,
            sl.quantity, (sl.quantity * p.cost_price) AS value
     FROM stock_levels sl JOIN products p ON p.id = sl.product_id JOIN warehouses w ON w.id = sl.warehouse_id
     WHERE ${where.join(' AND ')} AND sl.quantity > 0
     ORDER BY p.name, w.name LIMIT 1000`, params);
  res.json(rows);
}));

router.get('/movements', wrap(async (req, res) => {
  const q = z.object({
    product_id: z.coerce.number().int().optional(),
    warehouse_id: z.coerce.number().int().optional(),
    type: z.enum(['PURCHASE', 'SALE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT']).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(25),
  }).parse(req.query);
  const params = [];
  const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.product_id) add('m.product_id = ?', q.product_id);
  if (q.warehouse_id) add('m.warehouse_id = ?', q.warehouse_id);
  if (q.type) add('m.type = ?', q.type);
  if (q.from) add('m.created_at >= ?::date', q.from);
  if (q.to) add(`m.created_at < (?::date + 1)`, q.to);
  params.push(q.limit, (q.page - 1) * q.limit);
  const { rows } = await query(
    `SELECT m.*, p.name AS product_name, p.sku, w.name AS warehouse_name, u.name AS user_name,
            COUNT(*) OVER()::int AS total_count
     FROM stock_movements m
     JOIN products p ON p.id = m.product_id JOIN warehouses w ON w.id = m.warehouse_id
     LEFT JOIN users u ON u.id = m.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = rows[0]?.total_count ?? 0;
  res.json({
    data: rows.map(({ total_count, ...r }) => r),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  });
}));

/** Manual stock correction (cycle count, damage, found stock). Managers+ only. */
router.post('/adjust', requireRole('admin', 'manager'), wrap(async (req, res) => {
  const b = z.object({
    product_id: z.coerce.number().int().positive(),
    warehouse_id: z.coerce.number().int().positive(),
    mode: z.enum(['set', 'add', 'remove']),
    quantity: z.coerce.number().int().min(0),
    reason: z.string().trim().min(3, 'A reason is required for adjustments').max(300),
  }).parse(req.body);

  const result = await tx(async (client) => {
    // lock the row (if any) so "set to N" computes the delta against a stable value
    const { rows } = await client.query(
      'SELECT quantity FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE', [b.product_id, b.warehouse_id]);
    const current = rows[0]?.quantity ?? 0;
    const delta = b.mode === 'set' ? b.quantity - current : b.mode === 'add' ? b.quantity : -b.quantity;
    if (delta === 0) throw new HttpError(400, 'No change: the quantity is already that value');
    const balance = await applyMovement(client, {
      productId: b.product_id, warehouseId: b.warehouse_id, delta, type: 'ADJUSTMENT', note: b.reason, userId: req.user.id,
    });
    await audit(req, 'adjust', 'stock', b.product_id, { warehouse_id: b.warehouse_id, delta, reason: b.reason }, client);
    return { previous: current, delta, balance };
  });
  res.json(result);
}));

router.post('/transfer', requireRole('admin', 'manager', 'staff'), wrap(async (req, res) => {
  const b = z.object({
    product_id: z.coerce.number().int().positive(),
    from_warehouse_id: z.coerce.number().int().positive(),
    to_warehouse_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive(),
    note: z.string().trim().max(300).optional(),
  }).refine((v) => v.from_warehouse_id !== v.to_warehouse_id, { message: 'Source and destination must differ', path: ['to_warehouse_id'] })
    .parse(req.body);

  await tx(async (client) => {
    const note = b.note || 'Warehouse transfer';
    await applyMovement(client, { productId: b.product_id, warehouseId: b.from_warehouse_id, delta: -b.quantity, type: 'TRANSFER_OUT', note, userId: req.user.id });
    await applyMovement(client, { productId: b.product_id, warehouseId: b.to_warehouse_id, delta: b.quantity, type: 'TRANSFER_IN', note, userId: req.user.id });
    await audit(req, 'transfer', 'stock', b.product_id, b, client);
  });
  res.json({ ok: true });
}));

export default router;
