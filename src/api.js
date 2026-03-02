// Cliente API centralizado con prioridad:
// 1) REACT_APP_API_BASE (build-time)
// 2) /config.json (runtime)
// 3) relativo al mismo origen
let apiBase; // undefined = no cargado, string = base URL ('' para relativa)

function normalizeBase(base) {
  return String(base || '').trim().replace(/\/+$/, '');
}

const envApiBase = normalizeBase(process.env.REACT_APP_API_BASE);
if (envApiBase) {
  apiBase = envApiBase;
}

async function loadConfig() {
  if (apiBase !== undefined) return;
  try {
    const res = await fetch('/config.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('no config');
    const data = await res.json();
    apiBase = normalizeBase((data && typeof data.apiBase === 'string') ? data.apiBase : '');
  } catch {
    apiBase = '';
  }
}

export async function apiFetch(path, options) {
  await loadConfig();
  const base = apiBase || '';
  const isAbsolute = typeof path === 'string' && /^(?:https?:)?\/\//i.test(path);
  const p = typeof path === 'string' ? (path.startsWith('/') ? path : '/' + path) : String(path || '');
  // Rutas locales servidas por nuestro propio server (no deben usar apiBase remoto)
  const isLocalService = /^\/(usuarios|login|config\.json)(?:\/|$)/i.test(p);
  const shouldUseBase = base && !isAbsolute && !isLocalService;
  const url = shouldUseBase ? base.replace(/\/$/, '') + p : p;
  try {
    const opts = options || {};
    const headers = new Headers(opts.headers || {});
    if (!headers.has('accept')) headers.set('accept', 'application/json');
    return await fetch(url, { ...opts, headers });
  } catch (e) {
    // Fallback: si hay base remota y falla (CORS/red), reintenta contra mismo origen
    if (shouldUseBase && p) {
      const rel = p;
      try {
        return await fetch(rel, options);
      } catch (_) {
        throw e;
      }
    }
    throw e;
  }
}

export function setApiBase(base) {
  apiBase = normalizeBase(base);
}

export async function pingServer() {
  await loadConfig();
  const base = apiBase || '';
  const root = base ? base.replace(/\/$/, '') : '';
  const candidates = ['/health', '/api/caja?solo_caja=true', '/'];
  for (const p of candidates) {
    const url = root ? root + p : p;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) return true;
    } catch {
      // intenta siguiente
    }
  }
  return false;
}

// Cache de categorías en sessionStorage para evitar re-fetches innecesarios.
// Las categorías raramente cambian; se invalida manualmente desde AdminCategories.
export async function fetchCategorias() {
  const cached = sessionStorage.getItem('atm_categorias_cache');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch { /* cache corrupto, re-fetch */ }
  }
  const res = await apiFetch('/api/categorias');
  if (!res.ok) throw new Error('Error al obtener categorías');
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [];
  sessionStorage.setItem('atm_categorias_cache', JSON.stringify(arr));
  return arr;
}

// Invalida el cache de categorías (llamar al crear/editar/eliminar categoría)
export function invalidateCategoriasCache() {
  sessionStorage.removeItem('atm_categorias_cache');
}

// Obtiene solo el saldo de caja de forma ligera; devuelve número o null
export async function getSaldoCajaLight() {
  try {
    const res = await apiFetch('/api/caja?solo_caja=true');
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return null;
    const n = Number(data.saldo_caja ?? data.saldo ?? data.total ?? data.saldo_actual);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
