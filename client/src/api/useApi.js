import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';

/** Fetch-on-mount/param-change hook. Ignores stale responses. */
export function useApi(path, params, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const seq = useRef(0);
  const key = JSON.stringify([path, params]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get(path, params);
      if (id === seq.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { if (enabled) load(); }, [load, enabled]);
  return { ...state, reload: load };
}
