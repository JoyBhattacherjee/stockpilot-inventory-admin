import { useState } from 'react';
import { PackageOpen, ShieldCheck, Boxes, LineChart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Field } from '../components/ui';
import { ROLE_INFO } from '../utils';

const DEMO = ['admin', 'manager', 'staff', 'viewer'];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e, creds) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try { await login(creds?.email ?? email, creds?.password ?? password); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-art">
        <div className="brand" style={{ padding: 0, fontSize: 20 }}><span className="brand-logo"><PackageOpen size={19} color="#fff" /></span>StockPilot</div>
        <div>
          <h2>Know exactly what you have, where it is, and when to reorder.</h2>
          <ul>
            <li><Boxes size={18} /> Multi-warehouse stock with a full movement ledger</li>
            <li><LineChart size={18} /> Purchase orders, sales orders and reorder suggestions</li>
            <li><ShieldCheck size={18} /> Role-based access with a complete audit trail</li>
          </ul>
        </div>
        <span className="small" style={{ color: '#94a3b8' }}>Inventory management admin panel</span>
      </div>
      <div className="login-form">
        <form className="login-box stack" onSubmit={submit}>
          <div><h1 style={{ fontSize: 26 }}>Welcome back</h1><p className="muted" style={{ margin: '4px 0 0' }}>Sign in to your admin account</p></div>
          {error && <div className="alert alert-error">{error}</div>}
          <Field label="Email"><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
          <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <button className="btn btn-primary" disabled={busy} style={{ padding: '10px 14px' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="demo-accounts">
            <div className="small muted" style={{ padding: '0 8px 4px' }}>Demo accounts — click to sign in (password: Password123!)</div>
            {DEMO.map((r) => (
              <button type="button" key={r} disabled={busy} onClick={() => submit(null, { email: `${r}@stockpilot.dev`, password: 'Password123!' })}>
                <span style={{ fontWeight: 600 }}>{ROLE_INFO[r].label}</span><span className="small muted">{r}@stockpilot.dev</span>
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
