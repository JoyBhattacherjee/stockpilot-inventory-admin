import { HttpError } from './errors.js';

/**
 * Apply a signed stock delta to one product in one warehouse and write the ledger row.
 * Decrements are guarded by `quantity + delta >= 0`, so stock can never go negative,
 * even with concurrent requests (backed by a CHECK constraint as a second line of defence).
 */
export async function applyMovement(client, { productId, warehouseId, delta, type, refType = null, refId = null, note = null, userId = null }) {
  if (!Number.isInteger(delta) || delta === 0) throw new HttpError(400, 'Quantity must be a non-zero integer');
  let balance;
  if (delta > 0) {
    const { rows } = await client.query(
      `INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, warehouse_id)
       DO UPDATE SET quantity = stock_levels.quantity + EXCLUDED.quantity
       RETURNING quantity`,
      [productId, warehouseId, delta]
    );
    balance = rows[0].quantity;
  } else {
    // Guarded atomic decrement: the WHERE clause makes overselling impossible, even under concurrency.
    const { rows } = await client.query(
      `UPDATE stock_levels SET quantity = quantity + $3
       WHERE product_id = $1 AND warehouse_id = $2 AND quantity + $3 >= 0
       RETURNING quantity`,
      [productId, warehouseId, delta]
    );
    if (!rows[0]) {
      const { rows: info } = await client.query(
        `SELECT p.name, p.sku, COALESCE(sl.quantity,0) AS available
         FROM products p LEFT JOIN stock_levels sl ON sl.product_id = p.id AND sl.warehouse_id = $2
         WHERE p.id = $1`,
        [productId, warehouseId]
      );
      const p = info[0];
      throw new HttpError(409, `Insufficient stock for ${p?.name ?? 'product'} (${p?.sku ?? productId}): ${p?.available ?? 0} available, ${Math.abs(delta)} requested`);
    }
    balance = rows[0].quantity;
  }
  await client.query(
    `INSERT INTO stock_movements (product_id, warehouse_id, type, quantity, balance_after, reference_type, reference_id, note, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [productId, warehouseId, type, delta, balance, refType, refId, note, userId]
  );
  return balance;
}
