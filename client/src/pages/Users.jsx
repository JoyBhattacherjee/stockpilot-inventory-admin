import { useState } from 'react';
import { Pencil, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, ErrorBox, Field, Modal, PageHeader, Spinner, StatusBadge, setField } from '../components/ui';
import { ROLE_INFO, fmtDateTime } from '../utils';

export default function Users() {
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useApi('/users');
  const [editing, setEditing] = useState(null);

  return (
    <>
      <PageHeader title="Users & Roles" subtitle="Control who can see and change what.">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add user</button>
      </PageHeader>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        {Object.entries(ROLE_INFO).map(([r, i]) => (
          <div key={r} className="card card-pad"><div className="row"><ShieldCheck size={17} color="var(--primary)" /><strong>{i.label}</strong></div><p className="muted small" style={{ margin: '6px 0 0' }}>{i.desc}</p></div>
        ))}
      </div>
      <div className="card">
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>{data?.map((u) => (
              <tr key={u.id}>
                <td><div className="row"><span className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{u.name[0]}</span><div><div className="cell-title">{u.name} {u.id === me.id && <Badge tone="indigo" plain>You</Badge>}</div><div className="cell-sub">{u.email}</div></div></div></td>
                <td><StatusBadge status={u.role} /></td>
                <td><StatusBadge status={u.active ? 'active' : 'inactive'} /></td>
                <td className="muted">{fmtDateTime(u.last_login_at)}</td>
                <td className="right"><button className="icon-btn" onClick={() => setEditing(u)} title="Edit"><Pencil size={16} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {editing && <UserForm user={editing} isSelf={editing.id === me.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function UserForm({ user, isSelf, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !user.id;
  const [f, setF] = useState({ name: user.name ?? '', email: user.email ?? '', role: user.role ?? 'staff', active: user.active ?? true, password: '' });
  const on = setField(setF);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (isNew) await api.post('/users', f);
      else await api.patch(`/users/${user.id}`, { name: f.name, role: f.role, active: f.active, ...(f.password ? { password: f.password } : {}) });
      toast.success(isNew ? 'User created' : 'User updated'); onSaved();
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title={isNew ? 'Add user' : `Edit ${user.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="uf" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form id="uf" className="form-grid" onSubmit={submit}>
        {error && <div className="alert alert-error full">{error}</div>}
        <Field label="Full name"><input className="input" required value={f.name} onChange={on('name')} /></Field>
        <Field label="Email"><input className="input" type="email" required disabled={!isNew} value={f.email} onChange={on('email')} /></Field>
        <Field label="Role" hint={ROLE_INFO[f.role].desc}><select className="select" value={f.role} onChange={on('role')} disabled={isSelf}>{Object.entries(ROLE_INFO).map(([r, i]) => <option key={r} value={r}>{i.label}</option>)}</select></Field>
        {!isNew && <Field label="Status"><select className="select" disabled={isSelf} value={String(f.active)} onChange={(e) => setF({ ...f, active: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Deactivated</option></select></Field>}
        <Field label={isNew ? 'Password' : 'Reset password'} className="full" hint={isNew ? 'At least 8 characters' : 'Leave blank to keep the current password'}>
          <input className="input" type="password" autoComplete="new-password" required={isNew} minLength={8} value={f.password} onChange={on('password')} />
        </Field>
      </form>
    </Modal>
  );
}
