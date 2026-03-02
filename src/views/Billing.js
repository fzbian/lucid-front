import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { apiFetch } from '../api';
import { formatCLP } from '../formatMoney';
import { useNotifications } from '../components/Notifications';
import { clearBillingDraft, getBillingDraft } from '../utils/billingDraft';

const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const esMonths = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const BILLING_STEP_LABELS = {
    1: 'Gastos Fijos',
    2: 'Gastos Variables',
    3: 'Resumen Financiero',
    4: 'Confirmar',
};

export default function Billing() {
    const { notify } = useNotifications();
    const navigate = useNavigate();
    const [year, setYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState({});
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const idx = new Date().getMonth();
        return esMonths[idx];
    });
    const [showAllMonths, setShowAllMonths] = useState(false);
    const [billingStatus, setBillingStatus] = useState([]);
    const [deleteLoading, setDeleteLoading] = useState(null);
    const [resetDraftFlags, setResetDraftFlags] = useState({});
    const [resettingMonthKey, setResettingMonthKey] = useState(null);
    const [billingConfigs, setBillingConfigs] = useState([]);
    const [showLocaleConfig, setShowLocaleConfig] = useState(false);
    const [localeDraft, setLocaleDraft] = useState({});
    const [savingLocaleConfig, setSavingLocaleConfig] = useState(false);

    const fetchBilling = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/odoo/billing?year=${year}`);
            if (res.ok) {
                const json = await res.json();
                setData(json || {});
            } else {
                const err = await res.json();
                notify({ type: 'error', message: err.error || 'Error cargando facturación' });
            }
        } catch (error) {
            console.error(error);
            notify({ type: 'error', message: 'Error de conexión' });
        } finally {
            setLoading(false);
        }
    }, [notify, year]);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/billing/status?year=${year}`);
            if (res.ok) {
                const json = await res.json();
                setBillingStatus(json || []);
            }
        } catch (e) {
            console.error(e);
        }
    }, [year]);

    const fetchBillingConfigs = useCallback(async () => {
        try {
            const res = await apiFetch('/api/billing/configs');
            if (res.ok) {
                const json = await res.json();
                setBillingConfigs(Array.isArray(json) ? json : []);
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    const handleDeleteReport = async (monthIdx) => {
        const monthNum = monthIdx + 1;
        const label = esMonths[monthIdx];
        if (!window.confirm(`¿Eliminar informe de ${label} ${year}?\n\nEsto revertirá las comisiones ya agregadas a pagos de nómina de este mes.`)) return;
        setDeleteLoading(monthNum);
        try {
            const res = await apiFetch(`/api/billing/report?year=${year}&month=${monthNum}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error eliminando informe');
            }
            const d = await res.json();
            await fetchStatus();
            const msg = d.payments_reverted > 0
                ? `Informe de ${label} eliminado. ${d.payments_reverted} pago(s) de nómina revertidos.`
                : `Informe de ${label} eliminado exitosamente.`;
            notify({ type: 'success', message: msg });
        } catch (e) {
            notify({ type: 'error', message: e.message });
        } finally {
            setDeleteLoading(null);
        }
    };

    useEffect(() => {
        fetchBilling();
        fetchStatus();
        fetchBillingConfigs();
    }, [fetchBilling, fetchStatus, fetchBillingConfigs]);

    const resolveMonthIndex = (label) => {
        const enIdx = months.findIndex(m => m.toLowerCase() === label.toLowerCase());
        if (enIdx !== -1) return enIdx;
        const esIdx = esMonths.findIndex(m => m.toLowerCase() === label.toLowerCase());
        return esIdx !== -1 ? esIdx : 99;
    };

    const monthLabelEs = (label) => {
        const idx = resolveMonthIndex(label);
        return idx !== 99 ? esMonths[idx] : label;
    };

    const monthNumber = resolveMonthIndex(selectedMonth) + 1;
    const selectedMonthIdx = resolveMonthIndex(selectedMonth);

    const billingConfigMap = useMemo(() => {
        const map = {};
        (billingConfigs || []).forEach((cfg) => {
            if (!cfg?.pos_name) return;
            map[cfg.pos_name] = cfg;
        });
        return map;
    }, [billingConfigs]);

    const isLocaleIncludedInReports = useCallback((pos) => {
        const cfg = billingConfigMap[pos];
        if (!cfg) return true;
        return cfg.include_in_reports !== false;
    }, [billingConfigMap]);

    const filteredData = useMemo(() => {
        return Object.fromEntries(
            Object.entries(data).filter(([pos]) => isLocaleIncludedInReports(pos))
        );
    }, [data, isLocaleIncludedInReports]);

    const allLocaleOptions = useMemo(() => {
        const set = new Set([...Object.keys(data), ...Object.keys(billingConfigMap)]);
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
    }, [data, billingConfigMap]);

    const allKeys = new Set();
    Object.values(filteredData).forEach((posData) => {
        Object.keys(posData).forEach((k) => allKeys.add(k));
    });

    const sortedColumns = Array.from(allKeys).sort((a, b) => {
        const idxA = months.indexOf(a) !== -1 ? months.indexOf(a) : (esMonths.indexOf(a) !== -1 ? esMonths.indexOf(a) : 99);
        const idxB = months.indexOf(b) !== -1 ? months.indexOf(b) : (esMonths.indexOf(b) !== -1 ? esMonths.indexOf(b) : 99);
        return idxA - idxB;
    });

    const getMonthValue = (posData, targetMonth) => {
        const targetIdx = resolveMonthIndex(targetMonth);
        let val = 0;
        Object.entries(posData).forEach(([k, v]) => {
            if (resolveMonthIndex(k) === targetIdx) val += v || 0;
        });
        return val;
    };

    const getRowTotal = (posData) => Object.values(posData).reduce((sum, v) => sum + v, 0);
    const sortedPosEntries = Object.entries(filteredData).sort((a, b) => a[0].localeCompare(b[0]));
    const grandTotal = Object.values(filteredData).reduce((sum, posData) => sum + getRowTotal(posData), 0);
    const grandTotalSelectedMonth = Object.values(filteredData).reduce((sum, posData) => sum + getMonthValue(posData, selectedMonth), 0);
    const avgSelectedMonthPerPos = sortedPosEntries.length > 0
        ? Math.round(grandTotalSelectedMonth / sortedPosEntries.length)
        : 0;

    const isSelectedMonthConfirmed = billingStatus.some(s => s.month === monthNumber && s.confirmed);
    const isMonthConfirmedByIdx = (monthIdx) => billingStatus.some(s => s.month === (monthIdx + 1) && s.confirmed);

    const selectedDraft = getBillingDraft(year, monthNumber);
    const selectedKey = `${year}-${monthNumber}`;
    const wasDraftReset = Boolean(resetDraftFlags[selectedKey]);
    const isResettingSelectedMonth = resettingMonthKey === selectedKey;
    const hasDraftForSelectedMonth = !isSelectedMonthConfirmed && Boolean(selectedDraft);
    const draftStepLabel = selectedDraft?.step ? BILLING_STEP_LABELS[selectedDraft.step] : null;
    const draftUpdatedLabel = selectedDraft?.updated_at
        ? new Date(selectedDraft.updated_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
        : null;

    const openSelectedMonthFlow = () => {
        if (isResettingSelectedMonth) return;
        if (isSelectedMonthConfirmed) {
            navigate(`/billing/report?year=${year}&month=${monthNumber}`);
            return;
        }
        const forceFreshStart = wasDraftReset && !hasDraftForSelectedMonth;
        navigate(
            `/billing/generate?year=${year}&month=${monthNumber}${forceFreshStart ? '&fresh=1' : ''}`
        );
    };

    const handleRestartDraft = () => {
        if (!window.confirm(`¿Reiniciar el informe de ${monthLabelEs(selectedMonth)} ${year}?\n\nSe eliminará el progreso guardado y también se quitarán todas las nóminas asignadas a locales en este mes.`)) return;
        setResettingMonthKey(selectedKey);
        (async () => {
            try {
                const res = await apiFetch('/api/billing/nomina-reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ year, month: monthNumber }),
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Error reiniciando asignaciones de nómina');
                }
                const json = await res.json();
                clearBillingDraft(year, monthNumber);
                setResetDraftFlags(prev => ({ ...prev, [selectedKey]: true }));
                notify({
                    type: 'success',
                    message: `Informe reiniciado. ${json.removed || 0} asignación(es) de nómina removidas.`,
                });
            } catch (e) {
                notify({ type: 'error', message: e.message || 'No se pudo reiniciar el informe' });
            } finally {
                setResettingMonthKey(null);
            }
        })();
    };

    const handleDeleteSelectedMonthReport = () => {
        if (selectedMonthIdx < 0 || selectedMonthIdx > 11) return;
        handleDeleteReport(selectedMonthIdx);
    };

    const openLocaleConfigModal = () => {
        const initial = {};
        allLocaleOptions.forEach((pos) => {
            initial[pos] = isLocaleIncludedInReports(pos);
        });
        setLocaleDraft(initial);
        setShowLocaleConfig(true);
    };

    const toggleLocaleDraft = (pos) => {
        setLocaleDraft((prev) => ({ ...prev, [pos]: !prev[pos] }));
    };

    const setAllLocaleDraft = (included) => {
        const next = {};
        allLocaleOptions.forEach((pos) => {
            next[pos] = included;
        });
        setLocaleDraft(next);
    };

    const saveLocaleConfig = async () => {
        if (allLocaleOptions.length === 0) {
            setShowLocaleConfig(false);
            return;
        }
        setSavingLocaleConfig(true);
        try {
            const entries = allLocaleOptions.map((pos) => {
                const cfg = billingConfigMap[pos] || {};
                return {
                    pos_name: pos,
                    include_in_reports: localeDraft[pos] !== false,
                    arriendo: Number(cfg.arriendo) || 0,
                    internet: Number(cfg.internet) || 0,
                    luz: Number(cfg.luz) || 0,
                    luz_aplica: cfg.luz_aplica === true,
                    gas: Number(cfg.gas) || 0,
                    gas_aplica: cfg.gas_aplica === true,
                    agua: Number(cfg.agua) || 0,
                    agua_aplica: cfg.agua_aplica === true,
                };
            });

            const res = await apiFetch('/api/billing/configs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error guardando configuración de locales');
            }
            await fetchBillingConfigs();
            setShowLocaleConfig(false);
            notify({ type: 'success', message: 'Locales para informes actualizados.' });
        } catch (e) {
            notify({ type: 'error', message: e.message || 'No se pudo guardar la configuración' });
        } finally {
            setSavingLocaleConfig(false);
        }
    };

    const mainActionLabel = isSelectedMonthConfirmed
        ? 'Ver Informe'
        : hasDraftForSelectedMonth
            ? 'Continuar Informe'
            : 'Generar Informe';

    const mainActionIcon = isSelectedMonthConfirmed
        ? 'description'
        : hasDraftForSelectedMonth
            ? 'pending_actions'
            : 'summarize';
    const canRestartReport = hasDraftForSelectedMonth && !isResettingSelectedMonth;

    useEffect(() => {
        if (isSelectedMonthConfirmed) {
            clearBillingDraft(year, monthNumber);
        }
    }, [isSelectedMonthConfirmed, year, monthNumber]);

    return (
        <Layout title="Facturación por Punto de Venta">
            <div className="space-y-4 pb-2">

                <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-3xl p-4 sm:p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-base sm:text-lg font-black tracking-wide">Control de Facturación</h2>
                            <p className="text-xs sm:text-sm text-[var(--text-secondary-color)] mt-1">
                                Revisa ventas por local y genera el informe mensual.
                            </p>
                        </div>
                        <div className="hidden sm:flex items-center gap-2">
                            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary-color)] bg-white/5 px-3 py-1.5 rounded-lg">
                                <span className="material-symbols-outlined text-sm">calendar_month</span>
                                Año {year}
                            </div>
                            <button
                                onClick={openLocaleConfigModal}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-semibold transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">settings</span>
                                Configuración
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-[var(--dark-color)] border border-[var(--border-color)] rounded-2xl p-3 sm:p-4 h-full min-h-[126px] lg:min-h-[148px] flex flex-col justify-between">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">Año</div>
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => setYear(y => y - 1)}
                                    className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
                                >
                                    <span className="material-symbols-outlined">chevron_left</span>
                                </button>
                                <span className="text-xl font-black font-mono text-[var(--primary-color)]">{year}</span>
                                <button
                                    onClick={() => setYear(y => y + 1)}
                                    className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
                                >
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </button>
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary-color)]/80 uppercase tracking-wider">
                                Ajuste anual
                            </div>
                        </div>

                        <div className="bg-[var(--dark-color)] border border-[var(--border-color)] rounded-2xl p-3 sm:p-4 h-full min-h-[126px] lg:min-h-[148px] flex flex-col justify-between">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">Mes</div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[var(--primary-color)]">calendar_month</span>
                                <select
                                    value={selectedMonth}
                                    onChange={e => setSelectedMonth(e.target.value)}
                                    className="w-full bg-transparent outline-none text-sm border-0"
                                >
                                    {esMonths.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                                {isSelectedMonthConfirmed && (
                                    <span className="material-symbols-outlined text-green-400 text-sm" title="Informe confirmado">verified</span>
                                )}
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary-color)]/80 uppercase tracking-wider">
                                Mes {monthNumber} de 12
                            </div>
                        </div>

                        <div className="bg-[var(--dark-color)] border border-[var(--border-color)] rounded-2xl p-3 sm:p-4 h-full min-h-[126px] lg:min-h-[148px] flex flex-col justify-between">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">
                                Facturación {monthLabelEs(selectedMonth)}
                            </div>
                            <div className="font-mono text-lg font-bold text-white">
                                {grandTotalSelectedMonth > 0 ? formatCLP(grandTotalSelectedMonth) : '-'}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary-color)]">
                                <span>{sortedPosEntries.length} locales</span>
                                <span className="font-mono">{avgSelectedMonthPerPos > 0 ? `${formatCLP(avgSelectedMonthPerPos)} prom.` : 'Sin promedio'}</span>
                            </div>
                        </div>

                        <div className="bg-[var(--dark-color)] border border-[var(--border-color)] rounded-2xl p-3 sm:p-4 h-full min-h-[126px] lg:min-h-[148px] flex flex-col justify-between">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">Estado</div>
                            {isSelectedMonthConfirmed ? (
                                <div className="text-sm font-bold text-green-400 inline-flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm">verified</span>
                                    Informe confirmado
                                </div>
                            ) : hasDraftForSelectedMonth ? (
                                <div className="space-y-1">
                                    <div className="text-sm font-bold text-amber-300 inline-flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-sm">history</span>
                                        Progreso guardado
                                    </div>
                                    <div className="text-[11px] text-[var(--text-secondary-color)]">
                                        Paso {selectedDraft.step}: {draftStepLabel}
                                    </div>
                                    {draftUpdatedLabel && (
                                        <div className="text-[10px] text-[var(--text-secondary-color)]/80">
                                            Actualizado: {draftUpdatedLabel}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-sm font-bold text-[var(--text-secondary-color)] inline-flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm">play_circle</span>
                                    Sin informe iniciado
                                </div>
                            )}
                            <div className="text-[10px] text-[var(--text-secondary-color)]/80 uppercase tracking-wider">
                                {isSelectedMonthConfirmed ? 'Bloqueado por confirmación' : hasDraftForSelectedMonth ? 'Listo para continuar' : 'Listo para generar'}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <button
                            onClick={openSelectedMonthFlow}
                            disabled={isResettingSelectedMonth}
                            className="w-full min-h-[44px] px-4 py-2.5 bg-[var(--primary-color)] rounded-xl transition-colors text-sm font-black uppercase tracking-wide shadow-lg shadow-blue-500/30 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-base">{isResettingSelectedMonth ? 'hourglass_empty' : mainActionIcon}</span>
                            {isResettingSelectedMonth ? 'Procesando...' : mainActionLabel}
                        </button>

                        <button
                            onClick={handleRestartDraft}
                            disabled={!canRestartReport}
                            className="w-full min-h-[44px] px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl transition-colors text-sm font-bold uppercase tracking-wide hover:bg-red-500/15 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            title={!canRestartReport ? (wasDraftReset ? 'Ya se reinició el informe para este mes' : 'No hay informe en progreso para reiniciar') : ''}
                        >
                            <span className="material-symbols-outlined text-base">{isResettingSelectedMonth ? 'hourglass_empty' : 'restart_alt'}</span>
                            {isResettingSelectedMonth ? 'Reiniciando...' : 'Reiniciar Informe'}
                        </button>

                        <button
                            onClick={() => setShowAllMonths(s => !s)}
                            className="w-full min-h-[44px] px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-base">{showAllMonths ? 'table_chart' : 'view_column'}</span>
                            {showAllMonths ? 'Ver Mes' : 'Ver Año'}
                        </button>

                        <button
                            onClick={() => { fetchBilling(); fetchStatus(); fetchBillingConfigs(); }}
                            className="w-full min-h-[44px] px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2"
                        >
                            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>refresh</span>
                            Actualizar
                        </button>

                    </div>
                </div>

                {loading && (
                    <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-3xl p-8 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--primary-color)] border-t-transparent" />
                    </div>
                )}

                {!loading && (
                    <>
                        <div className="md:hidden space-y-3">
                            {sortedPosEntries.map(([pos, posData]) => {
                                const rowTotal = getRowTotal(posData);
                                const monthValue = getMonthValue(posData, selectedMonth);
                                return (
                                    <div key={pos} className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold truncate">{pos}</div>
                                                <div className="text-[10px] text-[var(--text-secondary-color)] uppercase tracking-wider">Punto de venta</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] text-[var(--text-secondary-color)] uppercase tracking-wider">Total año</div>
                                                <div className="font-mono font-bold text-[var(--success-color)] text-sm">{formatCLP(rowTotal)}</div>
                                            </div>
                                        </div>

                                        {!showAllMonths ? (
                                            <div className="bg-[var(--dark-color)] border border-[var(--border-color)] rounded-xl p-3 flex items-center justify-between">
                                                <span className="text-xs text-[var(--text-secondary-color)] uppercase tracking-wider font-bold">
                                                    {monthLabelEs(selectedMonth)}
                                                </span>
                                                <span className="font-mono text-sm font-bold">{monthValue ? formatCLP(monthValue) : '-'}</span>
                                            </div>
                                        ) : (
                                            <div className="bg-[var(--dark-color)] border border-[var(--border-color)] rounded-xl p-3 space-y-2">
                                                {sortedColumns.map((col) => {
                                                    const val = posData[col] || 0;
                                                    return (
                                                        <div key={col} className="flex items-center justify-between gap-2">
                                                            <span className="text-[11px] text-[var(--text-secondary-color)]">{monthLabelEs(col)}</span>
                                                            <span className="font-mono text-xs">{val ? formatCLP(val) : '-'}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-4 flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] text-[var(--text-secondary-color)] uppercase tracking-wider font-bold">Total Global</div>
                                    <div className="text-xs text-[var(--text-secondary-color)]">
                                        {showAllMonths ? 'Todos los meses del año' : `Mes seleccionado: ${monthLabelEs(selectedMonth)}`}
                                    </div>
                                </div>
                                <div className="font-mono font-black text-base text-[var(--primary-color)]">
                                    {showAllMonths ? formatCLP(grandTotal) : (grandTotalSelectedMonth > 0 ? formatCLP(grandTotalSelectedMonth) : '-')}
                                </div>
                            </div>
                        </div>

                        <div className="hidden md:block overflow-auto bg-[var(--card-color)] rounded-3xl border border-[var(--border-color)] relative">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr>
                                        <th className="sticky top-0 left-0 z-20 bg-[var(--card-color)] p-4 text-left font-bold text-[var(--text-secondary-color)] uppercase tracking-wider text-xs border-b border-[var(--border-color)] min-w-[200px]">
                                            Punto de Venta
                                        </th>
                                        {showAllMonths ? (
                                            sortedColumns.map((col) => {
                                                const mIdx = resolveMonthIndex(col);
                                                const isConfirmed = isMonthConfirmedByIdx(mIdx);
                                                return (
                                                    <th key={col} className="sticky top-0 bg-[var(--card-color)] p-4 text-right font-bold text-[var(--text-secondary-color)] uppercase tracking-wider text-xs border-b border-[var(--border-color)] min-w-[140px]">
                                                        <div className="flex items-center gap-1 justify-end">
                                                            {monthLabelEs(col)}
                                                            {isConfirmed && (
                                                                <>
                                                                    <span className="material-symbols-outlined text-green-400 text-sm">verified</span>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteReport(mIdx); }}
                                                                        disabled={deleteLoading === mIdx + 1}
                                                                        className="material-symbols-outlined text-sm text-red-400/50 hover:text-red-400 transition-colors cursor-pointer"
                                                                        title={`Eliminar informe de ${monthLabelEs(col)}`}
                                                                    >
                                                                        {deleteLoading === mIdx + 1 ? 'hourglass_empty' : 'close'}
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </th>
                                                );
                                            })
                                        ) : (
                                            <th className="sticky top-0 bg-[var(--card-color)] p-4 text-right font-bold text-[var(--text-secondary-color)] uppercase tracking-wider text-xs border-b border-[var(--border-color)] min-w-[140px]">
                                                <div className="flex items-center gap-1 justify-end">
                                                    {monthLabelEs(selectedMonth)}
                                                    {isSelectedMonthConfirmed && (
                                                        <>
                                                            <span className="material-symbols-outlined text-green-400 text-sm">verified</span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteSelectedMonthReport(); }}
                                                                disabled={deleteLoading === monthNumber}
                                                                className="material-symbols-outlined text-sm text-red-400/50 hover:text-red-400 transition-colors cursor-pointer"
                                                                title={`Eliminar informe de ${monthLabelEs(selectedMonth)}`}
                                                            >
                                                                {deleteLoading === monthNumber ? 'hourglass_empty' : 'close'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </th>
                                        )}
                                        <th className="sticky top-0 right-0 z-20 bg-[var(--card-color)] p-4 text-right font-bold text-[var(--primary-color)] uppercase tracking-wider text-xs border-b border-[var(--border-color)] min-w-[150px]">
                                            Total Año
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)]">
                                    {sortedPosEntries.map(([pos, posData]) => {
                                        const rowTotal = getRowTotal(posData);
                                        return (
                                            <tr key={pos} className="hover:bg-white/5 transition-colors group">
                                                <td className="sticky left-0 bg-[var(--card-color)] group-hover:bg-[#1a1f2e] p-4 text-sm font-medium text-white border-r border-[var(--border-color)] truncate">
                                                    {pos}
                                                </td>
                                                {showAllMonths ? (
                                                    sortedColumns.map(col => (
                                                        <td key={col} className="p-4 text-right text-sm font-mono text-[var(--text-secondary-color)]">
                                                            {posData[col] ? formatCLP(posData[col]) : '-'}
                                                        </td>
                                                    ))
                                                ) : (
                                                    <td className="p-4 text-right text-sm font-mono text-white">
                                                        {getMonthValue(posData, selectedMonth) ? formatCLP(getMonthValue(posData, selectedMonth)) : '-'}
                                                    </td>
                                                )}
                                                <td className="sticky right-0 bg-[var(--card-color)] group-hover:bg-[#1a1f2e] p-4 text-right text-sm font-bold font-mono text-[var(--success-color)] border-l border-[var(--border-color)]">
                                                    {formatCLP(rowTotal)}
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    <tr className="bg-white/5 font-bold">
                                        <td className="sticky left-0 bg-[var(--card-color)] p-4 text-sm text-[var(--primary-color)] uppercase tracking-widest border-r border-[var(--border-color)]">
                                            Total Global
                                        </td>
                                        {showAllMonths ? (
                                            sortedColumns.map(col => {
                                                const colTotal = Object.values(filteredData).reduce((sum, posData) => sum + (posData[col] || 0), 0);
                                                return (
                                                    <td key={col} className="p-4 text-right text-sm font-mono text-white">
                                                        {colTotal > 0 ? formatCLP(colTotal) : '-'}
                                                    </td>
                                                );
                                            })
                                        ) : (
                                            <td className="p-4 text-right text-sm font-mono text-white">
                                                {grandTotalSelectedMonth > 0 ? formatCLP(grandTotalSelectedMonth) : '-'}
                                            </td>
                                        )}
                                        <td className="sticky right-0 bg-[var(--card-color)] p-4 text-right text-base font-mono text-[var(--primary-color)] border-l border-[var(--border-color)]">
                                            {formatCLP(grandTotal)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {showLocaleConfig && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="w-full max-w-2xl bg-[var(--card-color)] border border-[var(--border-color)] rounded-3xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-base font-bold">Configuración de Locales</h3>
                                    <p className="text-xs text-[var(--text-secondary-color)] mt-1">
                                        Selecciona los locales que se usarán en informes.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowLocaleConfig(false)}
                                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                                    disabled={savingLocaleConfig}
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>

                            <div className="px-5 py-3 border-b border-[var(--border-color)] flex items-center justify-between gap-2 text-xs">
                                <div className="text-[var(--text-secondary-color)]">
                                    {Object.values(localeDraft).filter(Boolean).length} de {allLocaleOptions.length} locales incluidos
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setAllLocaleDraft(true)}
                                        className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
                                        disabled={savingLocaleConfig}
                                    >
                                        Seleccionar todos
                                    </button>
                                    <button
                                        onClick={() => setAllLocaleDraft(false)}
                                        className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
                                        disabled={savingLocaleConfig}
                                    >
                                        Quitar todos
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[52vh] overflow-y-auto px-5 py-3 space-y-2">
                                {allLocaleOptions.length === 0 && (
                                    <div className="text-sm text-[var(--text-secondary-color)] italic py-6 text-center">
                                        No hay locales disponibles para configurar.
                                    </div>
                                )}
                                {allLocaleOptions.map((pos) => {
                                    const included = localeDraft[pos] !== false;
                                    return (
                                        <button
                                            key={pos}
                                            onClick={() => toggleLocaleDraft(pos)}
                                            disabled={savingLocaleConfig}
                                            className={`w-full px-3 py-2.5 rounded-xl border transition-colors flex items-center justify-between text-left ${included
                                                ? 'border-[var(--primary-color)]/30 bg-[var(--primary-color)]/10'
                                                : 'border-[var(--border-color)] bg-[var(--dark-color)] hover:bg-white/5'
                                                }`}
                                        >
                                            <span className="text-sm font-medium truncate pr-3">{pos}</span>
                                            <span className={`material-symbols-outlined text-base flex-shrink-0 ${included ? 'text-[var(--primary-color)]' : 'text-[var(--text-secondary-color)]'}`}>
                                                {included ? 'check_circle' : 'radio_button_unchecked'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="px-5 py-4 border-t border-[var(--border-color)] flex items-center justify-end gap-2">
                                <button
                                    onClick={() => setShowLocaleConfig(false)}
                                    disabled={savingLocaleConfig}
                                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold transition-colors disabled:opacity-60"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={saveLocaleConfig}
                                    disabled={savingLocaleConfig}
                                    className="px-4 py-2 rounded-xl bg-[var(--primary-color)] text-sm font-bold transition-colors hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">{savingLocaleConfig ? 'hourglass_empty' : 'save'}</span>
                                    {savingLocaleConfig ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
