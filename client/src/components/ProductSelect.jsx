import { useApi } from '../api/useApi';

/** Dropdown of active products. Good up to a few hundred SKUs; swap for async search beyond that. */
export default function ProductSelect({ value, onChange, exclude = [], showStock, ...rest }) {
  const { data } = useApi('/products', { limit: 200, status: 'active', sort: 'name' });
  const options = (data?.data || []).filter((p) => p.id === Number(value) || !exclude.includes(p.id));
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '', options.find((p) => p.id === Number(e.target.value)))} {...rest}>
      <option value="">Select product…</option>
      {options.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}{showStock ? ` (${p.stock} in stock)` : ''}</option>)}
    </select>
  );
}
