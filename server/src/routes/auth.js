import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils/errors.js';
import { audit } from '../utils/audit.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' },
});

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw new HttpError(401, 'Invalid email or password');
  if (!user.active) throw new HttpError(403, 'This account has been deactivated');
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  req.user = user;
  await audit(req, 'login', 'user', user.id);
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

router.post('/change-password', authenticate, wrap(async (req, res) => {
  const { currentPassword, newPassword } = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  }).parse(req.body);
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 10), req.user.id]);
  await audit(req, 'change_password', 'user', req.user.id);
  res.json({ ok: true });
}));

export default router;
