import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Stock from './pages/Stock';
import PurchaseOrders from './pages/PurchaseOrders';
import SalesOrders from './pages/SalesOrders';
import Catalog from './pages/Catalog';
import Reports from './pages/Reports';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import Profile from './pages/Profile';

function Guard({ action, children }) {
  const { can } = useAuth();
  return !action || can(action) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user, booting } = useAuth();
  if (booting) return <Spinner />;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="stock" element={<Stock />} />
        <Route path="purchase-orders" element={<PurchaseOrders />} />
        <Route path="sales-orders" element={<SalesOrders />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="reports" element={<Guard action="viewReports"><Reports /></Guard>} />
        <Route path="users" element={<Guard action="manageUsers"><Users /></Guard>} />
        <Route path="audit" element={<Guard action="viewAudit"><AuditLog /></Guard>} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
