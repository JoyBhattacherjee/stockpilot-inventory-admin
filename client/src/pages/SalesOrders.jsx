import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ShoppingCart } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useLookups } from '../api/useLookups';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import LineItems from '../components/LineItems';
import { ConfirmModal, Empty, ErrorBox, Field, Modal, PageHeader, SearchInput, Spinner, StatusBadge, setField } from '../components/ui';
import { fmtDate, fmtDateTime, fmtMoney } from '../utils';

export default function SalesOrders() {
  const { can } = useAuth();
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState({ status: '', q: '' });
  const { data, loading, error, reload } = useApi('/sales-orders', f);
  const [creating, setCreating] = useState(false);
  const openId = params.get('open');
  const setOpen = (id) => setParams(id ? { open: id } : {});

  return (
    <>
      <PageHeader title="Sales Orders" subtitle="Create orders and ship them — stock is deducted when you fulfil.">
        {can('manageSales') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New sales order</button>}
      </PageHeader>
      <div className="card">
        <div className="toolbar">
          <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Search order # or customer…" />
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option><option value="pending">Pending</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : !data?.length ? <Empty icon={ShoppingCart} title="No sales orders" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Order #</th><th>Customer</th><th>Ships from</th><th>Created</th><th className="num">Units</th><th className="num">Total</th><th>Status</th></tr></thead>
            <tbody>{data.map((o) => (
              <tr key={o.id} className="clickable" onClick={() => setOpen(o.id)}>
                <td className="mono"><strong>{o.so_number}</strong></td><td>{o.customer_name}</td><td className="muted">{o.warehouse_name}</td>
                <td className="muted nowrap">{fmtDate(o.created_at)}</td><td className="num">{o.units}</td><td className="num">{fmtMoney(o.total)}</td><td><StatusBadge status={o.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {creating && <SOForm lookups={lookups} onClose={() => setCreating(false)} onSaved={(so) => { setCreating(false); reload(); setOpen(so.id); }} />}
      {openId && <SODetail id={openId} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function SOForm({ lookups, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ customer_name: '', customer_email: '', warehouse_id: lookups.warehouses[0]?.id ?? '', notes: '' });
  const [items, setItems] = useState([{ product_id: '', quantity: 1, unit_price: '' }]);
  const on = setField(setF);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api.post('/sales-orders', { ...f, items }); toast.success(`${r.so_number} created`); onSaved(r); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal wide title="New sales order" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="so" disabled={busy}>{busy ? 'Saving…' : 'Create order'}</button></>}>
      <form id="so" onSubmit={submit} className="stack">
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-grid">
          <Field label="Customer"><input className="input" required value={f.customer_name} onChange={on('customer_name')} /></Field>
          <Field label="Customer email"><input className="input" type="email" value={f.customer_email} onChange={on('customer_email')} /></Field>
          <Field label="Ship from warehouse"><select className="select" value={f.warehouse_id} onChange={on('warehouse_id')}>{lookups.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          <Field label="Notes"><input className="input" value={f.notes} onChange={on('notes')} /></Field>
        </div>
        <LineItems items={items} onChange={setItems} priceKey="unit_price" priceFrom="sell_price" priceLabel="Unit price" />
      </form>
    </Modal>
  );
}

function SODetail({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: so, loading, error, reload } = useApi(`/sales-orders/${id}`);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const act = async (path, msg) => {
    setBusy(true);
    try { await api.post(`/sales-orders/${id}/${path}`); toast.success(msg); setConfirmCancel(false); reload(); onChanged(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const short = so?.status === 'pending' && so.items.some((i) => i.available < i.quantity);
  const profit = so?.status === 'fulfilled' ? so.items.reduce((s, i) => s + i.quantity * (i.unit_price - (i.unit_cost || 0)), 0) : null;

  return (
    <Modal wide title={so ? so.so_number : 'Sales order'} onClose={onClose}>
      {loading && !so ? <Spinner /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row wrap"><StatusBadge status={so.status} /><span className="muted">Created by {so.created_by_name || '—'} · {fmtDateTime(so.created_at)}</span></div>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Customer</dt><dd>{so.customer_name}{so.customer_email && <span className="muted"> · {so.customer_email}</span>}</dd>
            <dt>Ships from</dt><dd>{so.warehouse_name}</dd>{so.fulfilled_at && <><dt>Fulfilled</dt><dd>{fmtDateTime(so.fulfilled_at)}</dd></>}{so.notes && <><dt>Notes</dt><dd>{so.notes}</dd></>}
          </dl>
          {short && <div className="alert alert-error">Some lines exceed available stock at this warehouse — fulfilment will be blocked until stock is replenished.</div>}
          <div className="card table-wrap"><table>
            <thead><tr><th>Product</th><th className="num">Qty</th>{so.status === 'pending' && <th className="num">Available</th>}<th className="num">Unit price</th><th className="num">Line total</th></tr></thead>
            <tbody>{so.items.map((i) => (
              <tr key={i.id}><td><div className="cell-title">{i.product_name}</div><div className="cell-sub mono">{i.sku}</div></td><td className="num">{i.quantity}</td>
                {so.status === 'pending' && <td className="num" style={{ color: i.available < i.quantity ? 'var(--red)' : undefined, fontWeight: 600 }}>{i.available}</td>}
                <td className="num">{fmtMoney(i.unit_price)}</td><td className="num">{fmtMoney(i.quantity * i.unit_price)}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="totals">{profit != null && <span className="muted">Gross profit: {fmtMoney(profit)}</span>}<span>Total: {fmtMoney(so.total)}</span></div>
          {so.status === 'pending' && can('manageSales') && (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmCancel(true)}>Cancel order</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => act('fulfill', 'Order fulfilled — stock updated')}>Fulfil & ship</button>
            </div>
          )}
        </div>
      )}
      {confirmCancel && <ConfirmModal danger busy={busy} title="Cancel order" confirmLabel="Cancel order" message="This order will be cancelled. No stock has been deducted." onClose={() => setConfirmCancel(false)} onConfirm={() => act('cancel', 'Order cancelled')} />}
    </Modal>
  );
}
