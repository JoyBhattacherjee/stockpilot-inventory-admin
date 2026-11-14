import { Router } from 'express';
import { query } from '../db/pool.js';
import { wrap } from '../utils/errors.js';

const router = Router();

router.get('/', wrap(async (_req, res) => {
  const [kpi, daily, sales, byCategory, top, low, recent] = await Promise.all([
    query(`
      WITH st AS (SELECT product_id, SUM(quantity)::int AS qty FROM stock_levels GROUP BY product_id)
      SELECT
        (SELECT count(*)::int FROM products WHERE active) AS products,
        COALESCE(SUM(st.qty),0)::int AS units,
        COALESCE(SUM(st.qty * p.cost_price),0) AS stock_cost_value,
        COALESCE(SUM(st.qty * p.sell_price),0) AS stock_retail_value,
        count(*) FILTER (WHERE p.active AND COALESCE(st.qty,0) = 0)::int AS out_of_stock,
        count(*) FILTER (WHERE p.active AND COALESCE(st.qty,0) > 0 AND COALESCE(st.qty,0) <= p.reorder_level)::int AS low_stock,
        (SELECT count(*)::int FROM purchase_orders WHERE status IN ('ordered','partial')) AS open_purchase_orders,
        (SELECT count(*)::int FROM sales_orders WHERE status = 'pending') AS pending_sales_orders,
        (SELECT COALESCE(SUM(i.quantity*i.unit_price),0) FROM sales_orders o JOIN sales_order_items i ON i.so_id=o.id
           WHERE o.status='fulfilled' AND o.fulfilled_at >= now() - interval '30 days') AS revenue_30d,
        (SELECT COALESCE(SUM(i.quantity*(i.unit_price - COALESCE(i.unit_cost,0))),0) FROM sales_orders o JOIN sales_order_items i ON i.so_id=o.id
           WHERE o.status='fulfilled' AND o.fulfilled_at >= now() - interval '30 days') AS profit_30d
      FROM products p LEFT JOIN st ON st.product_id = p.id WHERE p.active`),
    query(`
      SELECT to_char(d::date,'YYYY-MM-DD') AS day,
             COALESCE(SUM(m.quantity) FILTER (WHERE m.quantity > 0 AND m.type IN ('PURCHASE','ADJUSTMENT')),0)::int AS stock_in,
             COALESCE(-SUM(m.quantity) FILTER (WHERE m.type = 'SALE'),0)::int AS stock_out
      FROM generate_series(current_date - 13, current_date, '1 day') d
      LEFT JOIN stock_movements m ON m.created_at::date = d::date
      GROUP BY d ORDER BY d`),
    query(`
      SELECT to_char(d::date,'YYYY-MM-DD') AS day,
             COALESCE(SUM(i.quantity*i.unit_price),0) AS revenue
      FROM generate_series(current_date - 13, current_date, '1 day') d
      LEFT JOIN sales_orders o ON o.status='fulfilled' AND o.fulfilled_at::date = d::date
      LEFT JOIN sales_order_items i ON i.so_id = o.id
      GROUP BY d ORDER BY d`),
    query(`
      SELECT COALESCE(c.name,'Uncategorised') AS name, COALESCE(SUM(sl.quantity * p.cost_price),0) AS value
      FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN stock_levels sl ON sl.product_id = p.id
      WHERE p.active GROUP BY c.name HAVING COALESCE(SUM(sl.quantity * p.cost_price),0) > 0 ORDER BY value DESC`),
    query(`
      SELECT p.id, p.name, p.sku, SUM(i.quantity)::int AS units, SUM(i.quantity*i.unit_price) AS revenue
      FROM sales_order_items i JOIN sales_orders o ON o.id = i.so_id AND o.status='fulfilled' AND o.fulfilled_at >= now() - interval '30 days'
      JOIN products p ON p.id = i.product_id GROUP BY p.id ORDER BY units DESC LIMIT 5`),
    query(`
      SELECT p.id, p.name, p.sku, p.reorder_level, COALESCE(SUM(sl.quantity),0)::int AS stock, s.name AS supplier_name
      FROM products p LEFT JOIN stock_levels sl ON sl.product_id = p.id LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.active GROUP BY p.id, s.name HAVING COALESCE(SUM(sl.quantity),0) <= p.reorder_level
      ORDER BY (COALESCE(SUM(sl.quantity),0)::float / NULLIF(p.reorder_level,0)) NULLS LAST, p.name LIMIT 8`),
    query(`
      SELECT m.id, m.type, m.quantity, m.created_at, p.name AS product_name, w.code AS warehouse_code, u.name AS user_name
      FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN warehouses w ON w.id = m.warehouse_id
      LEFT JOIN users u ON u.id = m.user_id ORDER BY m.created_at DESC, m.id DESC LIMIT 8`),
  ]);
  res.json({
    kpis: kpi.rows[0], movementsByDay: daily.rows, revenueByDay: sales.rows,
    valueByCategory: byCategory.rows, topProducts: top.rows, lowStock: low.rows, recentMovements: recent.rows,
  });
}));

export default router;
