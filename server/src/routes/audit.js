import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { wrap } from '../utils/errors.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/', wrap(async (req, res) => {
  const q = z.object({
    entity: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  }).parse(req.query);
  const params = [];
  let where = '';
  if (q.entity) { params.push(q.entity); where = `WHERE entity = $1`; }
  params.push(q.limit, (q.page - 1) * q.limit);
  const { rows } = await query(
    `SELECT *, COUNT(*) OVER()::int AS total_count FROM audit_log ${where}
     ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = rows[0]?.total_count ?? 0;
  res.json({
    data: rows.map(({ total_count, ...r }) => r),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  });
}));

export default router;
