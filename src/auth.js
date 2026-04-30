// Autenticación basada en usuarios del servidor local (SQLite via /usuarios)
import { apiFetch } from './api';

const SESSION_KEY = 'auth_session_v1';

// Nota: usamos PIN plano contra /login del servidor SQLite. Si migras a hash/salt, añade util de hash aquí.

let usersCache = null; // { users: Array<{ username, displayName?, salt?, pinHash?, pin? }> }

function normalizeRole(role) {
  const safe = String(role || '').trim().toLowerCase();
  return safe || 'user';
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function normalizeUserRow(row) {
  const username = String(row?.username || '').trim();
  const displayName =
    String(row?.displayName || row?.name || row?.full_name || username).trim() || username;
  return {
    ...row,
    username,
    displayName,
    role: normalizeRole(row?.role),
  };
}

async function readErrorMessage(res, fallback) {
  const contentType = res.headers?.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => null);
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data && typeof data.error === 'string' && data.error.trim()) return data.error.trim();
    if (data && typeof data.message === 'string' && data.message.trim()) return data.message.trim();
    return fallback;
  }

  const text = await res.text().catch(() => '');
  const trimmed = text.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
      if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
      if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
    } catch {
      // Si no es JSON válido, usamos el texto plano.
    }
  }

  return trimmed;
}

export async function getUsers(force = false) {
  if (usersCache && !force) return usersCache.users || [];
  const res = await apiFetch('/api/users', { cache: 'no-cache' });
  if (!res.ok) throw new Error(await readErrorMessage(res, 'No se pudo cargar usuarios'));
  const data = await res.json();
  const users = Array.isArray(data) ? data.map(normalizeUserRow).filter((u) => u.username) : [];
  usersCache = { users };
  return users;
}

export async function login(username, pin) {
  const safeUsername = String(username || '').trim();
  const safePin = String(pin || '').trim();
  if (!safeUsername || !safePin) throw new Error('Usuario y PIN son requeridos');
  const res = await apiFetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: safeUsername, pin: safePin }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, 'No se pudo iniciar sesión'));
  const data = await res.json();
  const session = {
    username: String(data?.username || safeUsername).trim(),
    ts: Date.now(),
    displayName: String(data?.displayName || data?.name || safeUsername).trim() || safeUsername,
    role: normalizeRole(data?.role),
  };
  writeSession(session);
  return { username: session.username };
}

export async function refreshSessionFromServer() {
  const current = readSession();
  if (!current?.username) return current;

  try {
    const users = await getUsers(true);
    const me = users.find(
      (u) => String(u?.username || '').toLowerCase() === String(current.username).toLowerCase()
    );
    if (!me) return current;

    const next = {
      ...current,
      username: me.username || current.username,
      displayName: me.displayName || current.displayName || current.username,
      role: normalizeRole(me.role || current.role),
    };

    if (
      next.username !== current.username ||
      next.displayName !== current.displayName ||
      next.role !== current.role
    ) {
      writeSession(next);
    }

    return next;
  } catch {
    return current;
  }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated() {
  const session = readSession();
  return !!session?.username;
}

export function getSessionUsername() {
  const session = readSession();
  return session?.username || null;
}

export function getSession() {
  return readSession();
}

export function isAdmin() {
  const session = readSession();
  return normalizeRole(session?.role) === 'admin';
}

// Ya no existen overrides locales; todo proviene del servidor

export async function hashPinWithSalt(pin) {
  const salt = Math.random().toString(36).slice(2, 10);
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(hash));
  const pinHash = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return { salt, pinHash };
}
