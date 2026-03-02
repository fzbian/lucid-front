import { apiFetch } from './api';

async function handleJson(res, fallbackError) {
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const msg = text || fallbackError || 'Error del servidor';
    throw new Error(msg);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return text || null;
  }
}

export async function listClientInvoices(clientId) {
  if (!clientId) throw new Error('Cliente requerido');
  const res = await apiFetch(`/api/cartera/clientes/${encodeURIComponent(clientId)}/facturas`, { cache: 'no-cache' });
  const data = await handleJson(res, 'No se pudieron cargar las facturas');
  return Array.isArray(data) ? data : [];
}

export async function deleteInvoice(invoiceId) {
  if (!invoiceId) throw new Error('Factura requerida');
  const res = await apiFetch(`/api/cartera/facturas/${encodeURIComponent(invoiceId)}`, { method: 'DELETE' });
  return await handleJson(res, 'No se pudo eliminar la factura');
}

export async function uploadSupportImage(file) {
  if (!file) throw new Error('Archivo requerido');
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch('/api/cartera/abonos/soporte', { method: 'POST', body: fd });
  return await handleJson(res, 'No se pudo subir la imagen');
}

export async function createAbono(payload) {
  if (!payload || !payload.cliente_id) throw new Error('Cliente requerido');
  const res = await apiFetch('/api/cartera/abonos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await handleJson(res, 'No se pudo crear el abono');
}
