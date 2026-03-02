import { getSessionUsername } from './auth';
import { apiFetch } from './api';

// Users API: siempre vía apiFetch para respetar apiBase de config.json
async function req(path, options) {
  const res = await apiFetch(`/api/users${path || ''}`, options);
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText || 'error'));
  return res;
}

export async function loadUsers() {
  const res = await req('', { cache: 'no-cache' });
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Respuesta inválida de usuarios');
  return data;
}

export async function createUser(user) {
  if (!user?.username || !user?.name) throw new Error('Datos incompletos');
  const body = {
    username: user.username,
    name: user.name,
    full_name: user.full_name || '',
    cedula: user.cedula || '',
    pin: user.pin || null,
    role: user.role || 'user',
    pay_type: user.pay_type || '',
    base_salary: user.base_salary ? Number(user.base_salary) : 0,
    daily_rate: user.daily_rate ? Number(user.daily_rate) : 0,
  };
  const res = await req('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return await res.json();
}

export async function updateUser(username, patch) {
  if (!username) throw new Error('Usuario requerido');
  const body = { ...patch };
  const actor = getSessionUsername();
  await req(`/${encodeURIComponent(username)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Actor-Username': actor || '' }, body: JSON.stringify(body) });
}

export async function deleteUser(username) {
  if (!username) throw new Error('Usuario requerido');
  const actor = getSessionUsername();
  await req(`/${encodeURIComponent(username)}`, { method: 'DELETE', headers: { 'X-Actor-Username': actor || '' } });
}

export async function syncUsers() {
  const res = await apiFetch('/api/users/sync', { method: 'POST' });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Error sincronizando usuarios'));
  return await res.json();
}
