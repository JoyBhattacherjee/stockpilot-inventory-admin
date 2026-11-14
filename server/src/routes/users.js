import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { ROLES, requireRole } from '../middleware/auth.js';
import { HttpError, notFound, wrap } from '../utils/errors.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(requireRole('admin'));

const COLS = 'id, name, email, role, active, last_login_at, created_at';
const roleEnum = z.enum(ROLES);

router.get('/', wrap(async (_req, res) => {
  const { rows } = await query(`SELECT ${COLS} FROM users ORDER BY created_at`);
  res.json(rows);
}));

router.post('/', wrap(async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(2),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: roleEnum,
  }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING ${COLS}`,
    [b.name, b.email.toLowerCase(), await bcrypt.hash(b.password, 10), b.role]
  );
  await audit(req, 'create', 'user', rows[0].id, { email: b.email, role: b.role });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const b = z.object({
    name: z.string().trim().min(2).optional(),
    role: roleEnum.optional(),
    active: z.boolean().optional(),
    password: z.string().min(8).optional(),
  }).parse(req.body);

  if (id === req.user.id && (b.role && b.role !== 'admin' || b.active === false)) {
    throw new HttpError(400, 'You cannot demote or deactivate your own account');
  }
  const { rows: found } = await query('SELECT role, active FROM users WHERE id = $1', [id]);
  if (!found[0]) throw notFound('User not found');

  // never allow the system to be left without an active admin
  const losingAdmin = found[0].role === 'admin' && found[0].active && ((b.role && b.role !== 'admin') || b.active === false);
  if (losingAdmin) {
    const { rows } = await query(`SELECT count(*)::int AS n FROM users WHERE role='admin' AND active AND id <> $1`, [id]);
    if (rows[0].n === 0) throw new HttpError(400, 'At least one active admin is required');
  }

  const hash = b.password ? await bcrypt.hash(b.password, 10) : null;
  const { rows } = await query(
    `UPDATE users SET name = COALESCE($2,name), role = COALESCE($3,role), active = COALESCE($4,active),
       password_hash = COALESCE($5,password_hash) WHERE id = $1 RETURNING ${COLS}`,
    [id, b.name ?? null, b.role ?? null, b.active ?? null, hash]
  );
  await audit(req, 'update', 'user', id, { ...b, password: b.password ? '(reset)' : undefined });
  res.json(rows[0]);
}));

export default router;
