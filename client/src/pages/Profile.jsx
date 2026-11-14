import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Field, PageHeader, StatusBadge, setField } from '../components/ui';
import { ROLE_INFO } from '../utils';

export default function Profile() {
  const { user } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const on = setField(setF);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (f.newPassword !== f.confirm) return setError('New passwords do not match');
    setBusy(true);
    try { await api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword }); toast.success('Password updated'); setF({ currentPassword: '', newPassword: '', confirm: '' }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="My account" />
      <div className="grid g2">
        <div className="card card-pad stack">
          <div className="row"><span className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>{user.name[0]}</span><div><h3>{user.name}</h3><div className="muted">{user.email}</div></div></div>
          <div className="row"><StatusBadge status={user.role} /><span className="muted small">{ROLE_INFO[user.role].desc}</span></div>
        </div>
        <form className="card card-pad stack" onSubmit={submit}>
          <h3>Change password</h3>
          {error && <div className="alert alert-error">{error}</div>}
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={f.currentPassword} onChange={on('currentPassword')} /></Field>
          <Field label="New password" hint="At least 8 characters"><input className="input" type="password" autoComplete="new-password" minLength={8} required value={f.newPassword} onChange={on('newPassword')} /></Field>
          <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" required value={f.confirm} onChange={on('confirm')} /></Field>
          <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></div>
        </form>
      </div>
    </>
  );
}
