import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import useTitle from '../useTitle';
import { apiFetch } from '../api';
import { formatCLP } from '../formatMoney';
import { useNotifications } from '../components/Notifications';

const LOCALS_PER_PAGE = 12;
const SESSIONS_PER_PAGE = 20;
const ORDERS_PER_PAGE = 25;

function formatDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Sin fecha';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function buildCardKey(card) {
    const localID = Number(card?.local_id) || 0;
    const localName = String(card?.local_name || '').trim();
    return `${localID}::${localName}`;
}

function getStateTone(state) {
    const safe = String(state || '').toLowerCase();
    if (safe === 'abierta') {
        return {
            label: 'Abierta',
            className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
            icon: 'radio_button_checked',
        };
    }
    if (safe === 'abriendo') {
        return {
            label: 'Abriendo',
            className: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
            icon: 'pending',
        };
    }
    if (safe === 'cerrada') {
        return {
            label: 'Cerrada',
            className: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
            icon: 'lock',
        };
    }
    return {
        label: safe ? safe : 'Sin estado',
        className: 'border-[var(--border-color)] bg-white/5 text-[var(--text-secondary-color)]',
        icon: 'help',
    };
}

function getOrderStateTone(state) {
    const safe = String(state || '').toLowerCase();
    if (safe === 'paid' || safe === 'done' || safe === 'invoiced') {
        return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
    }
    return 'border-[var(--border-color)] bg-white/5 text-[var(--text-secondary-color)]';
}

function formatQty(value) {
    const qty = Number(value);
    if (!Number.isFinite(qty)) return '0';
    return qty.toLocaleString('es-CO', {
        minimumFractionDigits: Number.isInteger(qty) ? 0 : 2,
        maximumFractionDigits: 3,
    });
}

function formatPercent(value) {
    const pct = Number(value);
    if (!Number.isFinite(pct)) return '0%';
    return `${pct.toLocaleString('es-CO', {
        minimumFractionDigits: Number.isInteger(pct) ? 0 : 2,
        maximumFractionDigits: 2,
    })}%`;
}

export default function Pedidos() {
    useTitle('Pedidos · ATM Ricky Rich');
    const { notify } = useNotifications();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [cards, setCards] = useState([]);
    const [totals, setTotals] = useState({
        total_pos: 0,
        total_sessions: 0,
        total_orders: 0,
        amount_total: 0,
        amount_tax: 0,
    });
    const [lastUpdated, setLastUpdated] = useState(null);

    const [localsPage, setLocalsPage] = useState(1);
    const [selectedLocalKey, setSelectedLocalKey] = useState('');

    const [sessionsPage, setSessionsPage] = useState(1);
    const [selectedSession, setSelectedSession] = useState(null);

    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersError, setOrdersError] = useState('');
    const [orders, setOrders] = useState([]);
    const [ordersTotal, setOrdersTotal] = useState(0);
    const [ordersPage, setOrdersPage] = useState(1);
    const [refundingOrderID, setRefundingOrderID] = useState(0);

    const resetOrdersState = useCallback(() => {
        setOrders([]);
        setOrdersError('');
        setOrdersTotal(0);
        setOrdersPage(1);
    }, []);

    const loadOverview = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            params.set('limit', '30000');

            const res = await apiFetch(`/api/odoo/orders/overview?${params.toString()}`, { cache: 'no-cache' });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload?.error || 'No se pudo cargar el resumen de pedidos');
            }

            const payload = await res.json();
            const nextCards = Array.isArray(payload?.data) ? payload.data : [];
            setCards(nextCards);
            setTotals({
                total_pos: Number(payload?.totals?.total_pos) || nextCards.length,
                total_sessions: Number(payload?.totals?.total_sessions) || 0,
                total_orders: Number(payload?.totals?.total_orders) || 0,
                amount_total: Number(payload?.totals?.amount_total) || 0,
                amount_tax: Number(payload?.totals?.amount_tax) || 0,
            });
            setLastUpdated(new Date());
        } catch (fetchError) {
            const message = String(fetchError?.message || 'Error cargando pedidos');
            setError(message);
            notify({ type: 'error', message });
        } finally {
            setLoading(false);
        }
    }, [notify]);

    const loadOrdersBySession = useCallback(async (sessionID, page) => {
        if (!sessionID || sessionID <= 0) {
            setOrders([]);
            setOrdersTotal(0);
            setOrdersError('Esta sesión no tiene un ID válido para consultar pedidos.');
            return;
        }

        setOrdersLoading(true);
        setOrdersError('');
        try {
            const params = new URLSearchParams();
            params.set('session_id', String(sessionID));
            params.set('limit', String(ORDERS_PER_PAGE));
            params.set('offset', String((page - 1) * ORDERS_PER_PAGE));

            const res = await apiFetch(`/api/odoo/orders?${params.toString()}`, { cache: 'no-cache' });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload?.error || 'No se pudieron cargar los pedidos de la sesión');
            }

            const payload = await res.json();
            setOrders(Array.isArray(payload?.data) ? payload.data : []);
            setOrdersTotal(Number(payload?.total) || 0);
        } catch (fetchError) {
            const message = String(fetchError?.message || 'Error cargando pedidos de la sesión');
            setOrdersError(message);
            notify({ type: 'error', message });
        } finally {
            setOrdersLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        loadOverview();
    }, [loadOverview]);

    const sortedLocals = useMemo(() => {
        const arr = Array.isArray(cards) ? [...cards] : [];
        arr.sort((a, b) => String(a?.local_name || '').localeCompare(String(b?.local_name || ''), 'es'));
        return arr;
    }, [cards]);

    const selectedLocal = useMemo(
        () => sortedLocals.find((card) => buildCardKey(card) === selectedLocalKey) || null,
        [sortedLocals, selectedLocalKey]
    );

    useEffect(() => {
        if (!selectedLocalKey) return;
        const exists = sortedLocals.some((card) => buildCardKey(card) === selectedLocalKey);
        if (!exists) {
            setSelectedLocalKey('');
            setSelectedSession(null);
            resetOrdersState();
        }
    }, [selectedLocalKey, sortedLocals, resetOrdersState]);

    const localSessions = useMemo(() => {
        if (!selectedLocal) return [];
        return Array.isArray(selectedLocal?.sessions) ? selectedLocal.sessions : [];
    }, [selectedLocal]);

    const totalLocalPages = Math.max(1, Math.ceil(sortedLocals.length / LOCALS_PER_PAGE));
    const totalSessionPages = Math.max(1, Math.ceil(localSessions.length / SESSIONS_PER_PAGE));
    const totalOrderPages = Math.max(1, Math.ceil(ordersTotal / ORDERS_PER_PAGE));

    useEffect(() => {
        if (localsPage > totalLocalPages) {
            setLocalsPage(totalLocalPages);
        }
    }, [localsPage, totalLocalPages]);

    useEffect(() => {
        if (sessionsPage > totalSessionPages) {
            setSessionsPage(totalSessionPages);
        }
    }, [sessionsPage, totalSessionPages]);

    useEffect(() => {
        if (ordersPage > totalOrderPages) {
            setOrdersPage(totalOrderPages);
        }
    }, [ordersPage, totalOrderPages]);

    const visibleLocals = useMemo(() => {
        const from = (localsPage - 1) * LOCALS_PER_PAGE;
        return sortedLocals.slice(from, from + LOCALS_PER_PAGE);
    }, [sortedLocals, localsPage]);

    const visibleSessions = useMemo(() => {
        const from = (sessionsPage - 1) * SESSIONS_PER_PAGE;
        return localSessions.slice(from, from + SESSIONS_PER_PAGE);
    }, [localSessions, sessionsPage]);

    useEffect(() => {
        if (!selectedSession) return;
        loadOrdersBySession(Number(selectedSession?.session_id) || 0, ordersPage);
    }, [selectedSession, ordersPage, loadOrdersBySession]);

    const openLocal = (card) => {
        setSelectedLocalKey(buildCardKey(card));
        setSessionsPage(1);
        setSelectedSession(null);
        resetOrdersState();
    };

    const backToLocals = () => {
        setSelectedLocalKey('');
        setSessionsPage(1);
        setSelectedSession(null);
        resetOrdersState();
    };

    const openSession = (session) => {
        setSelectedSession({
            ...session,
            local_id: selectedLocal?.local_id || 0,
            local_name: selectedLocal?.local_name || 'Sin local',
        });
        resetOrdersState();
    };

    const closeSession = () => {
        setSelectedSession(null);
        resetOrdersState();
    };

    const handleRefundOrder = useCallback(async (order) => {
        const orderID = Number(order?.id) || 0;
        if (orderID <= 0) {
            notify({ type: 'warning', message: 'Pedido inválido para reembolso.' });
            return;
        }

        const orderName = String(order?.name || `#${orderID}`);
        const total = formatCLP(order?.amount_total || 0);
        const state = String(order?.state || '').toUpperCase();
        const confirmMessage = [
            `Confirmar reembolso completo del pedido ${orderName}.`,
            '',
            `Estado actual: ${state || '-'}`,
            `Total a reembolsar: ${total}`,
            '',
            'Esta acción genera un pedido de reembolso completo en Odoo usando el mismo método de pago.',
            'Solo continúa si ya validaste que corresponde devolver el 100% del pedido.',
        ].join('\n');

        if (!window.confirm(confirmMessage)) {
            return;
        }

        setRefundingOrderID(orderID);
        try {
            const res = await apiFetch(`/api/odoo/orders/${orderID}/refund`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ confirm: true }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || 'No se pudo generar el reembolso');
            }

            const refundID = Number(payload?.data?.refund_order_id) || 0;
            const refundName = String(payload?.data?.refund_order_name || '').trim();
            const label = refundName || (refundID > 0 ? `#${refundID}` : 'generado');

            notify({ type: 'success', message: `Reembolso creado correctamente (${label}).` });
            await loadOrdersBySession(Number(selectedSession?.session_id) || 0, ordersPage);
        } catch (refundError) {
            notify({ type: 'error', message: String(refundError?.message || 'Error generando reembolso') });
        } finally {
            setRefundingOrderID(0);
        }
    }, [loadOrdersBySession, notify, ordersPage, selectedSession]);

    return (
        <Layout title="Pedidos">
            <div className="space-y-5">
                <section className="rounded-2xl border border-[var(--border-color)] bg-[linear-gradient(135deg,rgba(23,81,122,0.3),rgba(18,23,30,0.96))] p-5 sm:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                            <h2 className="text-xl font-semibold">Pedidos por Local</h2>
                            <p className="text-sm text-[var(--text-secondary-color)]">
                                Flujo de navegación: Locales, luego sesiones del local y finalmente pedidos de la sesión.
                            </p>
                            {lastUpdated && (
                                <p className="text-xs text-[var(--text-secondary-color)]">
                                    Última actualización: {lastUpdated.toLocaleString('es-CO')}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={loadOverview}
                                className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-color)] text-sm hover:bg-white/5 transition-colors"
                            >
                                Actualizar
                            </button>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                        <p className="text-xs text-[var(--text-secondary-color)]">Puntos de venta</p>
                        <p className="mt-1 text-lg font-semibold">{totals.total_pos}</p>
                    </article>
                    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                        <p className="text-xs text-[var(--text-secondary-color)]">Sesiones</p>
                        <p className="mt-1 text-lg font-semibold">{totals.total_sessions}</p>
                    </article>
                    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                        <p className="text-xs text-[var(--text-secondary-color)]">Pedidos</p>
                        <p className="mt-1 text-lg font-semibold">{totals.total_orders}</p>
                    </article>
                    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                        <p className="text-xs text-[var(--text-secondary-color)]">Monto total</p>
                        <p className="mt-1 text-lg font-semibold">{formatCLP(totals.amount_total)}</p>
                    </article>
                    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                        <p className="text-xs text-[var(--text-secondary-color)]">IVA total</p>
                        <p className="mt-1 text-lg font-semibold">{formatCLP(totals.amount_tax)}</p>
                    </article>
                </section>

                {loading ? (
                    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-10 flex items-center justify-center">
                        <span className="w-9 h-9 border-2 border-[var(--border-color)] border-t-[var(--text-color)] rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 space-y-2">
                        <p className="font-semibold text-red-300">No se pudo cargar la información de pedidos.</p>
                        <p className="text-sm text-red-200/90">{error}</p>
                        <button
                            onClick={loadOverview}
                            className="px-3 py-2 rounded-lg border border-red-300/40 text-sm hover:bg-red-400/10 transition-colors"
                        >
                            Reintentar
                        </button>
                    </div>
                ) : selectedSession ? (
                    <section className="space-y-4">
                        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={closeSession}
                                        className="h-9 w-9 rounded-lg border border-[var(--border-color)] flex items-center justify-center hover:bg-white/5 transition-colors"
                                        title="Volver a sesiones"
                                    >
                                        <span className="material-symbols-outlined !text-[20px]">arrow_back</span>
                                    </button>
                                    <div>
                                        <p className="text-lg font-semibold">
                                            {selectedSession?.session_name || `Sesión #${selectedSession?.session_id || '-'}`}
                                        </p>
                                        <p className="text-xs text-[var(--text-secondary-color)]">
                                            Local: {selectedSession?.local_name || 'Sin local'} · ID sesión: {selectedSession?.session_id || '-'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${getStateTone(selectedSession?.session_state).className}`}>
                                        <span className="material-symbols-outlined !text-[14px]">{getStateTone(selectedSession?.session_state).icon}</span>
                                        {getStateTone(selectedSession?.session_state).label}
                                    </span>
                                    <button
                                        onClick={() => loadOrdersBySession(Number(selectedSession?.session_id) || 0, ordersPage)}
                                        className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm hover:bg-white/5 transition-colors"
                                    >
                                        Actualizar pedidos
                                    </button>
                                </div>
                            </div>
                        </div>

                        {ordersLoading ? (
                            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-10 flex items-center justify-center">
                                <span className="w-9 h-9 border-2 border-[var(--border-color)] border-t-[var(--text-color)] rounded-full animate-spin" />
                            </div>
                        ) : ordersError ? (
                            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 space-y-2">
                                <p className="font-semibold text-red-300">No se pudo cargar el detalle de pedidos.</p>
                                <p className="text-sm text-red-200/90">{ordersError}</p>
                            </div>
                        ) : orders.length === 0 ? (
                            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] px-6 py-10 text-center">
                                <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]">receipt_long</span>
                                <p className="text-sm text-[var(--text-secondary-color)] mt-2">
                                    No hay pedidos disponibles para esta sesión.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {orders.map((order) => {
                                    const lines = Array.isArray(order?.lines_detail) ? order.lines_detail : [];
                                    const payments = Array.isArray(order?.payments_detail) ? order.payments_detail : [];
                                    const productsSubtotal = lines.reduce((acc, line) => acc + (Number(line?.subtotal) || 0), 0);
                                    const productsTax = lines.reduce((acc, line) => acc + (Number(line?.tax_amount) || 0), 0);
                                    const productsTotal = lines.reduce((acc, line) => acc + (Number(line?.subtotal_incl) || 0), 0);
                                    const subtotal = Number(order?.amount_subtotal) || Math.max(0, (Number(order?.amount_total) || 0) - (Number(order?.amount_tax) || 0));
                                    const tax = Number(order?.amount_tax) || 0;
                                    const total = Number(order?.amount_total) || 0;
                                    const paid = Number(order?.amount_paid) || 0;
                                    const returned = Number(order?.amount_return) || 0;
                                    const margin = Number(order?.margin) || 0;
                                    const paymentsTotal = Number(order?.payments_total) || payments.reduce((acc, payment) => acc + (Number(payment?.amount) || 0), 0);
                                    const itemsCount = Number(order?.items_count) || lines.length;
                                    const totalQty = Number(order?.total_qty) || lines.reduce((acc, line) => acc + (Number(line?.qty) || 0), 0);
                                    const state = String(order?.state || '').toLowerCase();
                                    const inferredRefundByLines = lines.some((line) => Number(line?.qty) < 0 || Number(line?.subtotal_incl) < 0);
                                    const isRefundOrder = Boolean(order?.is_refund_order) || total < 0 || paid < 0 || inferredRefundByLines;
                                    const refundableState = state === 'paid' || state === 'done' || state === 'invoiced';
                                    const hasPositiveTotal = total > 0;
                                    const hasRefundableLines = order?.has_refundable_lines !== false;
                                    const isRefunded = order?.is_refunded === true;
                                    const canRefund = !isRefundOrder && refundableState && hasPositiveTotal && hasRefundableLines && !isRefunded;
                                    const isRefunding = refundingOrderID === (Number(order?.id) || 0);

                                    return (
                                        <article
                                            key={`${order?.id || ''}-${order?.name || ''}`}
                                            className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4 space-y-4"
                                        >
                                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                                <div className="space-y-1">
                                                    <p className="font-semibold text-sm">
                                                        {order?.name || `Pedido #${order?.id || '-'}`}
                                                    </p>
                                                    <p className="text-xs text-[var(--text-secondary-color)]">
                                                        ID: {order?.id || '-'} · Referencia POS: {order?.pos_reference || '-'} · Fecha: {formatDateTime(order?.date_order_iso || order?.date_order_raw)}
                                                    </p>
                                                    <p className="text-xs text-[var(--text-secondary-color)]">
                                                        {order?.customer_name ? `Cliente: ${order.customer_name}` : 'Cliente no registrado'} · {order?.cashier_name ? `Cajero: ${order.cashier_name}` : 'Cajero no disponible'}
                                                    </p>
                                                </div>
                                                <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${getOrderStateTone(order?.state)}`}>
                                                    <span className="material-symbols-outlined !text-[13px]">receipt</span>
                                                    {order?.state || 'sin estado'}
                                                </span>
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                <p className="text-xs text-[var(--text-secondary-color)]">
                                                    Reembolso: {isRefundOrder ? 'este pedido ya es de reembolso' : (isRefunded || !hasRefundableLines ? 'completo aplicado' : 'disponible')}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    {isRefundOrder && (
                                                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-sky-500/40 bg-sky-500/15 text-sky-200">
                                                            <span className="material-symbols-outlined !text-[13px]">swap_horiz</span>
                                                            Pedido de reembolso
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => handleRefundOrder(order)}
                                                        disabled={!canRefund || isRefunding}
                                                        className="w-full sm:w-auto px-3 py-2 rounded-lg border border-red-400/40 bg-red-500/15 text-red-200 text-sm font-medium hover:bg-red-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={canRefund ? 'Crear reembolso completo de este pedido' : (isRefundOrder ? 'Este pedido ya es un reembolso' : 'Este pedido no cumple condiciones para reembolso automático')}
                                                    >
                                                        {isRefundOrder ? 'Pedido de reembolso' : (isRefunding ? 'Procesando reembolso...' : 'Reembolsar pedido completo')}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 text-xs">
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Subtotal</p>
                                                    <p className="font-semibold">{formatCLP(subtotal)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Impuestos</p>
                                                    <p className="font-semibold">{formatCLP(tax)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Total</p>
                                                    <p className="font-semibold">{formatCLP(total)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Pagado</p>
                                                    <p className="font-semibold">{formatCLP(paid)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Vuelto</p>
                                                    <p className="font-semibold">{formatCLP(returned)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Margen</p>
                                                    <p className="font-semibold">{formatCLP(margin)}</p>
                                                </div>
                                            </div>

                                            <section className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] p-3 space-y-3">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary-color)]">
                                                        Productos del pedido
                                                    </p>
                                                    <p className="text-xs text-[var(--text-secondary-color)]">
                                                        {itemsCount} línea(s) · {formatQty(totalQty)} unidades
                                                    </p>
                                                </div>

                                                {lines.length === 0 ? (
                                                    <p className="text-xs text-[var(--text-secondary-color)]">No se encontró detalle de productos para este pedido.</p>
                                                ) : (
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full min-w-[760px] text-xs">
                                                            <thead>
                                                                <tr className="text-left text-[var(--text-secondary-color)] border-b border-[var(--border-color)]">
                                                                    <th className="py-2 pr-2 font-medium">Producto</th>
                                                                    <th className="py-2 pr-2 font-medium">Cant.</th>
                                                                    <th className="py-2 pr-2 font-medium">P. Unit.</th>
                                                                    <th className="py-2 pr-2 font-medium">Desc.</th>
                                                                    <th className="py-2 pr-2 font-medium">Subtotal</th>
                                                                    <th className="py-2 pr-2 font-medium">Impuesto</th>
                                                                    <th className="py-2 font-medium">Total línea</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {lines.map((line) => (
                                                                    <tr key={line?.id || `${order?.id || ''}-${line?.product_id || ''}`} className="border-b border-[var(--border-color)]/60">
                                                                        <td className="py-2 pr-2">
                                                                            <p className="font-medium">{line?.product_name || 'Producto sin nombre'}</p>
                                                                            <p className="text-[10px] text-[var(--text-secondary-color)]">ID: {line?.product_id || '-'}</p>
                                                                        </td>
                                                                        <td className="py-2 pr-2">{formatQty(line?.qty || 0)}</td>
                                                                        <td className="py-2 pr-2">{formatCLP(line?.price_unit || 0)}</td>
                                                                        <td className="py-2 pr-2">{formatPercent(line?.discount || 0)}</td>
                                                                        <td className="py-2 pr-2">{formatCLP(line?.subtotal || 0)}</td>
                                                                        <td className="py-2 pr-2">{formatCLP(line?.tax_amount || 0)}</td>
                                                                        <td className="py-2 font-semibold">{formatCLP(line?.subtotal_incl || 0)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                            <tfoot>
                                                                <tr>
                                                                    <td className="pt-2 text-[var(--text-secondary-color)]" colSpan={4}>Totales calculados por líneas</td>
                                                                    <td className="pt-2 font-semibold">{formatCLP(productsSubtotal)}</td>
                                                                    <td className="pt-2 font-semibold">{formatCLP(productsTax)}</td>
                                                                    <td className="pt-2 font-semibold">{formatCLP(productsTotal)}</td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                )}
                                            </section>

                                            <section className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] p-3 space-y-2">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary-color)]">
                                                        Pagos del pedido
                                                    </p>
                                                    <p className="text-xs text-[var(--text-secondary-color)]">
                                                        {payments.length} pago(s) · Total pagos: {formatCLP(paymentsTotal)}
                                                    </p>
                                                </div>

                                                {payments.length === 0 ? (
                                                    <p className="text-xs text-[var(--text-secondary-color)]">No se encontraron pagos detallados para este pedido.</p>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                                        {payments.map((payment) => (
                                                            <div key={payment?.id || `${order?.id || ''}-payment`} className="rounded-lg border border-[var(--border-color)] bg-[var(--card-color)] px-2.5 py-2">
                                                                <p className="font-medium">{payment?.payment_method || 'Método no disponible'}</p>
                                                                <p className="text-[var(--text-secondary-color)]">
                                                                    Fecha: {formatDateTime(payment?.payment_date_iso || payment?.payment_date_raw)}
                                                                </p>
                                                                <p className="font-semibold mt-1">{formatCLP(payment?.amount || 0)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </section>

                                            {(order?.note || order?.invoice_name || order?.currency_name) && (
                                                <section className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] p-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Moneda</p>
                                                        <p className="font-semibold">{order?.currency_name || '-'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Factura</p>
                                                        <p className="font-semibold">{order?.invoice_name || `#${order?.invoice_id || '-'}`}</p>
                                                    </div>
                                                    <div className="md:col-span-1">
                                                        <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Nota</p>
                                                        <p className="font-semibold">{order?.note || '-'}</p>
                                                    </div>
                                                </section>
                                            )}

                                            <details className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-2">
                                                <summary className="cursor-pointer text-xs text-[var(--text-secondary-color)]">
                                                    Ver datos técnicos (JSON completo)
                                                </summary>
                                                <pre className="mt-2 text-[11px] overflow-auto whitespace-pre-wrap break-words">
                                                    {JSON.stringify({
                                                        ...(order?.raw || {}),
                                                        lines_detail: order?.lines_detail || [],
                                                        payments_detail: order?.payments_detail || [],
                                                        amount_subtotal: order?.amount_subtotal || 0,
                                                        payments_total: order?.payments_total || 0,
                                                        total_qty: order?.total_qty || 0,
                                                        items_count: order?.items_count || 0,
                                                    }, null, 2)}
                                                </pre>
                                            </details>
                                        </article>
                                    );
                                })}
                            </div>
                        )}

                        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-xs text-[var(--text-secondary-color)]">
                                Página {ordersPage} de {totalOrderPages} · Total pedidos: {ordersTotal}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setOrdersPage((page) => Math.max(1, page - 1))}
                                    disabled={ordersPage <= 1 || ordersLoading}
                                    className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
                                >
                                    Anterior
                                </button>
                                <button
                                    onClick={() => setOrdersPage((page) => Math.min(totalOrderPages, page + 1))}
                                    disabled={ordersPage >= totalOrderPages || ordersLoading}
                                    className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    </section>
                ) : selectedLocal ? (
                    <section className="space-y-4">
                        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={backToLocals}
                                        className="h-9 w-9 rounded-lg border border-[var(--border-color)] flex items-center justify-center hover:bg-white/5 transition-colors"
                                        title="Volver a locales"
                                    >
                                        <span className="material-symbols-outlined !text-[20px]">arrow_back</span>
                                    </button>
                                    <div>
                                        <h3 className="text-lg font-semibold">{selectedLocal?.local_name || 'Sin local'}</h3>
                                        <p className="text-xs text-[var(--text-secondary-color)]">
                                            {selectedLocal?.sessions_count || 0} sesiones · {selectedLocal?.orders_count || 0} pedidos
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm font-semibold">{formatCLP(selectedLocal?.amount_total || 0)}</p>
                            </div>
                        </div>

                        {visibleSessions.length === 0 ? (
                            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] px-6 py-10 text-center">
                                <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]">receipt_long</span>
                                <p className="text-sm text-[var(--text-secondary-color)] mt-2">No hay sesiones para este local.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {visibleSessions.map((session) => {
                                    const tone = getStateTone(session?.session_state);
                                    const validSessionID = (Number(session?.session_id) || 0) > 0;
                                    return (
                                        <article
                                            key={`${session?.session_id}-${session?.session_name || ''}`}
                                            className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4"
                                        >
                                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                                <div className="space-y-1">
                                                    <p className="font-semibold text-sm">
                                                        {session?.session_name || `Sesión #${session?.session_id || '-'}`}
                                                    </p>
                                                    <p className="text-xs text-[var(--text-secondary-color)]">
                                                        ID sesión: {session?.session_id || '-'} · Último pedido: {formatDateTime(session?.last_order_iso)}
                                                    </p>
                                                </div>
                                                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${tone.className}`}>
                                                    <span className="material-symbols-outlined !text-[14px]">{tone.icon}</span>
                                                    {tone.label}
                                                </span>
                                            </div>

                                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2 text-xs">
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="uppercase tracking-wide text-[10px] text-[var(--text-secondary-color)]">Pedidos</p>
                                                    <p className="font-semibold">{session?.orders_count || 0}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="uppercase tracking-wide text-[10px] text-[var(--text-secondary-color)]">Total sesión</p>
                                                    <p className="font-semibold">{formatCLP(session?.amount_total || 0)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="uppercase tracking-wide text-[10px] text-[var(--text-secondary-color)]">IVA</p>
                                                    <p className="font-semibold">{formatCLP(session?.amount_tax || 0)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="uppercase tracking-wide text-[10px] text-[var(--text-secondary-color)]">Ticket promedio</p>
                                                    <p className="font-semibold">{formatCLP(session?.ticket_promedio || 0)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="uppercase tracking-wide text-[10px] text-[var(--text-secondary-color)]">Inicio</p>
                                                    <p className="font-semibold">{formatDateTime(session?.start_at_iso)}</p>
                                                </div>
                                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <p className="uppercase tracking-wide text-[10px] text-[var(--text-secondary-color)]">Cierre</p>
                                                    <p className="font-semibold">{formatDateTime(session?.stop_at_iso)}</p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => openSession(session)}
                                                disabled={!validSessionID}
                                                className="mt-3 w-full sm:w-auto px-3 py-2 rounded-lg bg-[var(--primary-color)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {validSessionID ? 'Ver pedidos de la sesión' : 'Sesión sin ID válido'}
                                            </button>
                                        </article>
                                    );
                                })}
                            </div>
                        )}

                        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-xs text-[var(--text-secondary-color)]">
                                Página {sessionsPage} de {totalSessionPages} · Total sesiones: {localSessions.length}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSessionsPage((page) => Math.max(1, page - 1))}
                                    disabled={sessionsPage <= 1}
                                    className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
                                >
                                    Anterior
                                </button>
                                <button
                                    onClick={() => setSessionsPage((page) => Math.min(totalSessionPages, page + 1))}
                                    disabled={sessionsPage >= totalSessionPages}
                                    className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    </section>
                ) : visibleLocals.length === 0 ? (
                    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] px-6 py-12 text-center space-y-2">
                        <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]">storefront</span>
                        <p className="text-sm text-[var(--text-secondary-color)]">No hay puntos de venta disponibles.</p>
                    </div>
                ) : (
                    <section className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <p className="text-sm">Selecciona un punto de venta para ver sus sesiones.</p>
                            <p className="text-xs text-[var(--text-secondary-color)]">
                                Página {localsPage} de {totalLocalPages} · Total locales: {sortedLocals.length}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {visibleLocals.map((card) => (
                                <article
                                    key={buildCardKey(card)}
                                    className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4 flex flex-col gap-3"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-11 w-11 rounded-xl bg-[var(--dark-color)] border border-[var(--border-color)] flex items-center justify-center">
                                                <span className="material-symbols-outlined text-[var(--primary-color)]">storefront</span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold truncate">{card.local_name || 'Sin local'}</p>
                                                <p className="text-xs text-[var(--text-secondary-color)]">
                                                    Último pedido: {formatDateTime(card.last_order_iso)}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border ${card.open_sessions > 0
                                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                            : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                                            }`}>
                                            <span className="material-symbols-outlined !text-[13px]">{card.open_sessions > 0 ? 'bolt' : 'schedule'}</span>
                                            {card.open_sessions > 0 ? `${card.open_sessions} abierta(s)` : 'Sin sesiones abiertas'}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                            <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Sesiones</p>
                                            <p className="font-semibold">{card.sessions_count || 0}</p>
                                        </div>
                                        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                            <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Pedidos</p>
                                            <p className="font-semibold">{card.orders_count || 0}</p>
                                        </div>
                                        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2 col-span-2">
                                            <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Facturación</p>
                                            <p className="font-semibold">{formatCLP(card.amount_total || 0)}</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => openLocal(card)}
                                        className="mt-auto w-full py-2 rounded-lg bg-[var(--primary-color)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                                    >
                                        Ver sesiones del local
                                    </button>
                                </article>
                            ))}
                        </div>

                        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-xs text-[var(--text-secondary-color)]">
                                Página {localsPage} de {totalLocalPages}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setLocalsPage((page) => Math.max(1, page - 1))}
                                    disabled={localsPage <= 1}
                                    className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
                                >
                                    Anterior
                                </button>
                                <button
                                    onClick={() => setLocalsPage((page) => Math.min(totalLocalPages, page + 1))}
                                    disabled={localsPage >= totalLocalPages}
                                    className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </Layout>
    );
}
