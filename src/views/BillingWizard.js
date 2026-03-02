import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { apiFetch } from '../api';
import { formatCLP } from '../formatMoney';
import { useNotifications } from '../components/Notifications';
import { clearBillingDraft, getBillingDraft, upsertBillingDraft } from '../utils/billingDraft';
import { openBillingReportIndex } from '../utils/billingReportIndexHtml';
import { openBillingGastosIndex } from '../utils/billingGastosIndexHtml';

const esMonths = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const STEPS = [
    { id: 1, label: 'Gastos Fijos', icon: 'receipt_long' },
    { id: 2, label: 'Gastos Variables', icon: 'shopping_cart' },
    { id: 3, label: 'Resumen Financiero', icon: 'analytics' },
    { id: 4, label: 'Confirmar', icon: 'verified' },
];

function normalizeDraftStep(year, month) {
    const draft = getBillingDraft(year, month);
    const step = Number(draft?.step);
    return step >= 1 && step <= 4 ? step : 1;
}

export default function BillingWizard() {
    const { notify } = useNotifications();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const year = parseInt(searchParams.get('year')) || new Date().getFullYear();
    const month = parseInt(searchParams.get('month')) || (new Date().getMonth() + 1);
    const forceFreshStart = searchParams.get('fresh') === '1';
    const monthLabel = esMonths[month - 1] || '';

    const [step, setStep] = useState(() => (forceFreshStart ? 1 : normalizeDraftStep(year, month)));
    const [loading, setLoading] = useState(false);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [openingIndex, setOpeningIndex] = useState(false);
    const [openingGastosIndex, setOpeningGastosIndex] = useState(false);
    const [confirmed] = useState(false); // eslint-disable-line no-unused-vars

    // Data
    const [fixedCosts, setFixedCosts] = useState([]); // BillingFixedCost[] from API
    const [reportData, setReportData] = useState([]);
    const [commonGastos, setCommonGastos] = useState({}); // { posName: [...gastos] }
    const [newCommon, setNewCommon] = useState({});         // { posName: { motivo, monto } }
    const [expandedPos, setExpandedPos] = useState({});     // { posName: true/false }
    const [newFixedCost, setNewFixedCost] = useState({});   // { posName: { name, amount } }
    const [nominaByPos, setNominaByPos] = useState({});     // { posName: { employees: [...], total: N } }
    const [availablePayments, setAvailablePayments] = useState([]); // pagos disponibles para asignar
    const [showNominaSelector, setShowNominaSelector] = useState({}); // { posName: true/false }
    const [nominaActionLoading, setNominaActionLoading] = useState(null); // { userId, action: 'assign'|'unassign' } or null
    const [reportLocaleMap, setReportLocaleMap] = useState({}); // { posName: includedBool }
    const [commissionPctByPos, setCommissionPctByPos] = useState({}); // { posName: pctSum }

    // Fixed costs grouped by POS
    const fixedCostsByPos = {};
    fixedCosts.forEach(fc => {
        if (!fixedCostsByPos[fc.pos_name]) fixedCostsByPos[fc.pos_name] = [];
        fixedCostsByPos[fc.pos_name].push(fc);
    });

    const isPosIncludedInReports = useCallback((posName) => {
        if (!(posName in reportLocaleMap)) return true;
        return reportLocaleMap[posName] !== false;
    }, [reportLocaleMap]);

    // All POS names
    const allPosNames = [...new Set([
        ...Object.keys(fixedCostsByPos),
        ...reportData.map(e => e.pos_name),
    ])].filter(isPosIncludedInReports).sort();

    // Report data keyed by POS
    const reportByPos = {};
    reportData.forEach(e => { reportByPos[e.pos_name] = e; });

    // --- DATA LOADING ---

    const loadFixedCosts = useCallback(async () => {
        try {
            const res = await apiFetch('/api/billing/fixed-costs');
            if (res.ok) {
                const list = await res.json();
                setFixedCosts(list || []);
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    const loadReportData = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/billing/monthly?year=${year}&month=${month}`);
            if (res.ok) {
                const json = await res.json();
                const data = json.data || [];
                setReportData(data);
                if (data.some(e => e.confirmed)) {
                    clearBillingDraft(year, month);
                    navigate(`/billing/report?year=${year}&month=${month}`, { replace: true });
                    return;
                }
            }
        } catch (e) {
            console.error(e);
        }
    }, [year, month, navigate]);

    const loadReportLocales = useCallback(async () => {
        try {
            const res = await apiFetch('/api/billing/configs');
            if (!res.ok) return;
            const list = await res.json();
            const map = {};
            (Array.isArray(list) ? list : []).forEach((cfg) => {
                if (!cfg?.pos_name) return;
                map[cfg.pos_name] = cfg.include_in_reports !== false;
            });
            setReportLocaleMap(map);
        } catch (e) {
            console.error(e);
        }
    }, []);

    const loadCommissionConfig = useCallback(async () => {
        try {
            const res = await apiFetch('/api/nomina/pos-assignments');
            if (!res.ok) return;
            const list = await res.json();
            const map = {};
            (Array.isArray(list) ? list : []).forEach((assignment) => {
                const posName = assignment?.pos_name;
                if (!posName) return;
                const pct = Number(assignment?.commission_percentage) || 0;
                map[posName] = (map[posName] || 0) + pct;
            });
            setCommissionPctByPos(map);
        } catch (e) {
            console.error(e);
        }
    }, []);

    // Batch: cargar gastos comunes de TODOS los POS en una sola llamada
    const loadCommonGastosBatch = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/billing/gastos-batch?year=${year}&month=${month}`);
            if (res.ok) {
                const data = await res.json();
                // data = { posName: [...gastos] }
                const mapped = {};
                for (const [pos, list] of Object.entries(data || {})) {
                    mapped[pos] = (list || []).map(g => ({
                        id: g.id || g.ID,
                        motivo: g.motivo || g.Motivo,
                        monto: g.monto || g.Monto,
                        fecha: g.fecha || g.Fecha,
                    }));
                }
                setCommonGastos(mapped);
            }
        } catch (e) {
            console.error(e);
        }
    }, [year, month]);

    // Combined: cargar nomina-by-pos + nomina-available en una sola llamada
    const loadNominaSummary = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/billing/nomina-summary?year=${year}&month=${month}`);
            if (res.ok) {
                const data = await res.json();
                setNominaByPos(data?.by_pos || {});
                setAvailablePayments(data?.available || []);
            }
        } catch (e) {
            console.error(e);
        }
    }, [year, month]);

    const handleAssignNomina = async (posName, userId) => {
        setNominaActionLoading({ userId, action: 'assign' });
        try {
            const res = await apiFetch('/api/billing/nomina-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, month, pos_name: posName, user_id: userId })
            });
            if (res.ok) {
                await Promise.all([loadNominaSummary(), loadReportData()]);
                setShowNominaSelector(prev => ({ ...prev, [posName]: false }));
            } else {
                const err = await res.json();
                notify({ type: 'error', message: err.error || 'Error asignando nómina' });
            }
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Error de conexión' });
        } finally {
            setNominaActionLoading(null);
        }
    };

    const handleUnassignNomina = async (userId) => {
        setNominaActionLoading({ userId, action: 'unassign' });
        try {
            const res = await apiFetch('/api/billing/nomina-unassign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, month, user_id: userId })
            });
            if (res.ok) {
                await Promise.all([loadNominaSummary(), loadReportData()]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setNominaActionLoading(null);
        }
    };

    useEffect(() => {
        if (forceFreshStart) {
            clearBillingDraft(year, month);
            setStep(1);
            navigate(`/billing/generate?year=${year}&month=${month}`, { replace: true });
            return;
        }
        setStep(normalizeDraftStep(year, month));
    }, [forceFreshStart, navigate, year, month]);

    useEffect(() => {
        upsertBillingDraft(year, month, { step });
    }, [year, month, step]);

    useEffect(() => {
        setLoading(true);
        Promise.all([loadReportLocales(), loadCommissionConfig(), loadFixedCosts(), loadReportData()]).finally(() => setLoading(false));
    }, [loadReportLocales, loadCommissionConfig, loadFixedCosts, loadReportData]);

    // Load common gastos (batch) + nomina summary when entering step 2
    useEffect(() => {
        if (step === 2 && allPosNames.length > 0) {
            // Cargar gastos batch + nomina summary en paralelo (2 requests en vez de N+2)
            Promise.all([loadCommonGastosBatch(), loadNominaSummary()]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    // --- ACTIONS ---



    const handleAddFixedCost = async (pos) => {
        const form = newFixedCost[pos] || {};
        if (!form.name || !form.amount) return;
        try {
            const res = await apiFetch('/api/billing/fixed-costs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pos_name: pos, name: form.name, amount: Number(form.amount) || 0, active: true })
            });
            if (!res.ok) throw new Error('Error creando gasto fijo');
            const created = await res.json();
            setFixedCosts(prev => [...prev, created]);
            setNewFixedCost(prev => ({ ...prev, [pos]: { name: '', amount: '' } }));
        } catch (e) {
            notify({ type: 'error', message: e.message });
        }
    };

    const handleUpdateFixedCost = async (fc, updates) => {
        try {
            const res = await apiFetch(`/api/billing/fixed-costs/${fc.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (!res.ok) throw new Error('Error actualizando gasto fijo');
            setFixedCosts(prev => prev.map(f => f.id === fc.id ? { ...f, ...updates } : f));
        } catch (e) {
            notify({ type: 'error', message: e.message });
        }
    };

    const handleDeleteFixedCost = async (fc) => {
        if (!window.confirm(`¿Eliminar "${fc.name}" de ${fc.pos_name}?`)) return;
        try {
            const res = await apiFetch(`/api/billing/fixed-costs/${fc.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Error eliminando gasto fijo');
            setFixedCosts(prev => prev.filter(f => f.id !== fc.id));
        } catch (e) {
            notify({ type: 'error', message: e.message });
        }
    };

    const goToStep2 = async () => {
        setLoading(true);
        await loadReportData();
        setLoading(false);
        setStep(2);
    };

    const handleAddGasto = async (pos) => {
        const form = newCommon[pos] || {};
        if (!form.motivo || !form.monto) return;
        try {
            const res = await apiFetch('/api/billing/gastos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pos,
                    year,
                    month,
                    motivo: form.motivo,
                    monto: Number(form.monto) || 0,
                })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error creando gasto');
            }
            const created = await res.json();
            setCommonGastos(prev => ({
                ...prev,
                [pos]: [...(prev[pos] || []), {
                    id: created.id || created.ID,
                    motivo: created.motivo || created.Motivo,
                    monto: created.monto || created.Monto,
                    fecha: created.fecha || created.Fecha,
                }]
            }));
            setNewCommon(prev => ({ ...prev, [pos]: { motivo: '', monto: '' } }));
            await loadReportData();
        } catch (e) {
            notify({ type: 'error', message: e.message });
        }
    };

    const handleDeleteGasto = async (pos, gastoId) => {
        try {
            const res = await apiFetch(`/api/gastos/${gastoId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Error eliminando gasto');
            setCommonGastos(prev => ({
                ...prev,
                [pos]: (prev[pos] || []).filter(g => g.id !== gastoId),
            }));
            await loadReportData();
        } catch (e) {
            notify({ type: 'error', message: e.message });
        }
    };

    const confirmReport = async () => {
        setConfirmLoading(true);
        try {
            const res = await apiFetch('/api/billing/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, month })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error confirmando informe');
            }
            clearBillingDraft(year, month);
            notify({ type: 'success', message: 'Informe confirmado exitosamente' });
            navigate(`/billing/report?year=${year}&month=${month}`);
        } catch (e) {
            notify({ type: 'error', message: e.message });
        } finally {
            setConfirmLoading(false);
        }
    };

    // --- HELPERS ---

    const getFixedCostsTotal = (pos) => {
        return (fixedCostsByPos[pos] || [])
            .filter(fc => fc.active)
            .reduce((sum, fc) => sum + (fc.amount || 0), 0);
    };

    const getCommonGastosTotal = (pos) => {
        return (commonGastos[pos] || []).reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
    };

    const getNominaTotal = (pos) => {
        return nominaByPos[pos]?.total || 0;
    };

    const getCommissionPct = (pos, reportEntry) => {
        if (Object.prototype.hasOwnProperty.call(commissionPctByPos, pos)) {
            return commissionPctByPos[pos] || 0;
        }
        return reportEntry?.comision_porcentaje || 0;
    };

    const buildRowsForPdfExport = () => {
        return allPosNames.map((pos) => {
            const e = reportByPos[pos] || {};
            const venta = e.venta || 0;
            const margen = e.margen || 0;
            const fixedCosts = getFixedCostsTotal(pos);
            const hasLoadedCommon = Array.isArray(commonGastos[pos]);
            const hasLoadedNomina = Boolean(nominaByPos[pos]);
            const gastosComunes = hasLoadedCommon ? getCommonGastosTotal(pos) : (e.gastos_comunes || 0);
            const nomina = hasLoadedNomina ? getNominaTotal(pos) : (e.nomina || e.nomina_auto || 0);
            const gastosTot = fixedCosts + gastosComunes + nomina;
            const utilBruta = margen - gastosTot;
            const comPct = getCommissionPct(pos, e);
            const comision = Math.max(comPct / 100 * utilBruta, 0);
            const utilNeta = utilBruta - comision;

            return {
                posName: pos,
                venta,
                margen,
                servicios: e.servicios || 0,
                arriendo: e.arriendo || 0,
                gastosComunes,
                nomina,
                gastosTot,
                utilBruta,
                comision,
                utilNeta,
            };
        });
    };

    const handleOpenIndex = async () => {
        const rows = buildRowsForPdfExport();
        if (!rows.length) {
            notify({ type: 'error', message: 'No hay datos para visualizar' });
            return;
        }
        setOpeningIndex(true);
        try {
            openBillingReportIndex({
                year,
                monthName: monthLabel,
                rows,
            });
            notify({ type: 'success', message: 'Vista index abierta en una nueva pestaña' });
        } catch (e) {
            notify({ type: 'error', message: e.message || 'No se pudo abrir la vista index' });
        } finally {
            setOpeningIndex(false);
        }
    };

    const handleOpenGastosIndex = async () => {
        const rows = buildRowsForPdfExport();
        if (!rows.length) {
            notify({ type: 'error', message: 'No hay datos de gastos para visualizar' });
            return;
        }
        setOpeningGastosIndex(true);
        try {
            const [fixedRes, commonRes, nominaRes] = await Promise.all([
                apiFetch('/api/billing/fixed-costs'),
                apiFetch(`/api/billing/gastos-batch?year=${year}&month=${month}`),
                apiFetch(`/api/billing/nomina-by-pos?year=${year}&month=${month}`),
            ]);

            const fixedList = fixedRes.ok ? await fixedRes.json() : [];
            const fixedByPos = {};
            (Array.isArray(fixedList) ? fixedList : []).forEach((fc) => {
                if (!fc?.pos_name) return;
                if (!fixedByPos[fc.pos_name]) fixedByPos[fc.pos_name] = [];
                fixedByPos[fc.pos_name].push(fc);
            });

            const commonByPos = commonRes.ok ? await commonRes.json() : {};
            const nominaByPosData = nominaRes.ok ? await nominaRes.json() : {};

            openBillingGastosIndex({
                year,
                monthName: monthLabel,
                rows,
                fixedCostsByPos: fixedByPos,
                commonGastosByPos: commonByPos,
                nominaByPos: nominaByPosData,
            });
            notify({ type: 'success', message: 'Vista de gastos abierta en una nueva pestaña' });
        } catch (e) {
            notify({ type: 'error', message: e.message || 'No se pudo abrir la vista de gastos' });
        } finally {
            setOpeningGastosIndex(false);
        }
    };

    // --- RENDER ---
    return (
        <Layout title={`Informe ${monthLabel} ${year}`}>
            <div className="flex flex-col h-full space-y-4">

                {/* Header with back button */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => navigate('/billing')}
                        className="flex items-center gap-2 text-sm text-[var(--text-secondary-color)] hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Volver a Facturación
                    </button>
                    <div className="text-right">
                        <div className="text-sm text-[var(--text-secondary-color)]">
                            {monthLabel} {year}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary-color)]/80">
                            Guardado automático activado
                        </div>
                    </div>
                </div>

                {/* Stepper */}
                <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-4">
                    <div className="flex items-center justify-between max-w-3xl mx-auto">
                        {STEPS.map((s, idx) => (
                            <React.Fragment key={s.id}>
                                <button
                                    onClick={() => {
                                        if (confirmed || s.id <= step) setStep(s.id);
                                    }}
                                    className={`flex flex-col items-center gap-1 transition-all ${s.id === step
                                            ? 'text-[var(--primary-color)] scale-110'
                                            : s.id < step || confirmed
                                                ? 'text-green-400 cursor-pointer'
                                                : 'text-[var(--text-secondary-color)] opacity-50'
                                        }`}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${s.id === step
                                            ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10'
                                            : s.id < step || confirmed
                                                ? 'border-green-400 bg-green-400/10'
                                                : 'border-[var(--border-color)]'
                                        }`}>
                                        {s.id < step || (confirmed && s.id !== step) ? (
                                            <span className="material-symbols-outlined text-sm">check</span>
                                        ) : (
                                            <span className="material-symbols-outlined text-sm">{s.icon}</span>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
                                </button>
                                {idx < STEPS.length - 1 && (
                                    <div className={`flex-1 h-0.5 mx-2 ${s.id < step || confirmed ? 'bg-green-400/50' : 'bg-[var(--border-color)]'}`} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Loading overlay */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[var(--primary-color)] border-t-transparent"></div>
                    </div>
                )}

                {/* Content */}
                {!loading && (
                    <div className="flex-1 overflow-auto space-y-4">

                        {/* ====== STEP 1: GASTOS FIJOS ====== */}
                        {step === 1 && (
                            <div className="space-y-4">
                                <div className="text-sm text-[var(--text-secondary-color)] bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl p-3">
                                    <span className="material-symbols-outlined text-[var(--primary-color)] align-middle mr-1">info</span>
                                    Configura los gastos fijos por punto de venta. Puedes agregar, editar o eliminar gastos, y activar/desactivar con el toggle.
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {allPosNames.map(pos => {
                                        const costs = fixedCostsByPos[pos] || [];
                                        const total = costs.filter(fc => fc.active).reduce((s, fc) => s + (fc.amount || 0), 0);
                                        const form = newFixedCost[pos] || { name: '', amount: '' };
                                        return (
                                            <div key={pos} className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
                                                <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
                                                    <h4 className="font-bold flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[var(--primary-color)]">store</span>
                                                        {pos}
                                                    </h4>
                                                    <span className="text-xs font-bold text-[var(--primary-color)]">{formatCLP(total)}</span>
                                                </div>
                                                <div className="p-4 space-y-2">
                                                    {costs.length === 0 && (
                                                        <div className="text-xs text-[var(--text-secondary-color)] italic py-2">Sin gastos fijos configurados</div>
                                                    )}
                                                    {costs.map(fc => (
                                                        <div key={fc.id} className={`flex items-center gap-2 py-1.5 ${!fc.active ? 'opacity-40' : ''}`}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdateFixedCost(fc, { active: !fc.active })}
                                                                disabled={confirmed}
                                                                className="flex-shrink-0 disabled:opacity-50"
                                                            >
                                                                <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${fc.active ? 'bg-[var(--primary-color)]' : 'bg-white/15'}`}>
                                                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200 ${fc.active ? 'left-[18px]' : 'left-0.5'}`} />
                                                                </div>
                                                            </button>
                                                            <span className="flex-1 text-sm truncate">{fc.name}</span>
                                                            <input
                                                                type="number" min="0"
                                                                value={fc.amount || 0}
                                                                onChange={e => handleUpdateFixedCost(fc, { amount: Number(e.target.value) || 0 })}
                                                                className="w-28 text-right bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-2 py-1 font-mono text-sm disabled:opacity-40"
                                                                disabled={confirmed || !fc.active}
                                                            />
                                                            {!confirmed && (
                                                                <button
                                                                    onClick={() => handleDeleteFixedCost(fc)}
                                                                    className="text-red-400/50 hover:text-red-400 transition-colors flex-shrink-0"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {/* Add new fixed cost */}
                                                    {!confirmed && (
                                                        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                                                            <input
                                                                type="text"
                                                                placeholder="Nombre..."
                                                                value={form.name}
                                                                onChange={e => setNewFixedCost(prev => ({ ...prev, [pos]: { ...form, name: e.target.value } }))}
                                                                className="flex-1 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-sm"
                                                            />
                                                            <input
                                                                type="number" min="0"
                                                                placeholder="Monto"
                                                                value={form.amount}
                                                                onChange={e => setNewFixedCost(prev => ({ ...prev, [pos]: { ...form, amount: e.target.value } }))}
                                                                className="w-28 text-right bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 font-mono text-sm"
                                                            />
                                                            <button
                                                                onClick={() => handleAddFixedCost(pos)}
                                                                disabled={!form.name || !form.amount}
                                                                className="bg-[var(--primary-color)] p-1.5 rounded-lg hover:brightness-110 disabled:opacity-30 transition-all flex-shrink-0"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">add</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ====== STEP 2: GASTOS VARIABLES ====== */}
                        {step === 2 && (() => {
                            // Calcular totales globales para el header
                            const globalGastosTotal = allPosNames.reduce((sum, pos) => {
                                return sum + (commonGastos[pos] || []).reduce((s, g) => s + (Number(g.monto) || 0), 0);
                            }, 0);
                            const globalNominaTotal = allPosNames.reduce((sum, pos) => {
                                return sum + (nominaByPos[pos]?.total || 0);
                            }, 0);
                            const assignedCount = availablePayments.filter(p => p.assigned_to).length;
                            const totalEmployees = availablePayments.length;

                            return (
                            <div className="space-y-5">
                                {/* Summary stats */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="material-symbols-outlined text-amber-400 text-sm">receipt_long</span>
                                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">Gastos Comunes</span>
                                        </div>
                                        <div className="font-mono text-lg font-bold text-amber-400">{formatCLP(globalGastosTotal)}</div>
                                    </div>
                                    <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="material-symbols-outlined text-green-400 text-sm">badge</span>
                                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">Nómina Total</span>
                                        </div>
                                        <div className="font-mono text-lg font-bold text-green-400">{formatCLP(globalNominaTotal)}</div>
                                    </div>
                                    <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="material-symbols-outlined text-blue-400 text-sm">people</span>
                                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">Empleados</span>
                                        </div>
                                        <div className="font-mono text-lg font-bold text-blue-400">{assignedCount}<span className="text-sm text-[var(--text-secondary-color)] font-normal">/{totalEmployees}</span></div>
                                        <div className="text-[10px] text-[var(--text-secondary-color)]">asignados</div>
                                    </div>
                                    <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="material-symbols-outlined text-[var(--primary-color)] text-sm">store</span>
                                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">Locales</span>
                                        </div>
                                        <div className="font-mono text-lg font-bold text-[var(--primary-color)]">{allPosNames.length}</div>
                                    </div>
                                </div>

                                {/* POS Cards */}
                                <div className="space-y-4">
                                    {allPosNames.map(pos => {
                                        const gastos = commonGastos[pos] || [];
                                        const form = newCommon[pos] || { motivo: '', monto: '' };
                                        const isExpanded = expandedPos[pos] !== false;
                                        const gastosTotal = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
                                        const nominaPosData = nominaByPos[pos];
                                        const nomina = nominaPosData?.total || 0;
                                        const totalVariable = gastosTotal + nomina;

                                        return (
                                            <div key={pos} className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
                                                {/* POS Header */}
                                                <button
                                                    onClick={() => setExpandedPos(prev => ({ ...prev, [pos]: !isExpanded }))}
                                                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-[var(--primary-color)]/15 flex items-center justify-center">
                                                            <span className="material-symbols-outlined text-[var(--primary-color)] text-lg">store</span>
                                                        </div>
                                                        <div className="text-left">
                                                            <span className="font-bold text-sm">{pos}</span>
                                                            <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary-color)]">
                                                                <span>{gastos.length} gasto{gastos.length !== 1 ? 's' : ''}</span>
                                                                <span>·</span>
                                                                <span>{nominaPosData?.employees?.length || 0} empleado{(nominaPosData?.employees?.length || 0) !== 1 ? 's' : ''}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <div className="font-mono text-sm font-bold">{formatCLP(totalVariable)}</div>
                                                            <div className="text-[10px] text-[var(--text-secondary-color)]">total variable</div>
                                                        </div>
                                                        <span className={`material-symbols-outlined text-[var(--text-secondary-color)] text-lg transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                            expand_more
                                                        </span>
                                                    </div>
                                                </button>

                                                {isExpanded && (
                                                    <div className="border-t border-[var(--border-color)]">
                                                        {/* Gastos comunes section */}
                                                        <div className="px-5 py-4">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center">
                                                                        <span className="material-symbols-outlined text-amber-400 text-sm">receipt</span>
                                                                    </div>
                                                                    <span className="text-xs uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">Gastos Comunes</span>
                                                                </div>
                                                                <span className="font-mono text-sm text-amber-400 font-bold">{formatCLP(gastosTotal)}</span>
                                                            </div>

                                                            {gastos.length === 0 && (
                                                                <div className="text-xs text-[var(--text-secondary-color)] italic py-3 text-center bg-[var(--dark-color)] rounded-xl">
                                                                    Sin gastos registrados este mes
                                                                </div>
                                                            )}

                                                            {gastos.length > 0 && (
                                                                <div className="bg-[var(--dark-color)] rounded-xl overflow-hidden">
                                                                    {gastos.map((g, idx) => (
                                                                        <div key={g.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${idx < gastos.length - 1 ? 'border-b border-[var(--border-color)]' : ''}`}>
                                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                                <span className="material-symbols-outlined text-amber-400/60 text-sm flex-shrink-0">description</span>
                                                                                <span className="text-sm truncate">{g.motivo}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                                <span className="font-mono text-sm">{formatCLP(g.monto)}</span>
                                                                                {!confirmed && (
                                                                                    <button
                                                                                        onClick={() => handleDeleteGasto(pos, g.id)}
                                                                                        className="p-1 text-red-400/40 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                                                                                    >
                                                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Add gasto form */}
                                                            {!confirmed && (
                                                                <div className="flex items-center gap-2 mt-3">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Descripción del gasto..."
                                                                        value={form.motivo}
                                                                        onChange={e => setNewCommon(prev => ({ ...prev, [pos]: { ...form, motivo: e.target.value } }))}
                                                                        className="flex-1 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-sm placeholder:text-[var(--text-secondary-color)]/50 focus:border-[var(--primary-color)] focus:outline-none transition-colors"
                                                                    />
                                                                    <input
                                                                        type="number"
                                                                        placeholder="Monto"
                                                                        value={form.monto}
                                                                        onChange={e => setNewCommon(prev => ({ ...prev, [pos]: { ...form, monto: e.target.value } }))}
                                                                        className="w-32 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-sm text-right font-mono placeholder:text-[var(--text-secondary-color)]/50 focus:border-[var(--primary-color)] focus:outline-none transition-colors"
                                                                    />
                                                                    <button
                                                                        onClick={() => handleAddGasto(pos)}
                                                                        disabled={!form.motivo || !form.monto}
                                                                        className="px-4 py-2 bg-amber-500/15 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/25 disabled:opacity-30 transition-all flex items-center gap-1.5 flex-shrink-0"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">add</span>
                                                                        Agregar
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Nómina section */}
                                                        <div className="px-5 py-4 border-t border-[var(--border-color)] bg-green-500/[0.02]">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded-lg bg-green-500/15 flex items-center justify-center">
                                                                        <span className="material-symbols-outlined text-green-400 text-sm">badge</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-xs uppercase tracking-wider text-[var(--text-secondary-color)] font-bold">Nómina</span>
                                                                        <span className="text-[10px] text-[var(--text-secondary-color)] ml-2">Total mensual por empleado</span>
                                                                    </div>
                                                                </div>
                                                                <span className="font-mono text-sm text-green-400 font-bold">{formatCLP(nomina)}</span>
                                                            </div>

                                                            {/* Empleados ya asignados */}
                                                            {nominaPosData?.employees?.length > 0 ? (
                                                                <div className="bg-[var(--dark-color)] rounded-xl overflow-hidden mb-3">
                                                                    {nominaPosData.employees.map((emp, idx) => {
                                                                        const isRemoving = nominaActionLoading?.userId === emp.user_id && nominaActionLoading?.action === 'unassign';
                                                                        return (
                                                                        <div key={emp.user_id} className={`flex items-center justify-between gap-3 px-3 py-2.5 transition-opacity ${isRemoving ? 'opacity-50' : ''} ${idx < nominaPosData.employees.length - 1 ? 'border-b border-[var(--border-color)]' : ''}`}>
                                                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                                <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
                                                                                    {isRemoving ? (
                                                                                        <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                                                                                    ) : (
                                                                                        <span className="text-[10px] font-bold text-green-400">
                                                                                            {emp.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="min-w-0">
                                                                                    <div className="text-sm truncate">{isRemoving ? 'Quitando...' : emp.name}</div>
                                                                                    <div className="text-[10px] text-[var(--text-secondary-color)]">
                                                                                        {emp.count === 1 ? '1 quincena' : `${emp.count} quincenas`}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                                <span className="font-mono text-sm font-bold text-green-400">{formatCLP(emp.total_paid)}</span>
                                                                                {!confirmed && (
                                                                                    <button
                                                                                        onClick={() => handleUnassignNomina(emp.user_id)}
                                                                                        disabled={nominaActionLoading !== null}
                                                                                        className={`p-1 transition-colors rounded-lg ${nominaActionLoading !== null ? 'opacity-30 cursor-not-allowed' : 'text-red-400/40 hover:text-red-400 hover:bg-red-400/10'}`}
                                                                                        title="Quitar de este local"
                                                                                    >
                                                                                        {isRemoving ? (
                                                                                            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                                                                        ) : (
                                                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                                                        )}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                !showNominaSelector[pos] && (
                                                                    <div className="text-xs text-[var(--text-secondary-color)] italic py-3 text-center bg-[var(--dark-color)] rounded-xl mb-3">
                                                                        Sin empleados asignados a este local
                                                                    </div>
                                                                )
                                                            )}

                                                            {/* Selector de empleados */}
                                                            {!confirmed && (
                                                                <>
                                                                    {showNominaSelector[pos] ? (
                                                                        <div className="bg-[var(--dark-color)] rounded-xl border border-[var(--border-color)] overflow-hidden">
                                                                            <div className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between">
                                                                                <span className="text-xs font-bold text-[var(--text-secondary-color)]">Seleccionar empleado</span>
                                                                                <button
                                                                                    onClick={() => setShowNominaSelector(prev => ({ ...prev, [pos]: false }))}
                                                                                    className="text-[var(--text-secondary-color)] hover:text-white transition-colors"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                                                </button>
                                                                            </div>
                                                                            {availablePayments.filter(p => !p.assigned_to).length === 0 ? (
                                                                                <div className="px-3 py-4 text-xs text-[var(--text-secondary-color)] italic text-center">
                                                                                    Todos los empleados ya fueron asignados
                                                                                </div>
                                                                            ) : (
                                                                                <div className="max-h-48 overflow-y-auto">
                                                                                    {availablePayments
                                                                                        .filter(p => !p.assigned_to)
                                                                                        .map(p => {
                                                                                            const isAssigning = nominaActionLoading?.userId === p.user_id && nominaActionLoading?.action === 'assign';
                                                                                            return (
                                                                                            <button
                                                                                                key={p.user_id}
                                                                                                onClick={() => handleAssignNomina(pos, p.user_id)}
                                                                                                disabled={nominaActionLoading !== null}
                                                                                                className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors border-b border-[var(--border-color)] last:border-0 ${nominaActionLoading !== null ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5'}`}
                                                                                            >
                                                                                                <div className="flex items-center gap-2.5">
                                                                                                    <div className="w-7 h-7 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                                                                                                        {isAssigning ? (
                                                                                                            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                                                                                        ) : (
                                                                                                            <span className="text-[10px] font-bold text-blue-400">
                                                                                                                {p.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                    <div className="text-left">
                                                                                                        <div className="text-sm">{isAssigning ? 'Asignando...' : p.name}</div>
                                                                                                        <div className="text-[10px] text-[var(--text-secondary-color)]">
                                                                                                            {p.count === 1 ? '1 quincena' : `${p.count} quincenas`}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <span className="font-mono text-sm font-bold text-green-400">{formatCLP(p.total_paid)}</span>
                                                                                            </button>
                                                                                            );
                                                                                        })}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => setShowNominaSelector(prev => ({ ...prev, [pos]: true }))}
                                                                            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-green-400 hover:bg-green-500/10 rounded-xl border border-dashed border-green-500/20 hover:border-green-500/40 transition-all"
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">person_add</span>
                                                                            Asignar empleado
                                                                        </button>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* Total footer */}
                                                        <div className="px-5 py-3 border-t border-[var(--border-color)] bg-white/[0.02] flex items-center justify-between">
                                                            <span className="text-xs uppercase tracking-wider font-bold text-[var(--text-secondary-color)]">Total gastos variables</span>
                                                            <span className="font-mono font-bold text-base">{formatCLP(totalVariable)}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            );
                        })()}

                        {/* ====== STEP 3: RESUMEN FINANCIERO ====== */}
                        {step === 3 && (
                            <div className="space-y-4">
                                <div className="text-sm text-[var(--text-secondary-color)] bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl p-3">
                                    <span className="material-symbols-outlined text-[var(--primary-color)] align-middle mr-1">info</span>
                                    Resumen financiero con datos de Odoo. La columna "Gastos" suma gastos fijos (paso 1) y gastos variables (paso 2).
                                </div>
                                <div className="flex justify-end gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={handleOpenIndex}
                                            disabled={openingIndex}
                                            className="px-4 py-2 bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 rounded-xl text-sm font-bold hover:bg-indigo-500/30 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                                        {openingIndex ? 'Abriendo index...' : 'Visualizar index'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenGastosIndex}
                                        disabled={openingGastosIndex}
                                        className="px-4 py-2 bg-amber-500/20 border border-amber-400/30 text-amber-200 rounded-xl text-sm font-bold hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-sm">receipt_long</span>
                                        {openingGastosIndex ? 'Abriendo gastos...' : 'Visualizar gastos'}
                                    </button>
                                </div>

                                <div className="overflow-auto bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl">
                                    <table className="min-w-full border-collapse">
                                        <thead className="bg-white/5 text-xs uppercase tracking-wider text-[var(--text-secondary-color)]">
                                            <tr>
                                                <th className="p-3 text-left">Local</th>
                                                <th className="p-3 text-right">Venta</th>
                                                <th className="p-3 text-right">Margen</th>
                                                <th className="p-3 text-right">Gastos</th>
                                                <th className="p-3 text-right">Util. Bruta</th>
                                                <th className="p-3 text-right">Com. %</th>
                                                <th className="p-3 text-right">Comisión $</th>
                                                <th className="p-3 text-right">Util. Neta</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border-color)]">
                                            {(() => {
                                                let totV = 0, totM = 0, totG = 0, totUB = 0, totC = 0, totUN = 0;
                                                const rows = allPosNames.map(pos => {
                                                    const e = reportByPos[pos] || {};

                                                    const venta = e.venta || 0;
                                                    const margen = e.margen || 0;
                                                    const fixedCosts = getFixedCostsTotal(pos);
                                                    const hasLoadedCommon = Array.isArray(commonGastos[pos]);
                                                    const hasLoadedNomina = Boolean(nominaByPos[pos]);
                                                    const gastosComunes = hasLoadedCommon ? getCommonGastosTotal(pos) : (e.gastos_comunes || 0);
                                                    const nomina = hasLoadedNomina ? getNominaTotal(pos) : (e.nomina || e.nomina_auto || 0);
                                                    const variableCosts = gastosComunes + nomina;
                                                    const gastosTot = fixedCosts + variableCosts;
                                                    const utilBruta = margen - gastosTot;
                                                    const comPct = getCommissionPct(pos, e);
                                                    const comision = Math.max(comPct / 100 * utilBruta, 0);
                                                    const utilNeta = utilBruta - comision;

                                                    totV += venta; totM += margen; totG += gastosTot;
                                                    totUB += utilBruta; totC += comision; totUN += utilNeta;

                                                    return (
                                                        <tr key={pos} className="hover:bg-white/5">
                                                            <td className="p-3 font-medium text-sm">{pos}</td>
                                                            <td className="p-3 text-right font-mono text-sm">{venta ? formatCLP(venta) : '-'}</td>
                                                            <td className="p-3 text-right font-mono text-sm text-blue-200">{margen ? formatCLP(margen) : '-'}</td>
                                                            <td className="p-3 text-right font-mono text-sm text-[var(--text-secondary-color)]">
                                                                <div title={`Fijos: ${formatCLP(fixedCosts)} | Variables: ${formatCLP(variableCosts)} (Comunes: ${formatCLP(gastosComunes)} + Nómina: ${formatCLP(nomina)})`}>
                                                                    {gastosTot ? formatCLP(gastosTot) : '-'}
                                                                </div>
                                                            </td>
                                                            <td className={`p-3 text-right font-mono text-sm ${utilBruta >= 0 ? 'text-[var(--success-color)]' : 'text-red-400'}`}>
                                                                {formatCLP(utilBruta)}
                                                            </td>
                                                            <td className="p-3 text-right text-xs text-[var(--text-secondary-color)]">{comPct}%</td>
                                                            <td className="p-3 text-right font-mono text-sm text-amber-300">{comision ? formatCLP(comision) : '-'}</td>
                                                            <td className={`p-3 text-right font-mono text-sm font-bold ${utilNeta >= 0 ? 'text-[var(--primary-color)]' : 'text-red-400'}`}>
                                                                {formatCLP(utilNeta)}
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                                return (
                                                    <>
                                                        {rows}
                                                        <tr className="bg-white/5 font-bold border-t-2 border-[var(--primary-color)]">
                                                            <td className="p-3 text-[var(--primary-color)] uppercase tracking-widest text-xs">Total</td>
                                                            <td className="p-3 text-right font-mono text-sm">{formatCLP(totV)}</td>
                                                            <td className="p-3 text-right font-mono text-sm text-blue-200">{formatCLP(totM)}</td>
                                                            <td className="p-3 text-right font-mono text-sm text-[var(--text-secondary-color)]">{formatCLP(totG)}</td>
                                                            <td className={`p-3 text-right font-mono text-sm ${totUB >= 0 ? 'text-[var(--success-color)]' : 'text-red-400'}`}>{formatCLP(totUB)}</td>
                                                            <td className="p-3 text-right text-xs">—</td>
                                                            <td className="p-3 text-right font-mono text-sm text-amber-300">{formatCLP(totC)}</td>
                                                            <td className={`p-3 text-right font-mono text-sm ${totUN >= 0 ? 'text-[var(--primary-color)]' : 'text-red-400'}`}>{formatCLP(totUN)}</td>
                                                        </tr>
                                                    </>
                                                );
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ====== STEP 4: CONFIRMAR ====== */}
                        {step === 4 && (
                            <div className="space-y-4">
                                {confirmed ? (
                                    /* Redirect to report view */
                                    <div className="flex items-center justify-center h-32">
                                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-[var(--primary-color)] border-t-transparent"></div>
                                    </div>
                                ) : (
                                    /* Confirmation view */
                                    <div className="space-y-4">
                                        <div className="text-sm text-[var(--text-secondary-color)] bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl p-3">
                                            <span className="material-symbols-outlined text-amber-400 align-middle mr-1">warning</span>
                                            Al confirmar, los datos se congelan y las comisiones se habilitan para los pagos de nómina. Esta acción no se puede deshacer.
                                        </div>
                                        <div className="flex justify-end gap-2 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={handleOpenIndex}
                                                disabled={openingIndex}
                                                className="px-4 py-2 bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 rounded-xl text-sm font-bold hover:bg-indigo-500/30 disabled:opacity-50 flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-sm">open_in_new</span>
                                                {openingIndex ? 'Abriendo index...' : 'Visualizar index'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleOpenGastosIndex}
                                                disabled={openingGastosIndex}
                                                className="px-4 py-2 bg-amber-500/20 border border-amber-400/30 text-amber-200 rounded-xl text-sm font-bold hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-sm">receipt_long</span>
                                                {openingGastosIndex ? 'Abriendo gastos...' : 'Visualizar gastos'}
                                            </button>
                                        </div>

                                        {/* Summary cards */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {allPosNames.map(pos => {
                                                const e = reportByPos[pos] || {};
                                                const venta = e.venta || 0;
                                                const margen = e.margen || 0;
                                                const fixedCosts = getFixedCostsTotal(pos);
                                                const hasLoadedCommon = Array.isArray(commonGastos[pos]);
                                                const hasLoadedNomina = Boolean(nominaByPos[pos]);
                                                const gastosComunes = hasLoadedCommon ? getCommonGastosTotal(pos) : (e.gastos_comunes || 0);
                                                const nomina = hasLoadedNomina ? getNominaTotal(pos) : (e.nomina || e.nomina_auto || 0);
                                                const variableCosts = gastosComunes + nomina;
                                                const gastos = fixedCosts + variableCosts;
                                                const utilBruta = margen - gastos;
                                                const comPct = getCommissionPct(pos, e);
                                                const comision = Math.max(comPct / 100 * utilBruta, 0);
                                                const utilNeta = utilBruta - comision;

                                                return (
                                                    <div key={pos} className={`bg-[var(--card-color)] border rounded-2xl p-4 space-y-2 ${utilBruta < 0 ? 'border-red-500/30' : 'border-[var(--border-color)]'}`}>
                                                        <div className="font-bold flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-[var(--primary-color)]">store</span>
                                                            {pos}
                                                            {utilBruta < 0 && (
                                                                <span className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full font-bold">NEGATIVO</span>
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-1 text-xs">
                                                            <span className="text-[var(--text-secondary-color)]">Venta</span>
                                                            <span className="text-right font-mono">{formatCLP(venta)}</span>
                                                            <span className="text-[var(--text-secondary-color)]">Margen</span>
                                                            <span className="text-right font-mono text-blue-200">{formatCLP(margen)}</span>
                                                            <span className="text-[var(--text-secondary-color)]">Total gastos</span>
                                                            <span className="text-right font-mono">{formatCLP(gastos)}</span>
                                                            <span className="text-[var(--text-secondary-color)]">Gastos fijos</span>
                                                            <span className="text-right font-mono">{formatCLP(fixedCosts)}</span>
                                                            <span className="text-[var(--text-secondary-color)]">Gastos variables</span>
                                                            <span className="text-right font-mono">{formatCLP(variableCosts)}</span>
                                                            <span className="text-[var(--text-secondary-color)]">Utilidad bruta</span>
                                                            <span className={`text-right font-mono ${utilBruta >= 0 ? 'text-[var(--success-color)]' : 'text-red-400'}`}>{formatCLP(utilBruta)}</span>
                                                            <span className="text-[var(--text-secondary-color)]">Comisión ({comPct}%)</span>
                                                            <span className="text-right font-mono text-amber-300">{formatCLP(comision)}</span>
                                                        </div>
                                                        <div className="border-t border-[var(--border-color)] pt-2 flex items-center justify-between">
                                                            <span className="text-xs font-bold uppercase tracking-wider">Utilidad Neta</span>
                                                            <span className={`font-mono font-bold ${utilNeta >= 0 ? 'text-[var(--primary-color)]' : 'text-red-400'}`}>{formatCLP(utilNeta)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="flex justify-center pt-4">
                                            <button
                                                onClick={confirmReport}
                                                disabled={confirmLoading}
                                                className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold text-lg hover:brightness-110 disabled:opacity-50 flex items-center gap-3 shadow-lg shadow-green-600/30"
                                            >
                                                <span className="material-symbols-outlined">verified</span>
                                                {confirmLoading ? 'Confirmando...' : `Confirmar Informe de ${monthLabel}`}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Bottom Navigation */}
                {!loading && !confirmed && step !== 4 && (
                    <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-4 flex justify-between items-center">
                        <div>
                            {step > 1 && (
                                <button
                                    onClick={() => setStep(s => s - 1)}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                                    Anterior
                                </button>
                            )}
                        </div>
                        <div>
                            {step === 1 && (
                                <button
                                    onClick={goToStep2}
                                    className="px-4 py-2 bg-[var(--primary-color)] rounded-xl font-bold hover:brightness-110 flex items-center gap-2"
                                >
                                    Continuar
                                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                </button>
                            )}
                            {step === 2 && (
                                <button
                                    onClick={async () => {
                                        setLoading(true);
                                        await loadReportData();
                                        setLoading(false);
                                        setStep(3);
                                    }}
                                    className="px-4 py-2 bg-[var(--primary-color)] rounded-xl font-bold hover:brightness-110 flex items-center gap-2"
                                >
                                    Ver resumen financiero
                                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                </button>
                            )}
                            {step === 3 && (
                                <button
                                    onClick={() => setStep(4)}
                                    className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:brightness-110 flex items-center gap-2"
                                >
                                    Proceder a confirmar
                                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
