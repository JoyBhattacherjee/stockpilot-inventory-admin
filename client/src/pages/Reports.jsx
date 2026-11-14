import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ShoppingBasket } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Empty, ErrorBox, PageHeader, Spinner, StatCard, Tabs } from '../components/ui';
import { Banknote, Boxes, Percent } from 'lucide-react';
import { fmtMoney, fmtNum } from '../utils';

export default function Reports() {
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('reorder');
  return (
    <>
      <PageHeader title="Reports" subtitle="Valuation and replenishment insights.">
        {can('exportData') && ['products', 'stock', 'movements'].map((t) => (
          <button key={t} className="btn" onClick={() => api.download(`/reports/export/${t}.csv`, `${t}.csv`).catch(toast.error)}><Download size={16} /> {t[0].toUpperCase() + t.slice(1)} CSV</button>
        ))}
      </PageHeader>
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'reorder', label: 'Reorder suggestions' }, { id: 'valuation', label: 'Inventory valuation' }]} />
        {tab === 'reorder' ? <Reorder /> : <Valuation />}
      </div>
    </>
  );
}

function Reorder() {
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error } = useApi('/reports/reorder');
  const [busy, setBusy] = useState(null);

  const createPO = async (g) => {
    setBusy(g.supplier_id);
    try {
      const wh = (await api.get('/warehouses')).find((w) => w.active);
      const po = await api.post('/purchase-orders', {
        supplier_id: g.supplier_id, warehouse_id: wh.id, notes: 'Auto-generated from reorder suggestions',
        items: g.items.map((i) => ({ product_id: i.product_id, quantity: i.suggested_qty, unit_cost: i.cost_price })),
      });
      toast.success(`${po.po_number} created as a draft`);
      nav(`/purchase-orders?open=${po.id}`);
    } catch (e) { toast.error(e); setBusy(null); }
  };

  return (
    <div className="card-pad stack">
      <div className="alert alert-info">Products at or below their reorder level, grouped by supplier. Suggested quantity tops stock up to the larger of the reorder quantity or 2× reorder level, minus anything already on order.</div>
      <ErrorBox error={error} />
      {loading && !data ? <Spinner /> : !data?.length ? <Empty icon={ShoppingBasket} title="Nothing to reorder">Every product is above its reorder level.</Empty> : data.map((g) => (
        <div key={g.supplier_id ?? 'none'} className="card">
          <div className="card-head" style={{ paddingBottom: 12 }}>
            <div><h3>{g.supplier_name}</h3>{g.lead_time_days != null && <div className="muted small">Lead time {g.lead_time_days} days · est. {fmtMoney(g.estimated_cost)}</div>}</div>
            {g.supplier_id && can('managePurchasing')
              ? <button className="btn btn-primary btn-sm" disabled={busy === g.supplier_id} onClick={() => createPO(g)}>{busy === g.supplier_id ? 'Creating…' : 'Create draft PO'}</button>
              : !g.supplier_id && <span className="muted small">Assign a supplier to these products to order</span>}
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Product</th><th className="num">In stock</th><th className="num">Reorder level</th><th className="num">On order</th><th className="num">Suggested qty</th><th className="num">Est. cost</th></tr></thead>
            <tbody>{g.items.map((i) => (
              <tr key={i.product_id}><td><div className="cell-title">{i.name}</div><div className="cell-sub mono">{i.sku}</div></td>
                <td className="num" style={{ color: i.stock === 0 ? 'var(--red)' : undefined, fontWeight: 600 }}>{i.stock}</td><td className="num">{i.reorder_level}</td><td className="num">{i.on_order}</td>
                <td className="num"><strong>{i.suggested_qty}</strong></td><td className="num">{fmtMoney(i.suggested_qty * i.cost_price)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      ))}
    </div>
  );
}

function Valuation() {
  const { data, loading, error } = useApi('/reports/valuation');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const { totals, byCategory, byWarehouse } = data;
  const margin = totals.retail_value ? ((totals.retail_value - totals.cost_value) / totals.retail_value) * 100 : 0;
  const Table = ({ title, rows }) => (
    <div className="card">
      <div className="card-head"><h3>{title}</h3></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th className="num">Units</th><th className="num">Cost value</th><th className="num">Retail value</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td className="num">{fmtNum(r.units)}</td><td className="num">{fmtMoney(r.cost_value)}</td><td className="num">{fmtMoney(r.retail_value)}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
  return (
    <div className="card-pad stack">
      <div className="grid g3">
        <StatCard icon={Banknote} label="Total cost value" value={fmtMoney(totals.cost_value)} />
        <StatCard icon={Boxes} tone="blue" label="Total units" value={fmtNum(totals.units)} sub={`${fmtMoney(totals.retail_value)} at retail`} />
        <StatCard icon={Percent} tone="green" label="Potential margin" value={`${margin.toFixed(1)}%`} />
      </div>
      <div className="grid g2"><Table title="By category" rows={byCategory} /><Table title="By warehouse" rows={byWarehouse} /></div>
    </div>
  );
}
