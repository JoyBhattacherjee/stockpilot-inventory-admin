import { Plus, Trash2 } from 'lucide-react';
import ProductSelect from './ProductSelect';
import { fmtMoney } from '../utils';

/**
 * Editable order lines. `priceKey` is the per-line price field ('unit_cost' for POs, 'unit_price' for SOs).
 * When a product is picked the price is prefilled from `priceFrom` ('cost_price' | 'sell_price').
 */
export default function LineItems({ items, onChange, priceKey, priceFrom, priceLabel }) {
  const update = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const total = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it[priceKey]) || 0), 0);
  return (
    <div>
      <table className="line-items">
        <thead><tr><th style={{ width: '46%' }}>Product</th><th>Qty</th><th>{priceLabel}</th><th className="num">Line total</th><th /></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><ProductSelect value={it.product_id} exclude={items.filter((_, x) => x !== i).map((x) => x.product_id)} showStock
                onChange={(id, p) => update(i, { product_id: id, [priceKey]: p ? p[priceFrom] : it[priceKey] })} required /></td>
              <td><input className="input" type="number" min="1" required value={it.quantity} onChange={(e) => update(i, { quantity: e.target.value })} style={{ width: 84 }} /></td>
              <td><input className="input" type="number" min="0" step="0.01" required value={it[priceKey]} onChange={(e) => update(i, { [priceKey]: e.target.value })} style={{ width: 110 }} /></td>
              <td className="num">{fmtMoney((Number(it.quantity) || 0) * (Number(it[priceKey]) || 0))}</td>
              <td><button type="button" className="icon-btn" disabled={items.length === 1} onClick={() => onChange(items.filter((_, x) => x !== i))} aria-label="Remove line"><Trash2 size={16} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ justifyContent: 'space-between', paddingTop: 10 }}>
        <button type="button" className="btn btn-sm" onClick={() => onChange([...items, { product_id: '', quantity: 1, [priceKey]: '' }])}><Plus size={14} /> Add line</button>
        <strong>Total: {fmtMoney(total)}</strong>
      </div>
    </div>
  );
}
