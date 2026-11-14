import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="row wrap">{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button>
      </>
    }>
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

export const Field = ({ label, error, hint, children, className = '' }) => (
  <div className={`field ${className}`}>
    {label && <label>{label}</label>}
    {children}
    {hint && !error && <span className="hint">{hint}</span>}
    {error && <span className="err">{error}</span>}
  </div>
);

export const Badge = ({ tone = 'slate', children, plain }) => <span className={`badge b-${tone} ${plain ? 'plain' : ''}`}>{children}</span>;

const STATUS_TONE = {
  draft: 'slate', ordered: 'blue', partial: 'amber', received: 'green', cancelled: 'red',
  pending: 'amber', fulfilled: 'green', ok: 'green', low: 'amber', out: 'red',
  active: 'green', inactive: 'slate',
  admin: 'indigo', manager: 'blue', staff: 'green', viewer: 'slate',
};
const STATUS_LABEL = { ok: 'In stock', low: 'Low stock', out: 'Out of stock' };
export const StatusBadge = ({ status }) => (
  <Badge tone={STATUS_TONE[status] || 'slate'} plain={['admin', 'manager', 'staff', 'viewer'].includes(status)}>
    {STATUS_LABEL[status] || status.charAt(0).toUpperCase() + status.slice(1)}
  </Badge>
);

const MOVE_TONE = { PURCHASE: 'green', SALE: 'blue', ADJUSTMENT: 'amber', TRANSFER_IN: 'indigo', TRANSFER_OUT: 'indigo' };
export const MovementBadge = ({ type }) => <Badge tone={MOVE_TONE[type]} plain>{type.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;

export function StatCard({ icon: Icon, tone = 'indigo', label, value, sub }) {
  return (
    <div className="card stat">
      <div className={`stat-icon tone-${tone}`}><Icon size={20} /></div>
      <div><div className="label">{label}</div><div className="value">{value}</div>{sub && <div className="sub">{sub}</div>}</div>
    </div>
  );
}

export const Spinner = () => <div className="spinner" aria-label="Loading" />;
export const Empty = ({ title = 'Nothing here yet', children, icon: Icon = Inbox }) => (
  <div className="empty"><Icon size={36} /><div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>{children && <div>{children}</div>}</div>
);
export const ErrorBox = ({ error }) => error ? <div className="alert alert-error">{error.message}</div> : null;

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="search">
      <Search size={16} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.total === 0) return null;
  const { page, pages, total, limit } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="pager">
      <span>{from}–{to} of {total}</span>
      <div className="row">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /> Prev</button>
        <span>Page {page} / {pages}</span>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export function SortTh({ label, field, sort, dir, onSort, className = '' }) {
  const active = sort === field;
  return (
    <th className={`sortable ${className}`} onClick={() => onSort(field, active && dir === 'asc' ? 'desc' : 'asc')}>
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );
}

/** Small hook-free helper for form state with server-side error display */
export const setField = (setter) => (key) => (e) =>
  setter((s) => ({ ...s, [key]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
