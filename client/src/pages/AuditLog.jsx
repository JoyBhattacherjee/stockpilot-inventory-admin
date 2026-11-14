import { useState } from 'react';
import { useApi } from '../api/useApi';
import { Empty, ErrorBox, PageHeader, Pagination, Spinner, Badge } from '../components/ui';
import { fmtDateTime } from '../utils';

const ENTITIES = ['product', 'stock', 'purchase_order', 'sales_order', 'supplier', 'category', 'warehouse', 'user'];

export default function AuditLog() {
  const [f, setF] = useState({ entity: '', page: 1 });
  const { data, loading, error } = useApi('/audit', f);
  return (
    <>
      <PageHeader title="Audit Log" subtitle="Who did what, and when. Entries cannot be edited." />
      <div className="card">
        <div className="toolbar">
          <select className="select" value={f.entity} onChange={(e) => setF({ entity: e.target.value, page: 1 })} aria-label="Entity">
            <option value="">All activity</option>{ENTITIES.map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
          </select>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : !data?.data.length ? <Empty title="No activity recorded" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{data.data.map((a) => (
              <tr key={a.id}><td className="muted nowrap">{fmtDateTime(a.created_at)}</td><td>{a.user_name || '—'}</td>
                <td><Badge tone="indigo" plain>{a.action}</Badge></td><td>{a.entity.replace('_', ' ')} <span className="muted mono">#{a.entity_id}</span></td>
                <td className="muted small mono" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.details ? JSON.stringify(a.details) : ''}>{a.details ? JSON.stringify(a.details) : ''}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        <Pagination pagination={data?.pagination} onPage={(page) => setF({ ...f, page })} />
      </div>
    </>
  );
}
