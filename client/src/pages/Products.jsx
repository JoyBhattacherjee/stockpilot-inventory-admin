import { useState } from 'react';
import { Download, Pencil, Plus, Trash2, Package } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useLookups } from '../api/useLookups';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, ConfirmModal, Empty, ErrorBox, Field, Modal, MovementBadge, PageHeader, Pagination, SearchInput, SortTh, Spinner, StatusBadge, setField } from '../components/ui';
import { fmtDateTime, fmtMoney } from '../utils';

const BLANK = { sku: '', name: '', description: '', category_id: '', supplier_id: '', unit: 'pcs', cost_price: '', sell_price: '', reorder_level: 10, reorder_qty: 0, initial_stock: '', warehouse_id: '' };

export default function Products() {
  const { can } = useAuth();
  const toast = useToast();
  const lookups = useLookups();
  const [filters, setFilters] = useState({ q: '', category_id: '', stock: 'all', status: 'active', sort: 'name', dir: 'asc', page: 1 });
  const set = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const { data, loading, error, reload } = useApi('/products', filters);
  const [editing, setEditing] = useState(null);   // product object | {} for new
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      const r = await api.del(`/products/${deleting.id}`);
      toast.success(r.archived ? 'Product has history — archived instead of deleted' : 'Product deleted');
      setDeleting(null); reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Products" subtitle="Your catalogue with live stock levels across all warehouses.">
        {can('exportData') && <button className="btn" onClick={() => api.download('/reports/export/products.csv', 'products.csv').catch(toast.error)}><Download size={16} /> Export CSV</button>}
        {can('manageCatalog') && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add product</button>}
      </PageHeader>

      <div className="card">
        <div className="toolbar">
          <SearchInput value={filters.q} onChange={(q) => set({ q })} placeholder="Search name or SKU…" />
          <select className="select" value={filters.category_id} onChange={(e) => set({ category_id: e.target.value })} aria-label="Category">
            <option value="">All categories</option>{lookups.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="select" value={filters.stock} onChange={(e) => set({ stock: e.target.value })} aria-label="Stock level">
            <option value="all">Any stock level</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
          </select>
          <select className="select" value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
            <option value="active">Active</option><option value="inactive">Archived</option><option value="all">All</option>
          </select>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : !data?.data.length ? <Empty title="No products found" icon={Package}>Try adjusting your filters.</Empty> : (
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table>
              <thead><tr>
                <SortTh label="Product" field="name" {...filters} onSort={(sort, dir) => set({ sort, dir })} />
                <th>Category</th>
                <SortTh label="Stock" field="stock" className="num" {...filters} onSort={(sort, dir) => set({ sort, dir })} />
                <SortTh label="Cost" field="cost" className="num" {...filters} onSort={(sort, dir) => set({ sort, dir })} />
                <SortTh label="Price" field="price" className="num" {...filters} onSort={(sort, dir) => set({ sort, dir })} />
                <th>Status</th><th />
              </tr></thead>
              <tbody>{data.data.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setViewing(p.id)}>
                  <td><div className="cell-title">{p.name} {!p.active && <Badge tone="slate" plain>Archived</Badge>}</div><div className="cell-sub mono">{p.sku}</div></td>
                  <td className="muted">{p.category_name || '—'}</td>
                  <td className="num"><strong>{p.stock}</strong> <span className="muted small">{p.unit}</span></td>
                  <td className="num">{fmtMoney(p.cost_price)}</td><td className="num">{fmtMoney(p.sell_price)}</td>
                  <td><StatusBadge status={p.stock_status} /></td>
                  <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                    {can('manageCatalog') && <button className="icon-btn" title="Edit" onClick={() => setEditing(p)}><Pencil size={16} /></button>}
                    {can('deleteProduct') && <button className="icon-btn" title="Delete" onClick={() => setDeleting(p)}><Trash2 size={16} /></button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <Pagination pagination={data?.pagination} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>

      {editing && <ProductForm product={editing} lookups={lookups} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {viewing && <ProductDetail id={viewing} onClose={() => setViewing(null)} />}
      {deleting && <ConfirmModal danger busy={busy} title="Delete product" confirmLabel="Delete" onClose={() => setDeleting(null)} onConfirm={remove}
        message={`Delete "${deleting.name}"? If it has stock or order history it will be archived instead, so records stay intact.`} />}
    </>
  );
}

function ProductForm({ product, lookups, onClose, onSaved }) {
  const isNew = !product.id;
  const toast = useToast();
  const [f, setF] = useState(isNew ? { ...BLANK, warehouse_id: lookups.warehouses[0]?.id ?? '' } : { ...BLANK, ...product, description: product.description ?? '', category_id: product.category_id ?? '', supplier_id: product.supplier_id ?? '' });
  const on = setField(setF);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    const body = {
      sku: f.sku, name: f.name, description: f.description, unit: f.unit,
      category_id: f.category_id || null, supplier_id: f.supplier_id || null,
      cost_price: f.cost_price || 0, sell_price: f.sell_price || 0,
      reorder_level: f.reorder_level || 0, reorder_qty: f.reorder_qty || 0,
    };
    if (isNew && f.initial_stock) { body.initial_stock = f.initial_stock; body.warehouse_id = f.warehouse_id; }
    try {
      isNew ? await api.post('/products', body) : await api.put(`/products/${product.id}`, { ...body, active: f.active });
      toast.success(isNew ? 'Product created' : 'Product updated');
      onSaved();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal wide title={isNew ? 'Add product' : `Edit ${product.name}`} onClose={onClose} footer={
      <><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="product-form" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></>
    }>
      <form id="product-form" onSubmit={save} className="form-grid">
        {error && <div className="alert alert-error full">{error}</div>}
        <Field label="SKU"><input className="input" value={f.sku} onChange={on('sku')} required placeholder="e.g. ELE-100" /></Field>
        <Field label="Name"><input className="input" value={f.name} onChange={on('name')} required /></Field>
        <Field label="Category"><select className="select" value={f.category_id} onChange={on('category_id')}><option value="">—</option>{lookups.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Supplier"><select className="select" value={f.supplier_id} onChange={on('supplier_id')}><option value="">—</option>{lookups.suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Cost price"><input className="input" type="number" min="0" step="0.01" value={f.cost_price} onChange={on('cost_price')} /></Field>
        <Field label="Selling price"><input className="input" type="number" min="0" step="0.01" value={f.sell_price} onChange={on('sell_price')} /></Field>
        <Field label="Unit of measure"><input className="input" value={f.unit} onChange={on('unit')} /></Field>
        <Field label="Reorder level" hint="Flagged as low stock at or below this total"><input className="input" type="number" min="0" value={f.reorder_level} onChange={on('reorder_level')} /></Field>
        <Field label="Reorder quantity" hint="Preferred order size (used for suggestions)"><input className="input" type="number" min="0" value={f.reorder_qty} onChange={on('reorder_qty')} /></Field>
        {isNew ? (<>
          <Field label="Opening stock" hint="Optional"><input className="input" type="number" min="0" value={f.initial_stock} onChange={on('initial_stock')} /></Field>
          <Field label="Opening stock warehouse"><select className="select" value={f.warehouse_id} onChange={on('warehouse_id')}>{lookups.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        </>) : (
          <Field label="Status"><select className="select" value={String(f.active)} onChange={(e) => setF((s) => ({ ...s, active: e.target.value === 'true' }))}><option value="true">Active</option><option value="false">Archived</option></select></Field>
        )}
        <Field label="Description" className="full"><textarea className="textarea" value={f.description} onChange={on('description')} /></Field>
      </form>
    </Modal>
  );
}

function ProductDetail({ id, onClose }) {
  const { data, loading, error } = useApi(`/products/${id}`);
  return (
    <Modal wide title={data ? data.name : 'Product'} onClose={onClose}>
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="grid g2">
            <dl className="kv" style={{ margin: 0 }}>
              <dt>SKU</dt><dd className="mono">{data.sku}</dd><dt>Category</dt><dd>{data.category_name || '—'}</dd>
              <dt>Supplier</dt><dd>{data.supplier_name || '—'}</dd><dt>Unit</dt><dd>{data.unit}</dd>
            </dl>
            <dl className="kv" style={{ margin: 0 }}>
              <dt>Cost / Price</dt><dd>{fmtMoney(data.cost_price)} / {fmtMoney(data.sell_price)}</dd>
              <dt>Margin</dt><dd>{data.sell_price ? `${(((data.sell_price - data.cost_price) / data.sell_price) * 100).toFixed(1)}%` : '—'}</dd>
              <dt>Reorder level</dt><dd>{data.reorder_level}</dd><dt>Total stock</dt><dd><strong>{data.stock}</strong> {data.unit}</dd>
            </dl>
          </div>
          {data.description && <p className="muted" style={{ margin: 0 }}>{data.description}</p>}
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Stock by warehouse</h3>
            <div className="grid g3">{data.levels.map((l) => (
              <div key={l.warehouse_id} className="card card-pad"><div className="muted small">{l.warehouse_name}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{l.quantity}</div></div>
            ))}</div>
          </div>
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Recent movements</h3>
            <div className="card table-wrap"><table>
              <thead><tr><th>When</th><th>Type</th><th className="num">Qty</th><th className="num">Balance</th><th>Warehouse</th><th>Note</th></tr></thead>
              <tbody>{data.movements.length ? data.movements.map((m) => (
                <tr key={m.id}><td className="muted nowrap">{fmtDateTime(m.created_at)}</td><td><MovementBadge type={m.type} /></td>
                  <td className="num" style={{ color: m.quantity > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                  <td className="num">{m.balance_after}</td><td className="muted">{m.warehouse_name}</td><td className="muted">{m.note}</td></tr>
              )) : <tr><td colSpan="6" className="muted">No movements yet</td></tr>}</tbody>
            </table></div>
          </div>
        </div>
      )}
    </Modal>
  );
}
