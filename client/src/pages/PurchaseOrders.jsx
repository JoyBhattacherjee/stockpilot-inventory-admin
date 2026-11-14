import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Truck } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useLookups } from '../api/useLookups';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import LineItems from '../components/LineItems';
import { ConfirmModal, Empty, ErrorBox, Field, Modal, PageHeader, SearchInput, Spinner, StatusBadge, setField } from '../components/ui';
import { fmtDate, fmtMoney } from '../utils';

export default function PurchaseOrders() {
  const { can } = useAuth();
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState({ status: '', q: '' });
  const { data, loading, error, reload } = useApi('/purchase-orders', f);
  const [form, setForm] = useState(null);   // null | {} | existing PO (edit)
  const openId = params.get('open');
  const setOpen = (id) => setParams(id ? { open: id } : {});

  return (
    <>
      <PageHeader title="Purchase Orders" subtitle="Order from suppliers and receive goods into your warehouses.">
        {can('managePurchasing') && <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} /> New purchase order</button>}
      </PageHeader>
      <div className="card">
        <div className="toolbar">
          <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Search PO number…" />
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>{['draft', 'ordered', 'partial', 'received', 'cancelled'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : !data?.length ? <Empty icon={Truck} title="No purchase orders" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>PO #</th><th>Supplier</th><th>Deliver to</th><th>Expected</th><th className="num">Received</th><th className="num">Total</th><th>Status</th></tr></thead>
            <tbody>{data.map((po) => (
              <tr key={po.id} className="clickable" onClick={() => setOpen(po.id)}>
                <td className="mono"><strong>{po.po_number}</strong></td><td>{po.supplier_name}</td><td className="muted">{po.warehouse_name}</td>
                <td className="muted">{fmtDate(po.expected_date)}</td>
                <td className="num">{po.units_received}/{po.units_ordered}</td><td className="num">{fmtMoney(po.total)}</td><td><StatusBadge status={po.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {form && <POForm po={form.id ? form : null} lookups={lookups} onClose={() => setForm(null)} onSaved={(po) => { setForm(null); reload(); setOpen(po.id); }} />}
      {openId && !form && <PODetail id={openId} onClose={() => setOpen(null)} onChanged={reload} onEdit={(po) => { setOpen(null); setForm(po); }} />}
    </>
  );
}

function POForm({ po, lookups, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    supplier_id: po?.supplier_id ?? '', warehouse_id: po?.warehouse_id ?? lookups.warehouses[0]?.id ?? '',
    expected_date: po?.expected_date?.slice(0, 10) ?? '', notes: po?.notes ?? '',
  });
  const [items, setItems] = useState(po ? po.items.map((i) => ({ product_id: i.product_id, quantity: i.qty_ordered, unit_cost: i.unit_cost })) : [{ product_id: '', quantity: 1, unit_cost: '' }]);
  const on = setField(setF);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    const body = { ...f, expected_date: f.expected_date || null, items };
    try { const r = po ? await api.put(`/purchase-orders/${po.id}`, body) : await api.post('/purchase-orders', body); toast.success(`${r.po_number} saved as draft`); onSaved(r); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal wide title={po ? `Edit ${po.po_number}` : 'New purchase order'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="po" disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button></>}>
      <form id="po" onSubmit={submit} className="stack">
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-grid">
          <Field label="Supplier"><select className="select" required value={f.supplier_id} onChange={on('supplier_id')}><option value="">Select supplier…</option>{lookups.suppliers.filter((s) => s.active || s.id === f.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Deliver to warehouse"><select className="select" required value={f.warehouse_id} onChange={on('warehouse_id')}>{lookups.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          <Field label="Expected delivery"><input className="input" type="date" value={f.expected_date} onChange={on('expected_date')} /></Field>
          <Field label="Notes"><input className="input" value={f.notes} onChange={on('notes')} /></Field>
        </div>
        <LineItems items={items} onChange={setItems} priceKey="unit_cost" priceFrom="cost_price" priceLabel="Unit cost" />
      </form>
    </Modal>
  );
}

function PODetail({ id, onClose, onChanged, onEdit }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: po, loading, error, reload } = useApi(`/purchase-orders/${id}`);
  const [recv, setRecv] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRecv({}); }, [po?.status, po?.items?.map((i) => i.qty_received).join()]);

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); toast.success(msg); setConfirm(null); reload(); onChanged(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const receive = () => act(() => api.post(`/purchase-orders/${id}/receive`, { items: po.items.map((i) => ({ item_id: i.id, quantity: Number(recv[i.id] || 0) })) }), 'Goods received into stock');
  const receivable = po && ['ordered', 'partial'].includes(po.status) && can('receiveGoods');
  const totalToReceive = Object.values(recv).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <Modal wide title={po ? po.po_number : 'Purchase order'} onClose={onClose}>
      {loading && !po ? <Spinner /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row wrap"><StatusBadge status={po.status} /><span className="muted">Created by {po.created_by_name || '—'} on {fmtDate(po.created_at)}</span></div>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Supplier</dt><dd>{po.supplier_name}</dd><dt>Deliver to</dt><dd>{po.warehouse_name}</dd>
            <dt>Expected</dt><dd>{fmtDate(po.expected_date)}</dd>{po.notes && <><dt>Notes</dt><dd>{po.notes}</dd></>}
          </dl>
          <div className="card table-wrap"><table>
            <thead><tr><th>Product</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Unit cost</th><th className="num">Line total</th>{receivable && <th className="num">Receive now</th>}</tr></thead>
            <tbody>{po.items.map((i) => {
              const outstanding = i.qty_ordered - i.qty_received;
              return (
                <tr key={i.id}><td><div className="cell-title">{i.product_name}</div><div className="cell-sub mono">{i.sku}</div></td>
                  <td className="num">{i.qty_ordered}</td><td className="num">{i.qty_received}</td><td className="num">{fmtMoney(i.unit_cost)}</td><td className="num">{fmtMoney(i.qty_ordered * i.unit_cost)}</td>
                  {receivable && <td className="num">{outstanding > 0 ? (
                    <span className="row" style={{ justifyContent: 'flex-end' }}>
                      <input className="input" type="number" min="0" max={outstanding} style={{ width: 80 }} value={recv[i.id] ?? ''} onChange={(e) => setRecv({ ...recv, [i.id]: e.target.value })} placeholder="0" />
                      <button type="button" className="btn btn-sm" onClick={() => setRecv({ ...recv, [i.id]: outstanding })}>All {outstanding}</button>
                    </span>) : <span className="muted">Complete</span>}</td>}
                </tr>);
            })}</tbody>
          </table></div>
          <div className="totals">Order total: {fmtMoney(po.total)}</div>
          <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
            {po.status === 'draft' && can('managePurchasing') && <>
              <button className="btn" onClick={() => onEdit(po)}>Edit</button>
              <button className="btn btn-danger" onClick={() => setConfirm('delete')}>Delete draft</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api.post(`/purchase-orders/${id}/place`), 'Order placed with supplier')}>Place order</button>
            </>}
            {['draft', 'ordered'].includes(po.status) && can('managePurchasing') && <button className="btn" onClick={() => setConfirm('cancel')}>Cancel order</button>}
            {receivable && <button className="btn btn-primary" disabled={busy || totalToReceive <= 0} onClick={receive}>Receive {totalToReceive > 0 ? `${totalToReceive} units` : 'goods'}</button>}
          </div>
        </div>
      )}
      {confirm && <ConfirmModal danger busy={busy} title={confirm === 'cancel' ? 'Cancel order' : 'Delete draft'} confirmLabel={confirm === 'cancel' ? 'Cancel order' : 'Delete'} onClose={() => setConfirm(null)}
        message={confirm === 'cancel' ? 'This purchase order will be cancelled. This cannot be undone.' : 'This draft will be permanently deleted.'}
        onConfirm={() => confirm === 'cancel' ? act(() => api.post(`/purchase-orders/${id}/cancel`), 'Order cancelled') : act(async () => { await api.del(`/purchase-orders/${id}`); onClose(); }, 'Draft deleted')} />}
    </Modal>
  );
}
