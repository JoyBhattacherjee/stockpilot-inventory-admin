import { ZodError } from 'zod';
import { HttpError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // PostgreSQL error codes
  if (err.code === '23505') return res.status(409).json({ error: 'A record with the same unique value already exists', details: err.detail });
  if (err.code === '23503') return res.status(409).json({ error: 'This record is referenced by other data and cannot be changed this way' });
  if (err.code === '23514') return res.status(400).json({ error: 'A value violates a data rule (check constraint)' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid identifier or value format' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
