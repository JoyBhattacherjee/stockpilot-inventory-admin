import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { conflict, notFound, wrap } from '../utils/errors.js';
import { audit } from '../utils/audit.js';

/** Builds a simple CRUD router for lookup tables (categories, suppliers, warehouses). */
function crud({ table, entity, schema, columns, orderBy = 'name', writeRoles, deleteRoles, listExtra = '' }) {
  const router = Router();

  router.get('/', wrap(async (_req, res) => {
    const { rows } = await query(`SELECT t.*${listExtra ? ',' + listExtra.select : ''} FROM ${table} t ${listExtra ? listExtra.join : ''} ORDER BY t.${orderBy}`);
    res.json(rows);
  }));

  router.post('/', requireRole(...writeRoles), wrap(async (req, res) => {
    const b = schema.parse(req.body);
    const cols = columns.filter((c) => b[c] !== undefined);
    const { rows } = await query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      cols.map((c) => b[c])
    );
    await audit(req, 'create', entity, rows[0].id, b);
    res.status(201).json(rows[0]);
  }));

  router.put('/:id', requireRole(...writeRoles), wrap(async (req, res) => {
    const b = schema.partial().parse(req.body);
    const cols = columns.filter((c) => b[c] !== undefined);
    if (!cols.length) return res.json((await query(`SELECT * FROM ${table} WHERE id=$1`, [req.params.id])).rows[0]);
    const { rows } = await query(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(',')} WHERE id = $1 RETURNING *`,
      [req.params.id, ...cols.map((c) => b[c])]
    );
    if (!rows[0]) throw notFound();
    await audit(req, 'update', entity, rows[0].id, b);
    res.json(rows[0]);
  }));

  router.delete('/:id', requireRole(...deleteRoles), wrap(async (req, res) => {
    try {
      const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rowCount) throw notFound();
    } catch (err) {
      if (err.code === '23503') throw conflict(`This ${entity} is in use and cannot be deleted. Deactivate it instead.`);
      throw err;
    }
    await audit(req, 'delete', entity, req.params.id);
    res.json({ ok: true });
  }));

  return router;
}

const nullableText = z.string().trim().max(500).nullish().transform((v) => v || null);

export const categories = crud({
  table: 'categories', entity: 'category',
  schema: z.object({ name: z.string().trim().min(1).max(80), description: nullableText }),
  columns: ['name', 'description'],
  writeRoles: ['admin', 'manager'], deleteRoles: ['admin', 'manager'],
  listExtra: {
    select: '(SELECT count(*)::int FROM products p WHERE p.category_id = t.id) AS product_count',
    join: '',
  },
});

export const suppliers = crud({
  table: 'suppliers', entity: 'supplier',
  schema: z.object({
    name: z.string().trim().min(1).max(120),
    contact_person: nullableText,
    email: z.string().email().nullish().or(z.literal('')).transform((v) => v || null),
    phone: nullableText,
    address: nullableText,
    lead_time_days: z.coerce.number().int().min(0).max(365).default(7),
    active: z.boolean().default(true),
  }),
  columns: ['name', 'contact_person', 'email', 'phone', 'address', 'lead_time_days', 'active'],
  writeRoles: ['admin', 'manager'], deleteRoles: ['admin'],
  listExtra: {
    select: '(SELECT count(*)::int FROM products p WHERE p.supplier_id = t.id) AS product_count',
    join: '',
  },
});

export const warehouses = crud({
  table: 'warehouses', entity: 'warehouse',
  schema: z.object({
    name: z.string().trim().min(1).max(80),
    code: z.string().trim().toUpperCase().min(2).max(10),
    location: nullableText,
    active: z.boolean().default(true),
  }),
  columns: ['name', 'code', 'location', 'active'],
  writeRoles: ['admin'], deleteRoles: ['admin'],
  listExtra: {
    select: '(SELECT COALESCE(SUM(quantity),0)::int FROM stock_levels s WHERE s.warehouse_id = t.id) AS total_units',
    join: '',
  },
});
