import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Banknote, Boxes, PackageX, TrendingUp, Truck } from 'lucide-react';
import { useApi } from '../api/useApi';
import { useAuth } from '../context/AuthContext';
import { ErrorBox, MovementBadge, PageHeader, Spinner, StatCard, StatusBadge, Empty } from '../components/ui';
import { fmtDateTime, fmtMoney, fmtMoneyCompact, fmtNum, shortDay } from '../utils';

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useApi('/dashboard');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const { kpis, movementsByDay, revenueByDay, valueByCategory, topProducts, lowStock, recentMovements } = data;
  const days = (rows) => rows.map((r) => ({ ...r, label: shortDay(r.day) }));

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]} 👋`} subtitle="Here is what is happening across your inventory today." />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <StatCard icon={Banknote} tone="indigo" label="Inventory value (at cost)" value={fmtMoneyCompact(kpis.stock_cost_value)} sub={`${fmtMoneyCompact(kpis.stock_retail_value)} at retail`} />
        <StatCard icon={Boxes} tone="blue" label="Units in stock" value={fmtNum(kpis.units)} sub={`${kpis.products} active products`} />
        <StatCard icon={AlertTriangle} tone={kpis.low_stock + kpis.out_of_stock ? 'amber' : 'green'} label="Needs attention" value={kpis.low_stock + kpis.out_of_stock} sub={`${kpis.low_stock} low · ${kpis.out_of_stock} out of stock`} />
        <StatCard icon={TrendingUp} tone="green" label="Revenue (30 days)" value={fmtMoneyCompact(kpis.revenue_30d)} sub={`${fmtMoneyCompact(kpis.profit_30d)} gross profit`} />
      </div>

      <div className="grid g-main" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><h3>Revenue — last 14 days</h3></div>
          <div className="card-pad" style={{ height: 270 }}>
            <ResponsiveContainer>
              <AreaChart data={days(revenueByDay)} margin={{ left: -10, right: 8, top: 8 }}>
                <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} /><stop offset="100%" stopColor="#4f46e5" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtMoneyCompact} />
                <Tooltip formatter={(v) => fmtMoney(v)} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#4f46e5" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Stock value by category</h3></div>
          <div className="card-pad" style={{ height: 270 }}>
            {valueByCategory.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={valueByCategory} dataKey="value" nameKey="name" innerRadius={52} outerRadius={85} paddingAngle={2}>
                    {valueByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoney(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <Empty title="No stock yet" />}
          </div>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-head"><h3>Stock in vs. out — last 14 days</h3></div>
          <div className="card-pad" style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={days(movementsByDay)} margin={{ left: -15, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="stock_in" name="Received" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="stock_out" name="Shipped" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Open orders</h3></div>
          <div className="card-pad stack">
            <Link to="/purchase-orders" className="row"><span className="stat-icon tone-blue" style={{ width: 38, height: 38 }}><Truck size={18} /></span><div><div style={{ fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>{kpis.open_purchase_orders}</div><div className="muted small">purchase orders awaiting delivery</div></div></Link>
            <Link to="/sales-orders" className="row"><span className="stat-icon tone-amber" style={{ width: 38, height: 38 }}><PackageX size={18} /></span><div><div style={{ fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>{kpis.pending_sales_orders}</div><div className="muted small">sales orders waiting to ship</div></div></Link>
          </div>
        </div>
      </div>

      <div className="grid g3">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-head"><h3>Low & out-of-stock items</h3><Link to="/reports" className="small">Reorder suggestions →</Link></div>
          {lowStock.length === 0 ? <Empty title="All stocked up" icon={Boxes}>Nothing is below its reorder level.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Product</th><th className="num">Stock</th><th className="num">Reorder at</th><th>Supplier</th><th>Status</th></tr></thead>
              <tbody>{lowStock.map((p) => (
                <tr key={p.id}><td><div className="cell-title">{p.name}</div><div className="cell-sub mono">{p.sku}</div></td>
                  <td className="num"><strong>{p.stock}</strong></td><td className="num">{p.reorder_level}</td>
                  <td className="muted">{p.supplier_name || '—'}</td><td><StatusBadge status={p.stock === 0 ? 'out' : 'low'} /></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Top sellers (30 days)</h3></div>
            <div style={{ paddingTop: 8 }}>{topProducts.length ? topProducts.map((p, i) => (
              <div className="list-item" key={p.id}><span className="avatar" style={{ width: 28, height: 28, fontSize: 12, background: COLORS[i] }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div className="cell-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div><div className="cell-sub">{p.units} units · {fmtMoney(p.revenue)}</div></div></div>
            )) : <Empty title="No sales yet" />}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Recent stock activity</h3><Link to="/stock" className="small">View ledger →</Link></div>
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>Product</th><th>Type</th><th className="num">Qty</th><th>Location</th><th>By</th></tr></thead>
          <tbody>{recentMovements.map((m) => (
            <tr key={m.id}><td className="muted nowrap">{fmtDateTime(m.created_at)}</td><td>{m.product_name}</td><td><MovementBadge type={m.type} /></td>
              <td className="num" style={{ color: m.quantity > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
              <td className="muted">{m.warehouse_code}</td><td className="muted">{m.user_name || '—'}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}
