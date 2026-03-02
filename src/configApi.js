import { apiFetch } from './api';
import { normalizeViewIds } from './roleViews';

async function readApiError(res, fallback) {
  const contentType = res.headers?.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => null);
    if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
    if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
    return fallback;
  }

  const text = await res.text().catch(() => '');
  return text.trim() || fallback;
}

export async function getRoleConfigs() {
  const res = await apiFetch('/api/config/roles', { cache: 'no-cache' });
  if (!res.ok) throw new Error(await readApiError(res, 'Error cargando configuraciones'));
  return res.json();
}

export async function saveRoleConfig(role, views) {
  const safeRole = String(role || '').trim().toLowerCase();
  const safeViews = normalizeViewIds(views);

  const res = await apiFetch('/api/config/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: safeRole, views: safeViews }),
  });

  if (!res.ok) throw new Error(await readApiError(res, 'Error guardando configuración'));
  return res.json();
}
