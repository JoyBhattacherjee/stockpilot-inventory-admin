import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../api/client';
import { can } from '../utils';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!tokenStore.get());

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get('/auth/me').then((r) => setUser(r.user)).catch(logout).finally(() => setBooting(false));
  }, [logout]);

  useEffect(() => {
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, [logout]);

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    tokenStore.set(r.token);
    setUser(r.user);
  };

  const value = useMemo(() => ({ user, booting, login, logout, can: (action) => can(user?.role, action) }), [user, booting, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
