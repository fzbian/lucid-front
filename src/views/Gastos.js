import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { apiFetch } from '../api';
import useTitle from '../useTitle';
import { formatCLP } from '../formatMoney';
import { useNotifications } from '../components/Notifications';

const DEFAULT_GASTO_IMAGE = 'https://rrimg.chinatownlogistic.com/public/uploads/384f24a9c175ff85b0504a03c6129c5d.jpg';

function getGastoImage(url) {
    const safe = String(url || '').trim();
    return safe || DEFAULT_GASTO_IMAGE;
}

function formatDateTime(value) {
    if (!value) return 'Sin fecha';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
    return parsed.toLocaleString('es-CL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function toDayKey(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function formatGastoType(value) {
    const safe = String(value || '').trim().toUpperCase();
    if (safe === 'GASTO_OPERATIVO') return 'Gasto Operativo';
    if (safe === 'GASTO_COMUN') return 'Gasto Comun';
    if (!safe) return 'Sin tipo';
    return safe
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function getTypeBadgeClass(value) {
    const safe = String(value || '').trim().toUpperCase();
    if (safe === 'GASTO_OPERATIVO') {
        return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    }
    if (safe === 'GASTO_COMUN') {
        return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    }
    return 'border-[var(--border-color)] bg-[var(--dark-color)] text-[var(--text-secondary-color)]';
}

export default function Gastos() {
    useTitle('Gastos Operativos · ATM Ricky Rich');

    const navigate = useNavigate();
    const { notify } = useNotifications();

    const [loading, setLoading] = useState(true);
    const [gastos, setGastos] = useState([]);
    const [selectedLocal, setSelectedLocal] = useState('all');
    const [query, setQuery] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [modalItem, setModalItem] = useState(null);

    const fetchGastos = useCallback(async () => {
        try {
            setLoading(true);
            const response = await apiFetch('/api/gastos', { cache: 'no-cache' });
            if (!response.ok) throw new Error('Error cargando gastos');

            const data = await response.json();
            const safe = Array.isArray(data) ? data : [];
            setGastos(safe);
        } catch (error) {
            console.error(error);
            notify({ type: 'error', message: 'No se pudieron cargar los gastos' });
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        fetchGastos();
    }, [fetchGastos]);

    const uniqueLocales = useMemo(() => {
        const values = gastos
            .map((item) => String(item?.local || '').trim())
            .filter(Boolean);
        return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'es'));
    }, [gastos]);

    useEffect(() => {
        if (selectedLocal === 'all') return;
        if (uniqueLocales.includes(selectedLocal)) return;
        setSelectedLocal('all');
    }, [selectedLocal, uniqueLocales]);

    const baseFilteredGastos = useMemo(() => {
        const q = query.trim().toLowerCase();
        const fromLimit = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
        const toLimit = toDate ? new Date(`${toDate}T23:59:59`) : null;

        return gastos
            .filter((item) => {
                const date = new Date(item?.fecha);
                if (fromLimit && !Number.isNaN(date.getTime()) && date < fromLimit) return false;
                if (toLimit && !Number.isNaN(date.getTime()) && date > toLimit) return false;

                if (!q) return true;
                const fields = [item?.motivo, item?.usuario, item?.local]
                    .map((value) => String(value || '').toLowerCase());
                return fields.some((value) => value.includes(q));
            })
            .sort((a, b) => new Date(b?.fecha).getTime() - new Date(a?.fecha).getTime());
    }, [gastos, query, fromDate, toDate]);

    const localCounts = useMemo(() => {
        const counts = {};
        baseFilteredGastos.forEach((item) => {
            const local = String(item?.local || '').trim() || 'Sin local';
            counts[local] = (counts[local] || 0) + 1;
        });
        return counts;
    }, [baseFilteredGastos]);

    const filteredGastos = useMemo(() => {
        if (selectedLocal === 'all') return baseFilteredGastos;
        return baseFilteredGastos.filter((item) => String(item?.local || '').trim() === selectedLocal);
    }, [baseFilteredGastos, selectedLocal]);

    const stats = useMemo(() => {
        const todayKey = toDayKey(new Date());

        let total = 0;
        let todayTotal = 0;
        let todayCount = 0;

        filteredGastos.forEach((item) => {
            const amount = Number(item?.monto) || 0;
            total += amount;

            if (toDayKey(item?.fecha) === todayKey) {
                todayTotal += amount;
                todayCount += 1;
            }
        });

        const count = filteredGastos.length;
        const average = count > 0 ? total / count : 0;
        const activeLocales = new Set(filteredGastos.map((item) => item?.local).filter(Boolean)).size;

        return {
            total,
            count,
            average,
            todayTotal,
            todayCount,
            activeLocales,
        };
    }, [filteredGastos]);

    const clearFilters = () => {
        setSelectedLocal('all');
        setQuery('');
        setFromDate('');
        setToDate('');
    };

    return (
        <Layout title="Gastos Operativos">
            <div className="view-enter view-enter-active space-y-5">
                <section className="rounded-2xl border border-[var(--border-color)] bg-[linear-gradient(135deg,rgba(113,75,103,0.28),rgba(17,24,39,0.95))] p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <h2 className="text-xl font-semibold text-[var(--text-color)]">Control de Gastos por Local</h2>
                            <p className="text-sm text-[var(--text-secondary-color)]">
                                Visualiza soportes, filtra por fechas/local y revisa rapidamente montos operativos.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={fetchGastos}
                                className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-color)] text-sm hover:bg-white/5 transition-colors"
                            >
                                Actualizar
                            </button>
                            <button
                                onClick={() => navigate('/cashout')}
                                className="px-3 py-2 rounded-lg bg-[var(--primary-color)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                            >
                                Nuevo gasto
                            </button>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                        <p className="text-xs text-[var(--text-secondary-color)]">Total filtrado</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--danger-color)]">{formatCLP(stats.total)}</p>
                    </article>
                    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                        <p className="text-xs text-[var(--text-secondary-color)]">Registros</p>
                        <p className="mt-1 text-lg font-semibold">{stats.count}</p>
                    </article>
                    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                        <p className="text-xs text-[var(--text-secondary-color)]">Promedio por gasto</p>
                        <p className="mt-1 text-lg font-semibold">{formatCLP(stats.average)}</p>
                    </article>
                    <article className="rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                        <p className="text-xs text-[var(--text-secondary-color)]">Hoy</p>
                        <p className="mt-1 text-lg font-semibold">{stats.todayCount} · {formatCLP(stats.todayTotal)}</p>
                    </article>
                </section>

                <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4 sm:p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                        <div className="xl:col-span-2">
                            <label className="text-xs text-[var(--text-secondary-color)]">Buscar</label>
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Motivo, usuario o local"
                                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-2 text-sm"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-[var(--text-secondary-color)]">Local</label>
                            <select
                                value={selectedLocal}
                                onChange={(event) => setSelectedLocal(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-2 text-sm"
                            >
                                <option value="all">Todos ({stats.activeLocales || uniqueLocales.length})</option>
                                {uniqueLocales.map((local) => (
                                    <option key={local} value={local}>{local}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs text-[var(--text-secondary-color)]">Desde</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(event) => setFromDate(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-2 text-sm"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-[var(--text-secondary-color)]">Hasta</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(event) => setToDate(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-2 text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        <button
                            onClick={() => setSelectedLocal('all')}
                            className={`px-3 py-1.5 rounded-full border text-xs whitespace-nowrap ${selectedLocal === 'all'
                                ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/15 text-[var(--primary-color)]'
                                : 'border-[var(--border-color)] bg-[var(--dark-color)] text-[var(--text-secondary-color)] hover:bg-white/5'
                                }`}
                        >
                            Todos ({baseFilteredGastos.length})
                        </button>
                        {uniqueLocales.map((local) => (
                            <button
                                key={local}
                                onClick={() => setSelectedLocal(local)}
                                className={`px-3 py-1.5 rounded-full border text-xs whitespace-nowrap ${selectedLocal === local
                                    ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/15 text-[var(--primary-color)]'
                                    : 'border-[var(--border-color)] bg-[var(--dark-color)] text-[var(--text-secondary-color)] hover:bg-white/5'
                                    }`}
                            >
                                {local} ({localCounts[local] || 0})
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <p className="text-xs text-[var(--text-secondary-color)]">
                            Mostrando {filteredGastos.length} gasto(s).
                        </p>
                        <button
                            onClick={clearFilters}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-xs hover:bg-white/5"
                        >
                            Limpiar filtros
                        </button>
                    </div>
                </section>

                {loading ? (
                    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-8 flex justify-center">
                        <span className="w-8 h-8 border-2 border-[var(--border-color)] border-t-[var(--text-color)] rounded-full animate-spin" />
                    </div>
                ) : filteredGastos.length === 0 ? (
                    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] px-6 py-12 text-center space-y-2">
                        <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]">receipt_long</span>
                        <p className="text-sm text-[var(--text-secondary-color)]">No hay gastos que coincidan con los filtros actuales.</p>
                    </div>
                ) : (
                    <section className="space-y-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                        {filteredGastos.map((item) => {
                            const imageUrl = getGastoImage(item?.imagen_url);

                            return (
                                <article key={item.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <button
                                            onClick={() => setModalItem({ ...item, imagen_url: imageUrl })}
                                            className="w-full sm:w-28 h-36 sm:h-28 rounded-xl overflow-hidden border border-[var(--border-color)] bg-[var(--dark-color)]"
                                        >
                                            <img
                                                src={imageUrl}
                                                alt={`Soporte gasto ${item.id}`}
                                                className="w-full h-full object-cover"
                                                onError={(event) => {
                                                    event.currentTarget.src = DEFAULT_GASTO_IMAGE;
                                                }}
                                            />
                                        </button>

                                        <div className="flex-1 min-w-0 space-y-3">
                                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-[var(--text-color)] truncate">{item.motivo || 'Sin motivo'}</p>
                                                    <p className="text-xs text-[var(--text-secondary-color)] mt-1">{formatDateTime(item.fecha)}</p>
                                                </div>
                                                <p className="text-lg font-bold text-[var(--danger-color)]">{formatCLP(item.monto)}</p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                                <div className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <span className="material-symbols-outlined !text-[16px] text-[var(--text-secondary-color)]">store</span>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Local</p>
                                                        <p className="truncate text-[var(--text-color)]">{item.local || 'N/A'}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-2.5 py-2">
                                                    <span className="material-symbols-outlined !text-[16px] text-[var(--text-secondary-color)]">person</span>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary-color)]">Usuario</p>
                                                        <p className="truncate text-[var(--text-color)]">{item.usuario || 'N/A'}</p>
                                                    </div>
                                                </div>

                                                <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${getTypeBadgeClass(item.tipo)}`}>
                                                    <span className="material-symbols-outlined !text-[16px]">sell</span>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] uppercase tracking-wide opacity-80">Tipo</p>
                                                        <p className="truncate">{formatGastoType(item.tipo)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                )}
            </div>

            {modalItem && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setModalItem(null)}
                >
                    <div
                        className="w-full max-w-3xl rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] overflow-hidden"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
                            <div>
                                <p className="font-semibold">Soporte de gasto #{modalItem.id}</p>
                                <p className="text-xs text-[var(--text-secondary-color)]">{formatDateTime(modalItem.fecha)} · {modalItem.local || 'N/A'}</p>
                            </div>
                            <button
                                onClick={() => setModalItem(null)}
                                className="p-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <img
                                src={getGastoImage(modalItem.imagen_url)}
                                alt={`Soporte gasto ${modalItem.id}`}
                                className="w-full max-h-[65vh] object-contain rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)]"
                                onError={(event) => {
                                    event.currentTarget.src = DEFAULT_GASTO_IMAGE;
                                }}
                            />

                            <div className="text-sm text-[var(--text-secondary-color)]">
                                <p><span className="text-[var(--text-color)] font-medium">Motivo:</span> {modalItem.motivo || 'Sin motivo'}</p>
                                <p><span className="text-[var(--text-color)] font-medium">Monto:</span> {formatCLP(modalItem.monto)}</p>
                                <p><span className="text-[var(--text-color)] font-medium">Usuario:</span> {modalItem.usuario || 'N/A'}</p>
                                <p><span className="text-[var(--text-color)] font-medium">Tipo:</span> {formatGastoType(modalItem.tipo)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
