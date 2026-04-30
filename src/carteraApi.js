import { apiFetch } from './api';

function extractErrorMessage(text) {
  const safe = text?.trim();
  if (!safe) return '';
  try {
    const parsed = JSON.parse(safe);
    if (typeof parsed === 'string') return parsed.trim();
    if (parsed && typeof parsed === 'object') {
      const message = parsed.error || parsed.message || parsed.detail;
      return typeof message === 'string' ? message.trim() : safe;
    }
  } catch (_) {
    return safe;
  }
  return safe;
}

async function handleJson(res, fallbackError) {
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const safe = extractErrorMessage(text);
    throw new Error(safe || fallbackError || 'Error del servidor');
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return text || null;
  }
}

async function request(path, options, fallbackError) {
  const res = await apiFetch(path, options);
  return handleJson(res, fallbackError);
}

export async function listClients(search = '') {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const data = await request(`/api/cartera/clientes${qs}`, { cache: 'no-cache' }, 'No se pudieron cargar los clientes');
  return Array.isArray(data) ? data : [];
}

export async function getClient(clientId) {
  if (!clientId) throw new Error('Cliente requerido');
  return request(`/api/cartera/clientes/${encodeURIComponent(clientId)}`, { cache: 'no-cache' }, 'No se pudo cargar el cliente');
}

export async function listPendingClientIncomes(clientId) {
  if (!clientId) throw new Error('Cliente requerido');
  const data = await request(`/api/cartera/clientes/${encodeURIComponent(clientId)}/ingresos-pendientes`, { cache: 'no-cache' }, 'No se pudieron cargar los ingresos pendientes');
  return Array.isArray(data) ? data : [];
}

export async function getPendingIncome(transactionId) {
  if (!transactionId) throw new Error('Ingreso pendiente requerido');
  return request(`/api/cartera/ingresos-pendientes/${encodeURIComponent(transactionId)}`, { cache: 'no-cache' }, 'No se pudo cargar el ingreso pendiente');
}

export async function createClient(payload) {
  return request('/api/cartera/clientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }, 'No se pudo crear el cliente');
}

export async function updateClient(clientId, payload) {
  if (!clientId) throw new Error('Cliente requerido');
  return request(`/api/cartera/clientes/${encodeURIComponent(clientId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }, 'No se pudo actualizar el cliente');
}

export async function notifyClientAccountStatement(clientId, payload) {
  if (!clientId) throw new Error('Cliente requerido');
  return request(`/api/cartera/clientes/${encodeURIComponent(clientId)}/notificar-estado-cuenta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }, 'No se pudo enviar el estado de cuenta por WhatsApp');
}

export async function deleteClient(clientId) {
  if (!clientId) throw new Error('Cliente requerido');
  return request(`/api/cartera/clientes/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
  }, 'No se pudo eliminar el cliente');
}

export async function listClientInvoices(clientId) {
  if (!clientId) throw new Error('Cliente requerido');
  const data = await request(`/api/cartera/clientes/${encodeURIComponent(clientId)}/facturas`, { cache: 'no-cache' }, 'No se pudieron cargar las facturas');
  return Array.isArray(data) ? data : [];
}

export async function getInvoice(invoiceId) {
  if (!invoiceId) throw new Error('Factura requerida');
  return request(`/api/cartera/facturas/${encodeURIComponent(invoiceId)}`, { cache: 'no-cache' }, 'No se pudo cargar la factura');
}

export async function createInvoice(clientId, payload) {
  if (!clientId) throw new Error('Cliente requerido');
  return request(`/api/cartera/clientes/${encodeURIComponent(clientId)}/facturas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }, 'No se pudo crear la factura');
}

export async function listBodegaOdooOrders({ search = '', limit = 20, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  qs.set('local', 'Bodega');
  qs.set('limit', String(limit || 20));
  qs.set('offset', String(offset || 0));
  if (String(search || '').trim()) {
    qs.set('search', String(search || '').trim());
  }
  const data = await request(`/api/odoo/orders?${qs.toString()}`, { cache: 'no-cache' }, 'No se pudieron cargar los pedidos de Bodega');
  return {
    total: Number(data?.total || 0),
    data: Array.isArray(data?.data) ? data.data : [],
  };
}

export async function updateInvoice(invoiceId, payload) {
  if (!invoiceId) throw new Error('Factura requerida');
  return request(`/api/cartera/facturas/${encodeURIComponent(invoiceId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }, 'No se pudo actualizar la factura');
}

export async function notifyInvoiceAbonos(invoiceId, payload) {
  if (!invoiceId) throw new Error('Factura requerida');
  return request(`/api/cartera/facturas/${encodeURIComponent(invoiceId)}/notificar-abonos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }, 'No se pudo enviar el detalle de abonos por WhatsApp');
}

export async function deleteInvoice(invoiceId) {
  if (!invoiceId) throw new Error('Factura requerida');
  return request(`/api/cartera/facturas/${encodeURIComponent(invoiceId)}`, { method: 'DELETE' }, 'No se pudo eliminar la factura');
}

export async function listInvoiceAbonos(invoiceId) {
  if (!invoiceId) throw new Error('Factura requerida');
  return request(`/api/cartera/facturas/${encodeURIComponent(invoiceId)}/abonos`, { cache: 'no-cache' }, 'No se pudieron cargar los abonos');
}

export async function getAbono(abonoId) {
  if (!abonoId) throw new Error('Abono requerido');
  return request(`/api/cartera/abonos/${encodeURIComponent(abonoId)}`, { cache: 'no-cache' }, 'No se pudo cargar el abono');
}

export async function uploadSupportImage(file) {
  if (!file) throw new Error('Archivo requerido');
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/external/upload', {
    method: 'POST',
    body: fd,
  });
  return handleJson(res, 'No se pudo subir la imagen');
}

export async function createAbono(payload) {
  if (!payload?.cliente_id) throw new Error('Cliente requerido');
  return request('/api/cartera/abonos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'No se pudo crear el abono');
}

export async function updateAbono(abonoId, payload) {
  if (!abonoId) throw new Error('Abono requerido');
  return request(`/api/cartera/abonos/${encodeURIComponent(abonoId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }, 'No se pudo actualizar el abono');
}

export async function deleteAbono(abonoId) {
  if (!abonoId) throw new Error('Abono requerido');
  return request(`/api/cartera/abonos/${encodeURIComponent(abonoId)}`, { method: 'DELETE' }, 'No se pudo eliminar el abono');
}
