import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError, wrap } from '../utils/errors.js';

export const ROLES = ['admin', 'manager', 'staff', 'viewer'];

/** Verifies the bearer token and loads the *current* user (so role changes / deactivation apply immediately). */
export const authenticate = wrap(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expired or invalid token');
  }
  const { rows } = await query('SELECT id, name, email, role, active FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  if (!user || !user.active) throw new HttpError(401, 'Account not found or deactivated');
  req.user = user;
  next();
});

/** Role gate: requireRole('admin','manager') */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new HttpError(403, `This action requires one of: ${roles.join(', ')}`));
  }
  next();
};

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
