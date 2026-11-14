import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, wrap } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { applyMovement } from '../utils/stock.js';

const router = Router();

const productSchema = z.object({
  sku: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9._-]+$/, 'SKU may only contain letters, numbers, dot, dash, underscore'),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullish().transform((v) => v || null),
  category_id: z.coerce.number().int().positive().nullish(),
  supplier_id: z.coerce.number().int().positive().nullish(),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  cost_price: z.coerce.number().min(0).default(0),
  sell_price: z.coerce.number().min(0).default(0),
  reorder_level: z.coerce.number().int().min(0).default(0),
  reorder_qty: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
  // optional opening stock on creation
  initial_stock: z.coerce.number().int().min(0).optional(),
  warehouse_id: z.coerce.number().int().positive().optional(),
});

const SORTS = {
  name: 'p.name', sku: 'p.sku', stock: 'stock', price: 'p.sell_price', cost: 'p.cost_price', created: 'p.created_at',
};

const stockSubquery = `(SELECT product_id, SUM(quantity)::int AS qty FROM stock_levels GROUP BY product_id)`;

router.get('/', wrap(async (req, res) => {
  const q = z.object({
    q: z.string().trim().optional(),
    category_id: z.coerce.number().int().optional(),
    supplier_id: z.coerce.number().int().optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    stock: z.enum(['all', 'low', 'out', 'in']).default('all'),
    sort: z.enum(Object.keys(SORTS)).default('name'),
    dir: z.enum(['asc', 'desc']).default('asc'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(20),
  }).parse(req.query);

  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (q.q) add('(p.name ILIKE ? OR p.sku ILIKE ?)', `%${q.q}%`);
  if (q.category_id) add('p.category_id = ?', q.category_id);
  if (q.supplier_id) add('p.supplier_id = ?', q.supplier_id);
  if (q.status !== 'all') where.push(`p.active = ${q.status === 'active'}`);
  if (q.stock === 'low') where.push('COALESCE(st.qty,0) <= p.reorder_level AND COALESCE(st.qty,0) > 0');
  if (q.stock === 'out') where.push('COALESCE(st.qty,0) = 0');
  if (q.stock === 'in') where.push('COALESCE(st.qty,0) > p.reorder_level');

  params.push(q.limit, (q.page - 1) * q.limit);
  const { rows } = await query(
    `SELECT p.*, c.name AS category_name, s.name AS supplier_name,
            COALESCE(st.qty,0) AS stock,
            CASE WHEN COALESCE(st.qty,0) = 0 THEN 'out'
                 WHEN COALESCE(st.qty,0) <= p.reorder_level THEN 'low' ELSE 'ok' END AS stock_status,
            COUNT(*) OVER()::int AS total_count
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN ${stockSubquery} st ON st.product_id = p.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${SORTS[q.sort]} ${q.dir === 'desc' ? 'DESC' : 'ASC'}, p.id
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = rows[0]?.total_count ?? 0;
  res.json({
    data: rows.map(({ total_count, ...r }) => r),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  });
}));

router.get('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query(
    `SELECT p.*, c.name AS category_name, s.name AS supplier_name, COALESCE(st.qty,0) AS stock
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN ${stockSubquery} st ON st.product_id = p.id
     WHERE p.id = $1`, [id]);
  if (!rows[0]) throw notFound('Product not found');
  const [levels, movements] = await Promise.all([
    query(`SELECT w.id AS warehouse_id, w.name AS warehouse_name, w.code, COALESCE(sl.quantity,0) AS quantity
           FROM warehouses w LEFT JOIN stock_levels sl ON sl.warehouse_id = w.id AND sl.product_id = $1
           WHERE w.active ORDER BY w.name`, [id]),
    query(`SELECT m.*, w.name AS warehouse_name, u.name AS user_name
           FROM stock_movements m JOIN warehouses w ON w.id = m.warehouse_id LEFT JOIN users u ON u.id = m.user_id
           WHERE m.product_id = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT 25`, [id]),
  ]);
  res.json({ ...rows[0], levels: levels.rows, movements: movements.rows });
}));

router.post('/', requireRole('admin', 'manager'), wrap(async (req, res) => {
  const b = productSchema.parse(req.body);
  const product = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO products (sku,name,description,category_id,supplier_id,unit,cost_price,sell_price,reorder_level,reorder_qty,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.sku, b.name, b.description, b.category_id ?? null, b.supplier_id ?? null, b.unit, b.cost_price, b.sell_price, b.reorder_level, b.reorder_qty, b.active]
    );
    if (b.initial_stock && b.warehouse_id) {
      await applyMovement(client, {
        productId: rows[0].id, warehouseId: b.warehouse_id, delta: b.initial_stock,
        type: 'ADJUSTMENT', note: 'Opening stock', userId: req.user.id,
      });
    }
    await audit(req, 'create', 'product', rows[0].id, { sku: b.sku, name: b.name }, client);
    return rows[0];
  });
  res.status(201).json(product);
}));

router.put('/:id', requireRole('admin', 'manager'), wrap(async (req, res) => {
  const b = productSchema.omit({ initial_stock: true, warehouse_id: true }).partial().parse(req.body);
  const fields = ['sku', 'name', 'description', 'category_id', 'supplier_id', 'unit', 'cost_price', 'sell_price', 'reorder_level', 'reorder_qty', 'active'].filter((f) => b[f] !== undefined);
  if (!fields.length) throw notFound('Nothing to update');
  const { rows } = await query(
    `UPDATE products SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
    [req.params.id, ...fields.map((f) => b[f])]
  );
  if (!rows[0]) throw notFound('Product not found');
  await audit(req, 'update', 'product', rows[0].id, b);
  res.json(rows[0]);
}));

/** Hard-delete when the product has no history; otherwise archive (soft delete) to protect ledger integrity. */
router.delete('/:id', requireRole('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query('SELECT id FROM products WHERE id=$1', [id]);
  if (!rows[0]) throw notFound('Product not found');
  try {
    await query('DELETE FROM products WHERE id = $1', [id]);
    await audit(req, 'delete', 'product', id);
    res.json({ deleted: true });
  } catch (err) {
    if (err.code !== '23503') throw err;
    await query('UPDATE products SET active = false, updated_at = now() WHERE id = $1', [id]);
    await audit(req, 'archive', 'product', id);
    res.json({ deleted: false, archived: true, message: 'Product has transaction history, so it was archived instead of deleted.' });
  }
}));

export default router;
