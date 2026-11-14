import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Boxes, ClipboardList, History, LayoutDashboard, LogOut, Menu, Package, PackageOpen, ShoppingCart, Truck, Users as UsersIcon, Warehouse } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cap } from '../utils';

const NAV = [
  { section: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  { section: 'Inventory', items: [
    { to: '/products', label: 'Products', icon: Package },
    { to: '/stock', label: 'Stock & Movements', icon: Boxes },
    { to: '/catalog', label: 'Suppliers & Locations', icon: Warehouse },
  ] },
  { section: 'Orders', items: [
    { to: '/purchase-orders', label: 'Purchase Orders', icon: Truck },
    { to: '/sales-orders', label: 'Sales Orders', icon: ShoppingCart },
  ] },
  { section: 'Insights', items: [{ to: '/reports', label: 'Reports', icon: BarChart3, action: 'viewReports' }] },
  { section: 'Administration', items: [
    { to: '/users', label: 'Users & Roles', icon: UsersIcon, action: 'manageUsers' },
    { to: '/audit', label: 'Audit Log', icon: History, action: 'viewAudit' },
  ] },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const close = () => setOpen(false);
  // close the mobile drawer on navigation
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="app">
      {open && <div className="scrim" onClick={close} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><span className="brand-logo"><PackageOpen size={19} color="#fff" /></span>StockPilot</div>
        <nav>
          {NAV.map((g) => {
            const items = g.items.filter((i) => !i.action || can(i.action));
            if (!items.length) return null;
            return (
              <div key={g.section}>
                <div className="nav-section">{g.section}</div>
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} onClick={close} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <Icon size={18} /> {label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="row">
            <NavLink to="/profile" onClick={close} className="user-chip" style={{ flex: 1, minWidth: 0 }}>
              <span className="avatar">{user.name.charAt(0)}</span>
              <span style={{ minWidth: 0 }}><div className="name">{user.name}</div><div className="role">{cap(user.role)}</div></span>
            </NavLink>
            <button className="icon-btn" style={{ color: '#aab3c5' }} onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <strong>StockPilot</strong>
        </header>
        <main className="content" key={location.pathname}><Outlet /></main>
      </div>
    </div>
  );
}
