import { useState } from 'react';
import { ArrowLeftRight, Download, SlidersHorizontal, Boxes } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useLookups } from '../api/useLookups';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ProductSelect from '../components/ProductSelect';
import { Empty, ErrorBox, Field, Modal, MovementBadge, PageHeader, Pagination, SearchInput, Spinner, Tabs, setField } from '../components/ui';
import { fmtDateTime, fmtMoney } from '../utils';

export default function Stock() {
  const { can } = useAuth();
  const toast = useToast();
  const lookups = useLookups();
  const [tab, setTab] = useState('levels');
  const [dialog, setDialog] = useState(null); // 'adjust' | 'transfer'
  const [nonce, setNonce] = useState(0);
  const done = () => { setDialog(null); setNonce((n) => n + 1); };

  return (
    <>
      <PageHeader title="Stock & Movements" subtitle="Where every unit is, and the full ledger of how it got there.">
        {can('exportData') && <button className="btn" onClick={() => api.download('/reports/export/movements.csv', 'movements.csv').catch(toast.error)}><Download size={16} /> Export ledger</button>}
        {can('transferStock') && <button className="btn" onClick={() => setDialog('transfer')}><ArrowLeftRight size={16} /> Transfer</button>}
        {can('adjustStock') && <button className="btn btn-primary" onClick={() => setDialog('adjust')}><SlidersHorizontal size={16} /> Adjust stock</button>}
      </PageHeader>
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'levels', label: 'Stock levels' }, { id: 'movements', label: 'Movement ledger' }]} />
        {tab === 'levels' ? <Levels lookups={lookups} nonce={nonce} /> : <Movements lookups={lookups} nonce={nonce} />}
      </div>
      {dialog === 'adjust' && <AdjustModal lookups={lookups} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'transfer' && <TransferModal lookups={lookups} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

function Levels({ lookups, nonce }) {
  const [f, setF] = useState({ q: '', warehouse_id: '' });
  const { data, loading, error } = useApi('/stock/levels', { ...f, nonce });
  return (
    <>
      <div className="toolbar">
        <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Search product…" />
        <select className="select" value={f.warehouse_id} onChange={(e) => setF({ ...f, warehouse_id: e.target.value })} aria-label="Warehouse">
          <option value="">All warehouses</option>{lookups.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : !data?.length ? <Empty icon={Boxes} title="No stock on hand" /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Product</th><th>Warehouse</th><th className="num">On hand</th><th className="num">Value (cost)</th></tr></thead>
          <tbody>{data.map((r) => (
            <tr key={`${r.product_id}-${r.warehouse_id}`}>
              <td><div className="cell-title">{r.name}</div><div className="cell-sub mono">{r.sku}</div></td>
              <td>{r.warehouse_name}</td><td className="num"><strong>{r.quantity}</strong> <span className="muted small">{r.unit}</span></td><td className="num">{fmtMoney(r.value)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

function Movements({ lookups, nonce }) {
  const [f, setF] = useState({ type: '', warehouse_id: '', from: '', to: '', page: 1 });
  const set = (p) => setF((s) => ({ ...s, page: 1, ...p }));
  const { data, loading, error } = useApi('/stock/movements', { ...f, nonce });
  return (
    <>
      <div className="toolbar">
        <select className="select" value={f.type} onChange={(e) => set({ type: e.target.value })} aria-label="Type">
          <option value="">All types</option>{['PURCHASE', 'SALE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <select className="select" value={f.warehouse_id} onChange={(e) => set({ warehouse_id: e.target.value })} aria-label="Warehouse">
          <option value="">All warehouses</option>{lookups.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <label className="row small muted">From <input className="input" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} style={{ width: 150 }} /></label>
        <label className="row small muted">To <input className="input" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} style={{ width: 150 }} /></label>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : !data?.data.length ? <Empty title="No movements match" /> : (
        <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}><table>
          <thead><tr><th>When</th><th>Product</th><th>Type</th><th className="num">Qty</th><th className="num">Balance</th><th>Warehouse</th><th>Note</th><th>By</th></tr></thead>
          <tbody>{data.data.map((m) => (
            <tr key={m.id}>
              <td className="muted nowrap">{fmtDateTime(m.created_at)}</td>
              <td><div className="cell-title">{m.product_name}</div><div className="cell-sub mono">{m.sku}</div></td>
              <td><MovementBadge type={m.type} /></td>
              <td className="num" style={{ color: m.quantity > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
              <td className="num">{m.balance_after}</td><td className="muted">{m.warehouse_name}</td><td className="muted">{m.note}</td><td className="muted">{m.user_name}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Pagination pagination={data?.pagination} onPage={(page) => setF((s) => ({ ...s, page }))} />
    </>
  );
}

function AdjustModal({ lookups, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ product_id: '', warehouse_id: lookups.warehouses[0]?.id ?? '', mode: 'add', quantity: '', reason: '' });
  const on = setField(setF);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const { data: product } = useApi(f.product_id ? `/products/${f.product_id}` : '/dashboard', null, { enabled: !!f.product_id });
  const current = f.product_id ? product?.levels?.find((l) => l.warehouse_id === Number(f.warehouse_id))?.quantity : null;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api.post('/stock/adjust', f); toast.success(`Stock adjusted (${r.delta > 0 ? '+' : ''}${r.delta}) — new balance ${r.balance}`); onDone(); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title="Adjust stock" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="adj" disabled={busy}>{busy ? 'Saving…' : 'Apply adjustment'}</button></>}>
      <form id="adj" className="form-grid" onSubmit={submit}>
        {error && <div className="alert alert-error full">{error}</div>}
        <Field label="Product" className="full"><ProductSelect value={f.product_id} onChange={on('product_id')} required /></Field>
        <Field label="Warehouse"><select className="select" value={f.warehouse_id} onChange={on('warehouse_id')}>{lookups.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="Current on hand"><input className="input" disabled value={current ?? '—'} /></Field>
        <Field label="Action"><select className="select" value={f.mode} onChange={on('mode')}><option value="add">Add units</option><option value="remove">Remove units</option><option value="set">Set exact count</option></select></Field>
        <Field label={f.mode === 'set' ? 'Counted quantity' : 'Quantity'}><input className="input" type="number" min="0" required value={f.quantity} onChange={on('quantity')} /></Field>
        <Field label="Reason" className="full" hint="Recorded in the ledger and audit log"><input className="input" required minLength={3} value={f.reason} onChange={on('reason')} placeholder="e.g. Cycle count, damaged goods, found stock" /></Field>
      </form>
    </Modal>
  );
}

function TransferModal({ lookups, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ product_id: '', from_warehouse_id: lookups.warehouses[0]?.id ?? '', to_warehouse_id: lookups.warehouses[1]?.id ?? '', quantity: '', note: '' });
  const on = setField(setF);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const { data: product } = useApi(f.product_id ? `/products/${f.product_id}` : '/dashboard', null, { enabled: !!f.product_id });
  const available = product?.levels?.find((l) => l.warehouse_id === Number(f.from_warehouse_id))?.quantity;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/stock/transfer', f); toast.success('Transfer completed'); onDone(); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title="Transfer stock between warehouses" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="tr" disabled={busy}>{busy ? 'Moving…' : 'Transfer'}</button></>}>
      <form id="tr" className="form-grid" onSubmit={submit}>
        {error && <div className="alert alert-error full">{error}</div>}
        <Field label="Product" className="full"><ProductSelect value={f.product_id} onChange={on('product_id')} required /></Field>
        <Field label="From" hint={available != null ? `${available} available` : ''}><select className="select" value={f.from_warehouse_id} onChange={on('from_warehouse_id')}>{lookups.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="To"><select className="select" value={f.to_warehouse_id} onChange={on('to_warehouse_id')}>{lookups.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="Quantity"><input className="input" type="number" min="1" required value={f.quantity} onChange={on('quantity')} /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={on('note')} placeholder="Optional" /></Field>
      </form>
    </Modal>
  );
}
