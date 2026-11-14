const CURRENCY = import.meta.env.VITE_CURRENCY || 'USD';
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY });
const moneyCompact = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY, notation: 'compact', maximumFractionDigits: 1 });
const num = new Intl.NumberFormat();

export const fmtMoney = (v) => money.format(Number(v || 0));
export const fmtMoneyCompact = (v) => moneyCompact.format(Number(v || 0));
export const fmtNum = (v) => num.format(Number(v || 0));
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const shortDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
export const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

/** Role capabilities - mirrors the server-side requireRole() checks (the server is the source of truth). */
const RULES = {
  manageCatalog: ['admin', 'manager'],      // products, suppliers, categories
  deleteProduct: ['admin'],
  manageWarehouses: ['admin'],
  adjustStock: ['admin', 'manager'],
  transferStock: ['admin', 'manager', 'staff'],
  managePurchasing: ['admin', 'manager'],
  receiveGoods: ['admin', 'manager', 'staff'],
  manageSales: ['admin', 'manager', 'staff'],
  viewReports: ['admin', 'manager', 'viewer'],
  exportData: ['admin', 'manager'],
  manageUsers: ['admin'],
  viewAudit: ['admin'],
};
export const can = (role, action) => (RULES[action] || []).includes(role);

export const ROLE_INFO = {
  admin: { label: 'Admin', desc: 'Full access, including users, warehouses and the audit log.' },
  manager: { label: 'Manager', desc: 'Manages products, suppliers, purchasing, stock adjustments and reports.' },
  staff: { label: 'Staff', desc: 'Day-to-day operations: sales orders, receiving goods, stock transfers.' },
  viewer: { label: 'Viewer', desc: 'Read-only access to inventory, orders and reports.' },
};
