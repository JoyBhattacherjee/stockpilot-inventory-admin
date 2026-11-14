const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'stockpilot.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const qs = (params = {}) => {
  const e = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all');
  return e.length ? '?' + new URLSearchParams(e).toString() : '';
};

async function request(path, { method = 'GET', body, params, raw = false } = {}) {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}${path}${qs(params)}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('auth:expired'));
    const detail = Array.isArray(data.details) ? data.details.map((d) => d.message).join(', ') : '';
    throw new ApiError(res.status, detail && data.error === 'Validation failed' ? detail : data.error || `Request failed (${res.status})`, data.details);
  }
  return data;
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  async download(path, fallbackName) {
    const res = await request(path, { raw: true });
    const blob = await res.blob();
    const name = /filename="(.+?)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  },
};
