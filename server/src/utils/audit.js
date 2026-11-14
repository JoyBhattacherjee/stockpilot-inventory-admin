import { pool } from '../db/pool.js';

/** Record an audit entry. Pass a transaction client to make it atomic with the change. */
export async function audit(req, action, entity, entityId, details = null, client = pool) {
  await client.query(
    `INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.user?.id ?? null, req.user?.name ?? null, action, entity, entityId != null ? String(entityId) : null, details]
  );
}
