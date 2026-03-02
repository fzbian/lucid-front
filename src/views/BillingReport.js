import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { apiFetch } from '../api';
import { formatCLP } from '../formatMoney';
import { useNotifications } from '../components/Notifications';
import { openBillingReportIndex } from '../utils/billingReportIndexHtml';
import { openBillingGastosIndex } from '../utils/billingGastosIndexHtml';

const esMonths = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function BillingReport() {
    const { notify } = useNotifications();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const year = parseInt(searchParams.get('year')) || new Date().getFullYear();
    const month = parseInt(searchParams.get('month')) || (new Date().getMonth() + 1);
    const monthLabel = esMonths[month - 1] || '';

    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState([]);
    const [expandedPos, setExpandedPos] = useState({});
    const [gastosDetail, setGastosDetail] = useState({});
    const [gastosLoading, setGastosLoading] = useState({});
    const [fixedCostsByPos, setFixedCostsByPos] = useState({});
    const [fixedCostsLoading, setFixedCostsLoading] = useState({});
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [openingIndex, setOpeningIndex] = useState(false);
    const [openingGastosIndex, setOpeningGastosIndex] = useState(false);

    const confirmedAt = reportData.find(e => e.confirmed_at)?.confirmed_at;

    const loadReport = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/billing/monthly?year=${year}&month=${month}`);
            if (!res.ok) throw new Error('Error cargando informe');
            const json = await res.json();
            const data = json.data || [];
            if (data.length === 0 || !data.some(e => e.confirmed)) {
                navigate(`/billing/generate?year=${year}&month=${month}`, { replace: true });
                return;
            }
            setReportData(data);
        } catch (e) {
            notify({ type: 'error', message: e.message });
            navigate('/billing', { replace: true });
        } finally {
            setLoading(false);
        }
    }, [year, month, navigate, notify]);

    useEffect(() => { loadReport(); }, [loadReport]);

    const loadGastos = async (pos) => {
        setGastosLoading(prev => ({ ...prev, [pos]: true }));
        try {
            const res = await apiFetch(`/api/billing/gastos?pos=${encodeURIComponent(pos)}&year=${year}&month=${month}`);
            if (res.ok) {
                const list = await res.json();
                setGastosDetail(prev => ({
                    ...prev,
                    [pos]: (list || []).map(g => ({
                        id: g.id || g.ID,
                        motivo: g.motivo || g.Motivo,
                        monto: g.monto || g.Monto,
                    })),
                }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setGastosLoading(prev => ({ ...prev, [pos]: false }));
        }
    };

    const loadFixedCosts = async (pos) => {
        setFixedCostsLoading(prev => ({ ...prev, [pos]: true }));
        try {
            const res = await apiFetch(`/api/billing/fixed-costs?pos=${encodeURIComponent(pos)}`);
            if (res.ok) {
                const list = await res.json();
                setFixedCostsByPos(prev => ({ ...prev, [pos]: list || [] }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setFixedCostsLoading(prev => ({ ...prev, [pos]: false }));
        }
    };

    const togglePos = (pos) => {
        const isExpanding = !expandedPos[pos];
        setExpandedPos(prev => ({ ...prev, [pos]: isExpanding }));
        if (isExpanding) {
            if (!gastosDetail[pos]) loadGastos(pos);
            if (!fixedCostsByPos[pos]) loadFixedCosts(pos);
        }
    };

    const handleDeleteReport = async () => {
        if (!window.confirm(`¿Eliminar informe de ${monthLabel} ${year}?\n\nEsto revertirá las comisiones ya agregadas a pagos de nómina de este mes.`)) return;
        setDeleteLoading(true);
        try {
            const res = await apiFetch(`/api/billing/report?year=${year}&month=${month}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error eliminando informe');
            }
            const d = await res.json();
            const msg = d.payments_reverted > 0
                ? `Informe eliminado. ${d.payments_reverted} pago(s) de nómina revertidos a parcial.`
                : 'Informe eliminado exitosamente.';
            notify({ type: 'success', message: msg });
            navigate('/billing', { replace: true });
        } catch (e) {
            notify({ type: 'error', message: e.message });
        } finally {
            setDeleteLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('es-CL', {
            day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <Layout title={`Informe ${monthLabel} ${year}`}>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--primary-color)] border-t-transparent"></div>
                </div>
            </Layout>
        );
    }

    // Compute table data
    let totV = 0, totM = 0, totG = 0, totUB = 0, totC = 0, totUN = 0;
    const posRows = reportData.map(e => {
        const venta = e.venta || 0;
        const margen = e.margen || 0;
        const gastosComunes = e.gastos_comunes || 0;
        const servicios = e.servicios || 0;
        const nomina = e.nomina || e.nomina_auto || 0;
        const arriendo = e.arriendo || 0;
        const gastosTot = gastosComunes + servicios + nomina + arriendo;
        const utilBruta = e.utilidad_bruta !== undefined ? e.utilidad_bruta : (margen - gastosTot);
        const comPct = e.comision_porcentaje || 0;
        const comision = e.comision_admin !== undefined ? e.comision_admin : Math.max(comPct / 100 * utilBruta, 0);
        const utilNeta = e.utilidad_neta !== undefined ? e.utilidad_neta : (utilBruta - comision);

        totV += venta; totM += margen; totG += gastosTot;
        totUB += utilBruta; totC += comision; totUN += utilNeta;

        return { ...e, venta, margen, gastosComunes, servicios, nomina, arriendo, gastosTot, utilBruta, comPct, comision, utilNeta };
    });

    const handleOpenIndex = async () => {
        if (!posRows.length) {
            notify({ type: 'error', message: 'No hay datos para visualizar' });
            return;
        }
        setOpeningIndex(true);
        try {
            openBillingReportIndex({
                year,
                monthName: monthLabel,
                rows: posRows.map((row) => ({
                    posName: row.pos_name,
                    venta: row.venta,
                    margen: row.margen,
                    gastosTot: row.gastosTot,
                    utilBruta: row.utilBruta,
                    comision: row.comision,
                    utilNeta: row.utilNeta,
                })),
            });
            notify({ type: 'success', message: 'Vista index abierta en una nueva pestaña' });
        } catch (e) {
            notify({ type: 'error', message: e.message || 'No se pudo abrir la vista index' });
        } finally {
            setOpeningIndex(false);
        }
    };

    const handleOpenGastosIndex = async () => {
        if (!posRows.length) {
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
                rows: posRows.map((row) => ({
                    posName: row.pos_name,
                    venta: row.venta,
                    margen: row.margen,
                    servicios: row.servicios,
                    arriendo: row.arriendo,
                    gastosComunes: row.gastosComunes,
                    nomina: row.nomina,
                    gastosTot: row.gastosTot,
                    utilBruta: row.utilBruta,
                    comision: row.comision,
                    utilNeta: row.utilNeta,
                })),
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

    return (
        <Layout title={`Informe ${monthLabel} ${year}`}>
            <div className="flex flex-col h-full space-y-4">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => navigate('/billing')}
                        className="flex items-center gap-2 text-sm text-[var(--text-secondary-color)] hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Volver a Facturación
                    </button>
                    <span className="text-sm text-[var(--text-secondary-color)] font-mono">{monthLabel} {year}</span>
                </div>

                {/* Confirmed Card */}
                <div className="bg-[var(--card-color)] border border-green-500/30 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-2xl text-green-400">verified</span>
                    </div>
                    <div>
                        <h3 className="font-bold text-green-400">Informe Confirmado</h3>
                        <p className="text-xs text-[var(--text-secondary-color)]">
                            {confirmedAt ? `Confirmado el ${formatDate(confirmedAt)}` : 'Confirmado'} &mdash; {reportData.length} punto(s) de venta
                        </p>
                    </div>
                </div>

                {/* Financial Summary Table */}
                <div className="flex-1 overflow-auto bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl">
                    <table className="min-w-full border-collapse">
                        <thead className="bg-white/5 text-xs uppercase tracking-wider text-[var(--text-secondary-color)] sticky top-0 z-10">
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
                            {posRows.map(r => (
                                <React.Fragment key={r.pos_name}>
                                    {/* POS Row */}
                                    <tr
                                        className="hover:bg-white/5 cursor-pointer transition-colors"
                                        onClick={() => togglePos(r.pos_name)}
                                    >
                                        <td className="p-3 font-medium text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-xs text-[var(--text-secondary-color)] transition-transform" style={{ transform: expandedPos[r.pos_name] ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                                    expand_more
                                                </span>
                                                {r.pos_name}
                                            </div>
                                        </td>
                                        <td className="p-3 text-right font-mono text-sm">{r.venta ? formatCLP(r.venta) : '-'}</td>
                                        <td className="p-3 text-right font-mono text-sm text-blue-200">{r.margen ? formatCLP(r.margen) : '-'}</td>
                                        <td className="p-3 text-right font-mono text-sm text-[var(--text-secondary-color)]">
                                            <div title={`Gastos Fijos: ${formatCLP(r.servicios + r.arriendo)} | Nómina: ${formatCLP(r.nomina)} | Gastos Comunes: ${formatCLP(r.gastosComunes)}`}>
                                                {r.gastosTot ? formatCLP(r.gastosTot) : '-'}
                                            </div>
                                        </td>
                                        <td className={`p-3 text-right font-mono text-sm ${r.utilBruta >= 0 ? 'text-[var(--success-color)]' : 'text-red-400'}`}>
                                            {formatCLP(r.utilBruta)}
                                        </td>
                                        <td className="p-3 text-right text-xs text-[var(--text-secondary-color)]">{r.comPct}%</td>
                                        <td className="p-3 text-right font-mono text-sm text-amber-300">{r.comision ? formatCLP(r.comision) : '-'}</td>
                                        <td className={`p-3 text-right font-mono text-sm font-bold ${r.utilNeta >= 0 ? 'text-[var(--primary-color)]' : 'text-red-400'}`}>
                                            {formatCLP(r.utilNeta)}
                                        </td>
                                    </tr>

                                    {/* Expanded Detail Row */}
                                    {expandedPos[r.pos_name] && (
                                        <tr>
                                            <td colSpan={8} className="p-0">
                                                <div className="bg-white/[0.03] px-6 py-4 space-y-4 border-l-2 border-[var(--primary-color)]">
                                                    {/* Fixed Costs */}
                                                    <div>
                                                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-secondary-color)] font-bold mb-2">
                                                            Gastos Fijos
                                                        </div>
                                                        {fixedCostsLoading[r.pos_name] ? (
                                                            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary-color)]">
                                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--primary-color)] border-t-transparent"></div>
                                                                Cargando...
                                                            </div>
                                                        ) : !fixedCostsByPos[r.pos_name]?.length ? (
                                                            <div className="text-xs text-[var(--text-secondary-color)] italic">Sin gastos fijos configurados</div>
                                                        ) : (
                                                            <div className="space-y-0">
                                                                {fixedCostsByPos[r.pos_name]?.map(fc => (
                                                                    <div key={fc.id} className="flex items-center justify-between py-1.5 border-b border-[var(--border-color)]/30 last:border-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`material-symbols-outlined text-xs ${fc.active ? 'text-blue-400' : 'text-[var(--text-secondary-color)] opacity-40'}`}>
                                                                                {fc.active ? 'check_circle' : 'cancel'}
                                                                            </span>
                                                                            <span className={`text-sm ${!fc.active ? 'line-through opacity-40' : ''}`}>{fc.name}</span>
                                                                        </div>
                                                                        <span className={`font-mono text-sm ${!fc.active ? 'opacity-40' : ''}`}>{formatCLP(fc.amount)}</span>
                                                                    </div>
                                                                ))}
                                                                <div className="flex items-center justify-between pt-2 text-xs font-bold text-[var(--text-secondary-color)]">
                                                                    <span>Total gastos fijos (activos)</span>
                                                                    <span className="font-mono text-sm">
                                                                        {formatCLP(fixedCostsByPos[r.pos_name]?.filter(fc => fc.active).reduce((s, fc) => s + (fc.amount || 0), 0) || 0)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Nómina */}
                                                    <div className="border-t border-[var(--border-color)] pt-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-secondary-color)] font-bold">Nómina</div>
                                                            <span className="font-mono text-sm">{formatCLP(r.nomina)}</span>
                                                        </div>
                                                    </div>

                                                    {/* Individual Gastos Comunes */}
                                                    <div className="border-t border-[var(--border-color)] pt-3">
                                                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-secondary-color)] font-bold mb-2">
                                                            Gastos Comunes del Mes
                                                        </div>
                                                        {gastosLoading[r.pos_name] ? (
                                                            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary-color)]">
                                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--primary-color)] border-t-transparent"></div>
                                                                Cargando...
                                                            </div>
                                                        ) : gastosDetail[r.pos_name]?.length === 0 ? (
                                                            <div className="text-xs text-[var(--text-secondary-color)] italic">Sin gastos comunes registrados este mes</div>
                                                        ) : (
                                                            <div className="space-y-0">
                                                                {gastosDetail[r.pos_name]?.map(g => (
                                                                    <div key={g.id} className="flex items-center justify-between py-1.5 border-b border-[var(--border-color)]/30 last:border-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="material-symbols-outlined text-xs text-amber-400">receipt</span>
                                                                            <span className="text-sm">{g.motivo}</span>
                                                                        </div>
                                                                        <span className="font-mono text-sm">{formatCLP(g.monto)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}

                            {/* Total Row */}
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
                        </tbody>
                    </table>
                </div>

                {/* Footer Actions */}
                <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
                    <button
                        onClick={() => navigate('/billing')}
                        className="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Volver a Facturación
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleOpenIndex}
                            disabled={openingIndex}
                            className="px-4 py-2 bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 rounded-xl text-sm font-bold hover:bg-indigo-500/30 disabled:opacity-50 flex items-center gap-2 transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            {openingIndex ? 'Abriendo index...' : 'Visualizar index'}
                        </button>
                        <button
                            onClick={handleOpenGastosIndex}
                            disabled={openingGastosIndex}
                            className="px-4 py-2 bg-amber-500/20 border border-amber-400/30 text-amber-200 rounded-xl text-sm font-bold hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-2 transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">receipt_long</span>
                            {openingGastosIndex ? 'Abriendo gastos...' : 'Visualizar gastos'}
                        </button>
                        <button
                            onClick={() => navigate('/payroll')}
                            className="px-4 py-2 bg-[var(--primary-color)] rounded-xl text-sm font-bold hover:brightness-110 flex items-center gap-2 transition-colors"
                        >
                            Completar pagos de nómina
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </button>
                        <button
                            onClick={handleDeleteReport}
                            disabled={deleteLoading}
                            className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-sm">delete_forever</span>
                            {deleteLoading ? 'Eliminando...' : 'Eliminar Informe'}
                        </button>
                    </div>
                </div>

            </div>
        </Layout>
    );
}
