import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, wrap } from '../utils/errors.js';
import { toCsv } from '../utils/csv.js';

const router = Router();
router.use(requireRole('admin', 'manager', 'viewer'));

/** Inventory valuation by category and by warehouse. */
router.get('/valuation', wrap(async (_req, res) => {
  const [cat, wh, totals] = await Promise.all([
    query(`SELECT COALESCE(c.name,'Uncategorised') AS name, COALESCE(SUM(sl.quantity),0)::int AS units,
                  COALESCE(SUM(sl.quantity*p.cost_price),0) AS cost_value, COALESCE(SUM(sl.quantity*p.sell_price),0) AS retail_value
           FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN stock_levels sl ON sl.product_id=p.id
           WHERE p.active GROUP BY c.name ORDER BY cost_value DESC`),
    query(`SELECT w.name, w.code, COALESCE(SUM(sl.quantity),0)::int AS units,
                  COALESCE(SUM(sl.quantity*p.cost_price),0) AS cost_value, COALESCE(SUM(sl.quantity*p.sell_price),0) AS retail_value
           FROM warehouses w LEFT JOIN stock_levels sl ON sl.warehouse_id=w.id LEFT JOIN products p ON p.id=sl.product_id
           GROUP BY w.id ORDER BY cost_value DESC`),
    query(`SELECT COALESCE(SUM(sl.quantity*p.cost_price),0) AS cost_value, COALESCE(SUM(sl.quantity*p.sell_price),0) AS retail_value,
                  COALESCE(SUM(sl.quantity),0)::int AS units
           FROM stock_levels sl JOIN products p ON p.id=sl.product_id WHERE p.active`),
  ]);
  res.json({ totals: totals.rows[0], byCategory: cat.rows, byWarehouse: wh.rows });
}));

/**
 * Reorder suggestions grouped by supplier. Target stock = max(reorder_qty, 2 x reorder_level);
 * suggested quantity tops stock back up to that target.
 */
router.get('/reorder', wrap(async (_req, res) => {
  const { rows } = await query(`
    SELECT p.id AS product_id, p.sku, p.name, p.unit, p.cost_price, p.reorder_level, p.reorder_qty,
           p.supplier_id, s.name AS supplier_name, s.lead_time_days,
           COALESCE(SUM(sl.quantity),0)::int AS stock,
           GREATEST(p.reorder_qty, p.reorder_level * 2) - COALESCE(SUM(sl.quantity),0)::int AS suggested_qty,
           COALESCE((SELECT SUM(i.qty_ordered - i.qty_received)::int FROM purchase_order_items i
                     JOIN purchase_orders po ON po.id = i.po_id AND po.status IN ('ordered','partial')
                     WHERE i.product_id = p.id),0) AS on_order
    FROM products p LEFT JOIN stock_levels sl ON sl.product_id = p.id LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.active
    GROUP BY p.id, s.id
    HAVING COALESCE(SUM(sl.quantity),0) <= p.reorder_level
    ORDER BY s.name NULLS LAST, p.name`);
  // subtract what is already on order so we do not double-buy
  const items = rows
    .map((r) => ({ ...r, suggested_qty: Math.max(0, r.suggested_qty - r.on_order) }))
    .filter((r) => r.suggested_qty > 0);
  const groups = new Map();
  for (const it of items) {
    const key = it.supplier_id ?? 0;
    if (!groups.has(key)) groups.set(key, { supplier_id: it.supplier_id, supplier_name: it.supplier_name ?? 'No supplier assigned', lead_time_days: it.lead_time_days, items: [], estimated_cost: 0 });
    const g = groups.get(key);
    g.items.push(it);
    g.estimated_cost += it.suggested_qty * it.cost_price;
  }
  res.json([...groups.values()]);
}));

const EXPORTS = {
  products: {
    sql: `SELECT p.sku, p.name, c.name AS category, s.name AS supplier, p.unit, p.cost_price, p.sell_price, p.reorder_level,
                 COALESCE((SELECT SUM(quantity) FROM stock_levels WHERE product_id=p.id),0) AS stock, p.active
          FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.name`,
    cols: ['sku', 'name', 'category', 'supplier', 'unit', 'cost_price', 'sell_price', 'reorder_level', 'stock', 'active'],
  },
  stock: {
    sql: `SELECT p.sku, p.name, w.name AS warehouse, sl.quantity, p.cost_price, (sl.quantity*p.cost_price) AS value
          FROM stock_levels sl JOIN products p ON p.id=sl.product_id JOIN warehouses w ON w.id=sl.warehouse_id
          WHERE sl.quantity > 0 ORDER BY p.name, w.name`,
    cols: ['sku', 'name', 'warehouse', 'quantity', 'cost_price', 'value'],
  },
  movements: {
    sql: `SELECT m.created_at, p.sku, p.name, w.name AS warehouse, m.type, m.quantity, m.balance_after, m.note, u.name AS user
          FROM stock_movements m JOIN products p ON p.id=m.product_id JOIN warehouses w ON w.id=m.warehouse_id
          LEFT JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC LIMIT 10000`,
    cols: ['created_at', 'sku', 'name', 'warehouse', 'type', 'quantity', 'balance_after', 'note', 'user'],
  },
};

router.get('/export/:type.csv', requireRole('admin', 'manager'), wrap(async (req, res) => {
  const def = EXPORTS[req.params.type];
  if (!def) throw notFound('Unknown export');
  const { rows } = await query(def.sql);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="stockpilot-${req.params.type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(def.cols.map((c) => ({ key: c, label: c })), rows));
}));

export default router;
