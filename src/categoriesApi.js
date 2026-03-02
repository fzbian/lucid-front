import { apiFetch } from './api';

function normalizeServerError(txt) {
  const msg = (txt || '').toString();
  if (/1054|Unknown column/i.test(msg)) {
    return 'El servidor intentó usar una columna inexistente (por ejemplo, created_at). Pide al backend ajustar el SQL o agregar la columna.';
  }
  return msg || 'Error del servidor';
}

export async function listCategories() {
  const res = await apiFetch('/api/categorias', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Error al cargar categorías');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createCategory({ nombre, tipo }) {
  if (!nombre || !tipo) throw new Error('Nombre y tipo requeridos');
  if (tipo !== 'INGRESO' && tipo !== 'EGRESO') throw new Error('Tipo inválido');
  const res = await apiFetch('/api/categorias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, tipo })
  });
  if (!res.ok) {
  const txt = await res.text();
  throw new Error(normalizeServerError(txt) || 'Error al crear categoría');
  }
}

export async function updateCategory(id, patch) {
  if (!id) throw new Error('ID requerido');
  const body = {};
  if (patch?.nombre != null) body.nombre = patch.nombre;
  if (patch?.tipo != null) {
    if (patch.tipo !== 'INGRESO' && patch.tipo !== 'EGRESO') throw new Error('Tipo inválido');
    body.tipo = patch.tipo;
  }
  const res = await apiFetch(`/api/categorias/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
  const txt = await res.text();
  throw new Error(normalizeServerError(txt) || 'Error al actualizar categoría');
  }
}

export async function deleteCategory(id) {
  if (!id) throw new Error('ID requerido');
  const res = await apiFetch(`/api/categorias/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
  const txt = await res.text();
  throw new Error(normalizeServerError(txt) || 'Error al eliminar categoría');
  }
}

export async function setGastoOperativo(id, isGastoOperativo) {
  if (!id) throw new Error('ID requerido');
  const res = await apiFetch(`/api/categorias/${encodeURIComponent(id)}/set-gasto-operativo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_gasto_operativo: isGastoOperativo })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(normalizeServerError(txt) || 'Error al configurar gastos operativos');
  }
}
