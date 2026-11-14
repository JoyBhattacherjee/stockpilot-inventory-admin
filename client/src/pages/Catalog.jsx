import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, ConfirmModal, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Tabs, setField } from '../components/ui';

const CONFIGS = {
  suppliers: {
    label: 'Suppliers', singular: 'supplier', write: 'manageCatalog', del: 'manageUsers',
    blank: { name: '', contact_person: '', email: '', phone: '', address: '', lead_time_days: 7, active: true },
    columns: [
      { h: 'Supplier', r: (s) => <><div className="cell-title">{s.name}</div><div className="cell-sub">{s.contact_person}</div></> },
      { h: 'Contact', r: (s) => <><div>{s.email || '—'}</div><div className="cell-sub">{s.phone}</div></> },
      { h: 'Lead time', r: (s) => `${s.lead_time_days} days` },
      { h: 'Products', r: (s) => s.product_count },
      { h: 'Status', r: (s) => <Badge tone={s.active ? 'green' : 'slate'}>{s.active ? 'Active' : 'Inactive'}</Badge> },
    ],
    fields: [
      ['name', 'Company name', 'text', true], ['contact_person', 'Contact person', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'text'],
      ['lead_time_days', 'Lead time (days)', 'number'], ['address', 'Address', 'text'],
    ],
  },
  categories: {
    label: 'Categories', singular: 'category', write: 'manageCatalog', del: 'manageCatalog',
    blank: { name: '', description: '' },
    columns: [
      { h: 'Category', r: (c) => <div className="cell-title">{c.name}</div> },
      { h: 'Description', r: (c) => <span className="muted">{c.description || '—'}</span> },
      { h: 'Products', r: (c) => c.product_count },
    ],
    fields: [['name', 'Name', 'text', true], ['description', 'Description', 'text']],
  },
  warehouses: {
    label: 'Warehouses', singular: 'warehouse', write: 'manageWarehouses', del: 'manageWarehouses',
    blank: { name: '', code: '', location: '', active: true },
    columns: [
      { h: 'Warehouse', r: (w) => <><div className="cell-title">{w.name}</div><div className="cell-sub mono">{w.code}</div></> },
      { h: 'Location', r: (w) => <span className="muted">{w.location || '—'}</span> },
      { h: 'Units on hand', r: (w) => w.total_units },
      { h: 'Status', r: (w) => <Badge tone={w.active ? 'green' : 'slate'}>{w.active ? 'Active' : 'Inactive'}</Badge> },
    ],
    fields: [['name', 'Name', 'text', true], ['code', 'Code', 'text', true], ['location', 'Location', 'text']],
  },
};

export default function Catalog() {
  const [tab, setTab] = useState('suppliers');
  return (
    <>
      <PageHeader title="Suppliers & Locations" subtitle="Reference data that powers purchasing, categorisation and multi-warehouse stock." />
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={Object.entries(CONFIGS).map(([id, c]) => ({ id, label: c.label }))} />
        <CrudTable key={tab} cfg={CONFIGS[tab]} path={`/${tab}`} />
      </div>
    </>
  );
}

function CrudTable({ cfg, path }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(path);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const canWrite = can(cfg.write);
  const canDelete = can(cfg.del);

  const remove = async () => {
    try { await api.del(`${path}/${deleting.id}`); toast.success(`${cfg.singular} deleted`); setDeleting(null); reload(); }
    catch (e) { toast.error(e); setDeleting(null); }
  };

  return (
    <>
      <div className="toolbar"><span className="muted">{data?.length ?? 0} {cfg.label.toLowerCase()}</span><span className="spacer" />
        {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...cfg.blank })}><Plus size={14} /> Add {cfg.singular}</button>}</div>
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : !data?.length ? <Empty title={`No ${cfg.label.toLowerCase()} yet`} /> : (
        <div className="table-wrap"><table>
          <thead><tr>{cfg.columns.map((c) => <th key={c.h}>{c.h}</th>)}<th /></tr></thead>
          <tbody>{data.map((row) => (
            <tr key={row.id}>{cfg.columns.map((c) => <td key={c.h}>{c.r(row)}</td>)}
              <td className="right nowrap">
                {canWrite && <button className="icon-btn" title="Edit" onClick={() => setEditing(row)}><Pencil size={16} /></button>}
                {canDelete && <button className="icon-btn" title="Delete" onClick={() => setDeleting(row)}><Trash2 size={16} /></button>}
              </td></tr>
          ))}</tbody>
        </table></div>
      )}
      {editing && <EditModal cfg={cfg} path={path} row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {deleting && <ConfirmModal danger title={`Delete ${cfg.singular}`} confirmLabel="Delete" message={`Delete "${deleting.name}"? Items that are in use cannot be deleted.`} onClose={() => setDeleting(null)} onConfirm={remove} />}
    </>
  );
}

function EditModal({ cfg, path, row, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !row.id;
  const [f, setF] = useState(Object.fromEntries(Object.keys(cfg.blank).map((k) => [k, row[k] ?? cfg.blank[k]])));
  const on = setField(setF);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { isNew ? await api.post(path, f) : await api.put(`${path}/${row.id}`, f); toast.success(`${cfg.singular} saved`); onSaved(); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title={`${isNew ? 'Add' : 'Edit'} ${cfg.singular}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="crud" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form id="crud" className="form-grid" onSubmit={submit}>
        {error && <div className="alert alert-error full">{error}</div>}
        {cfg.fields.map(([key, label, type, req]) => (
          <Field key={key} label={label} className={key === 'address' || key === 'description' ? 'full' : ''}>
            <input className="input" type={type} required={req} min={type === 'number' ? 0 : undefined} value={f[key] ?? ''} onChange={on(key)} />
          </Field>
        ))}
        {'active' in cfg.blank && (
          <Field label="Status"><select className="select" value={String(f.active)} onChange={(e) => setF({ ...f, active: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></Field>
        )}
      </form>
    </Modal>
  );
}
