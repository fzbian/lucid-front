import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import DesktopOnlyGuard from '../components/DesktopOnlyGuard';
import PayrollWizard from '../components/PayrollWizard';
import { apiFetch } from '../api';
import { formatCLP } from '../formatMoney';
import { getSessionUsername } from '../auth';
import { useNotifications } from '../components/Notifications';
import { generatePaymentSlip } from '../utils/pdfGenerator';

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const formatDateTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const normalizePayrollMatrix = (payload) => ({
    users: Array.isArray(payload?.users) ? payload.users : [],
    payments: Array.isArray(payload?.payments) ? payload.payments : [],
    stats: payload?.stats && typeof payload.stats === 'object' ? payload.stats : {}
});

export default function Payroll() {
    const navigate = useNavigate();
    const { notify } = useNotifications();
    const [year, setYear] = useState(new Date().getFullYear());
    const [matrix, setMatrix] = useState({ users: [], payments: [], stats: {} });
    const [loading, setLoading] = useState(false);

    // Config state (kept for "Settings" button)
    const [config, setConfig] = useState(null);
    const [showConfig, setShowConfig] = useState(false);
    const [showEmployees, setShowEmployees] = useState(false);

    // Billing status per month
    const [billingStatus, setBillingStatus] = useState([]); // [{month, confirmed, confirmed_at, pos_count}]

    // Wizard State
    const [selectedPeriod, setSelectedPeriod] = useState(null); // { month: 0-11, period: 1|2 }
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    // POS Assignments (for checking if employee has commission)
    const [allPosAssignments, setAllPosAssignments] = useState([]);
    const [signatureLinkModal, setSignatureLinkModal] = useState(null);

    const currentUser = getSessionUsername();
    const matrixUsers = Array.isArray(matrix?.users) ? matrix.users : [];
    const matrixPayments = Array.isArray(matrix?.payments) ? matrix.payments : [];

    const initialWizardDates = useMemo(() => {
        if (!selectedPeriod) return null;
        const m = selectedPeriod.month;
        const y = year;
        if (selectedPeriod.period === 1) {
            return {
                start: new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0],
                end: new Date(Date.UTC(y, m, 15)).toISOString().split('T')[0]
            };
        } else {
            return {
                start: new Date(Date.UTC(y, m, 16)).toISOString().split('T')[0],
                end: new Date(Date.UTC(y, m + 1, 0)).toISOString().split('T')[0]
            };
        }
    }, [selectedPeriod, year]);
    const loadMatrix = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/nomina/matrix?year=${year}`);
            if (res.ok) {
                const data = await res.json();
                setMatrix(normalizePayrollMatrix(data));
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [year]);

    const fetchBillingStatus = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/billing/status?year=${year}`);
            if (res.ok) {
                const json = await res.json();
                setBillingStatus(json || []);
            }
        } catch (e) { console.error(e); }
    }, [year]);

    const loadPosAssignments = useCallback(async () => {
        try {
            const res = await apiFetch('/api/nomina/pos-assignments');
            if (res.ok) {
                const data = await res.json();
                setAllPosAssignments(data || []);
            }
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        loadMatrix();
        loadConfig();
        fetchBillingStatus();
        loadPosAssignments();
    }, [loadMatrix, fetchBillingStatus, loadPosAssignments]);

    const loadConfig = async () => {
        try {
            const res = await apiFetch('/api/nomina/config');
            if (res.ok) setConfig(await res.json());
        } catch (e) { console.error(e); }
    };

    // Helper: Get payment status for a specific period
    const getPeriodStatus = (monthIndex, periodNum) => { // periodNum: 1 or 2
        // Find payments for this window
        // Month Index is 0-11. Backend stores Dates.
        // Needs robust matching.
        // Let's filter payments locally since we have them all.
        const targetMonth = monthIndex + 1;

        const paymentsInPeriod = matrixPayments.filter(p => {
            const d = new Date(p.period_start);
            // Check Year
            if (d.getUTCFullYear() !== year) return false;
            // Check Month
            if ((d.getUTCMonth() + 1) !== targetMonth) return false;
            // Check Period (Day <= 15 is 1, >15 is 2)
            const day = d.getUTCDate();
            const pNum = day <= 15 ? 1 : 2;
            return pNum === periodNum;
        });

        const activeUsersCount = matrixUsers.length;
        const paidCount = paymentsInPeriod.length;

        if (paidCount === 0) return 'empty';
        if (paidCount >= activeUsersCount) return 'complete'; // All paid
        return 'partial'; // Some missing
    };

    // Helper: check if billing for a given month (0-indexed) is confirmed
    const isMonthBillingConfirmed = (monthIndex) => {
        return billingStatus.some(s => s.month === (monthIndex + 1) && s.confirmed);
    };

    const handleOpenPeriod = (monthIndex, periodNum) => {
        setSelectedPeriod({ month: monthIndex, period: periodNum });
    };

    const handleSendComprobante = async (paymentId, employeeName = '') => {
        try {
            const res = await apiFetch(`/api/nomina/payments/${paymentId}/sign-link`, {
                method: 'POST',
                headers: { 'X-Actor-Username': currentUser || 'Sistema' }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                notify({ type: 'error', message: data.error || 'No se pudo generar el link de firma' });
                return null;
            }

            setSignatureLinkModal({
                paymentId: data.payment_id || paymentId,
                employeeName,
                signingUrl: data.signing_url,
                expiresAt: data.expires_at,
                dispatchMode: data.dispatch_mode || 'preview_only'
            });

            const mode = data.dispatch_mode || 'preview_only';
            const successMessage = mode === 'whatsapp_sent'
                ? 'Comprobante enviado por WhatsApp'
                : 'Comprobante listo para enviar';
            notify({ type: 'success', message: successMessage });
            return data;
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Error de conexión' });
            return null;
        }
    };

    // Handle adding commission to a partial payment
    const handleAddCommission = async (paymentId, userId, monthIndex) => {
        try {
            // Fetch commission for this employee/month
            const cMonth = monthIndex + 1;
            const res = await apiFetch(`/api/billing/commission?year=${year}&month=${cMonth}&user_id=${userId}`);
            if (!res.ok) {
                notify({ type: 'error', message: 'Error obteniendo comisión' });
                return;
            }
            const data = await res.json();
            const total = Math.round(data.total || 0);
            const details = data.details || [];

            // Show confirmation with details
            const detailLines = details.map(d => `  ${d.pos_name} (${d.percentage}%): ${formatCLP(d.commission)}`).join('\n');
            const msg = `Agregar comisión al pago:\n\nTotal comisión: ${formatCLP(total)}\n${detailLines}\n\n¿Confirmar?`;
            if (!window.confirm(msg)) return;

            // PATCH to complete partial payment
            const patchRes = await apiFetch(`/api/nomina/payments/${paymentId}/commission`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commission: total })
            });
            if (patchRes.ok) {
                await patchRes.json();
                notify({ type: 'success', message: `Comisión de ${formatCLP(total)} agregada exitosamente` });
                loadMatrix(); // Refresh
            } else {
                const err = await patchRes.json();
                notify({ type: 'error', message: err.error || 'Error actualizando pago' });
            }
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Error de conexión' });
        }
    };

    const handlePaymentSuccess = async (data) => {
        /* 
           Simulate API call here or assume Wizard does it? 
           Wait, Wizard calls onConfirm which usually calls API.
           Existing Wizard logic: "onConfirm={handlePayment}"
           Let's reuse the logic from previous Payroll.js
        */
        try {
            const payload = {
                ...data,
                created_by: currentUser || 'Sistema',
            };
            const res = await apiFetch('/api/nomina/pay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const payment = await res.json();
                setIsWizardOpen(false);
                loadMatrix(); // Refresh grid
                return payment;
            }
        } catch (e) { console.error(e); }
    };

    const handleDeletePayment = async (paymentId) => {
        if (!window.confirm("¿Estás seguro de eliminar este pago? Esta acción no se puede deshacer.")) return;

        try {
            const res = await apiFetch(`/api/nomina/payments/${paymentId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                // notify({ type: 'success', message: 'Pago eliminado' });
                loadMatrix();
            }
        } catch (e) { console.error(e); }
    };

    return (
        <Layout title="Centro de Nómina">
            <DesktopOnlyGuard>
                <div className="flex flex-col h-[calc(100vh-100px)]">
                    {/* Header Controls */}
                    <div className="flex justify-between items-center mb-6 px-4">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setYear(year - 1)} className="p-2 hover:bg-white/10 rounded-full"><span className="material-symbols-outlined">chevron_left</span></button>
                            <h1 className="text-3xl font-bold font-mono">{year}</h1>
                            <button onClick={() => setYear(year + 1)} className="p-2 hover:bg-white/10 rounded-full"><span className="material-symbols-outlined">chevron_right</span></button>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary-color)]">
                                <span className="w-3 h-3 rounded-full bg-[var(--success-color)]"></span> Completo
                                <span className="w-3 h-3 rounded-full bg-yellow-500"></span> Parcial
                                <span className="w-3 h-3 rounded-full bg-[var(--card-color)] border border-[var(--border-color)]"></span> Pendiente
                            </div>

                            <button
                                onClick={() => setShowEmployees(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--card-color)] border border-[var(--border-color)] rounded-lg hover:border-[var(--primary-color)] transition-colors"
                            >
                                <span className="material-symbols-outlined">groups</span>
                                Empleados
                            </button>

                            <button
                                onClick={() => setShowConfig(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--card-color)] border border-[var(--border-color)] rounded-lg hover:border-[var(--primary-color)] transition-colors"
                            >
                                <span className="material-symbols-outlined">settings</span>
                                Configuración
                            </button>
                        </div>
                    </div>

                    {/* Main Grid */}
                    <div className="flex-1 overflow-auto px-4 pb-8">
                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <div key={i} className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl h-[200px] animate-pulse">
                                        <div className="h-10 border-b border-[var(--border-color)] bg-white/5"></div>
                                        <div className="p-4 space-y-4">
                                            <div className="h-16 rounded bg-white/5"></div>
                                            <div className="h-16 rounded bg-white/5"></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {MONTHS.map((monthName, idx) => (
                                    <div key={idx} className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden flex flex-col shadow-lg">
                                        <div className="bg-[#111] p-3 text-center font-bold border-b border-[var(--border-color)] flex justify-between items-center">
                                            <span className="opacity-30 font-mono text-s">{String(idx + 1).padStart(2, '0')}</span>
                                            <span className="text-lg">{monthName}</span>
                                            <span className="opacity-30 text-xs">{year}</span>
                                        </div>
                                        <div className="p-4 grid grid-cols-1 gap-3 bg-[var(--background-color)] flex-1">
                                            {/* Quincena 1 */}
                                            <PeriodCard
                                                label="1ra Quincena"
                                                status={getPeriodStatus(idx, 1)}
                                                onClick={() => handleOpenPeriod(idx, 1)}
                                            />
                                            {/* Quincena 2 */}
                                            <PeriodCard
                                                label="2da Quincena"
                                                status={getPeriodStatus(idx, 2)}
                                                onClick={() => handleOpenPeriod(idx, 2)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Period Detail Modal/Overlay */}
                    {selectedPeriod && (
                        <PeriodDetailOverlay
                            year={year}
                            monthIndex={selectedPeriod.month}
                            periodNum={selectedPeriod.period}
                            matrix={matrix}
                            onClose={() => setSelectedPeriod(null)}
                            onPay={(employee) => {
                                setSelectedEmployee(employee);
                                setIsWizardOpen(true);
                            }}
                            onDelete={handleDeletePayment}
                            config={config}
                            billingConfirmed={isMonthBillingConfirmed(selectedPeriod.month)}
                            onAddCommission={handleAddCommission}
                            onSendComprobante={handleSendComprobante}
                            navigate={navigate}
                        />
                    )}

                    {/* Default Wizard Configuration */}
                    {isWizardOpen && selectedEmployee && (
                        <PayrollWizard
                            isOpen={isWizardOpen}
                            onClose={() => setIsWizardOpen(false)}
                            employee={selectedEmployee}
                            config={config}
                            onConfirm={handlePaymentSuccess}
                            initialDates={initialWizardDates}
                            billingConfirmed={selectedPeriod ? isMonthBillingConfirmed(selectedPeriod.month) : false}
                            periodNum={selectedPeriod?.period}
                            hasCommission={allPosAssignments.some(a => a.user_id === selectedEmployee.id && a.commission_percentage > 0)}
                        />
                    )}

                    {/* Config Modal */}
                    {showConfig && config && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                            <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-6 max-w-3xl w-full shadow-2xl">
                                <div className="flex flex-col gap-2 mb-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h3 className="text-xl font-bold">Configuración Global</h3>
                                        <p className="text-xs text-[var(--text-secondary-color)]">Ajustes que afectan a todos los cálculos de nómina y documentos generados.</p>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] bg-white/5 px-3 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary-color)]">
                                        <span className="material-symbols-outlined text-sm text-[var(--primary-color)]">shield_lock</span>
                                        Solo administradores
                                    </div>
                                </div>

                                <ConfigForm config={config} onClose={() => setShowConfig(false)} onUpdate={() => { loadConfig(); }} />
                            </div>
                        </div>
                    )}

                    {/* Employee Manager Modal */}
                    {showEmployees && (
                        <EmployeeManager onClose={() => { setShowEmployees(false); loadMatrix(); }} />
                    )}

                    {signatureLinkModal && (
                        <SignatureLinkModal
                            payload={signatureLinkModal}
                            onClose={() => setSignatureLinkModal(null)}
                        />
                    )}

                </div>
            </DesktopOnlyGuard>
        </Layout>
    );
}

function PeriodCard({ label, status, onClick }) {
    let borderColor = "border-[var(--border-color)]";
    let bgColor = "bg-[var(--card-color)]";
    let icon = "pending";
    let iconColor = "text-[var(--text-secondary-color)]";
    let statusText = "Pendiente";

    if (status === 'complete') {
        borderColor = "border-[var(--success-color)]";
        bgColor = "bg-green-500/10";
        icon = "check_circle";
        iconColor = "text-[var(--success-color)]";
        statusText = "Completo";
    } else if (status === 'partial') {
        borderColor = "border-yellow-500";
        bgColor = "bg-yellow-500/10";
        icon = "timelapse";
        iconColor = "text-yellow-500";
        statusText = "Parcial";
    }

    return (
        <div
            onClick={onClick}
            className={`
                flex flex-col justify-between p-3 rounded-lg border ${borderColor} ${bgColor} 
                cursor-pointer hover:brightness-110 active:scale-95 transition-all
                h-full min-h-[80px]
            `}
        >
            <div className="flex justify-between items-start">
                <span className="text-sm font-medium opacity-80">{label}</span>
                <span className={`material-symbols-outlined ${iconColor} text-lg`}>{icon}</span>
            </div>
            <div className={`text-xs font-bold ${iconColor}`}>
                {statusText}
            </div>
        </div>
    );
}

function PeriodDetailOverlay({ year, monthIndex, periodNum, matrix, onClose, onPay, onDelete, config, billingConfirmed, onAddCommission, onSendComprobante, navigate }) {
    const periodLabel = periodNum === 1 ? "1ra Quincena" : "2da Quincena";
    const periodDates = periodNum === 1 ? "1 — 15" : "16 — Fin de mes";
    const is2ndFortnight = periodNum === 2;
    const matrixUsers = Array.isArray(matrix?.users) ? matrix.users : [];
    const matrixPayments = Array.isArray(matrix?.payments) ? matrix.payments : [];
    const [pdfModal, setPdfModal] = useState(null); // { title, url, filename }
    const [pdfActionLoadingId, setPdfActionLoadingId] = useState(null);
    const [sendingComprobanteId, setSendingComprobanteId] = useState(null);

    const closePdfModal = useCallback(() => {
        setPdfModal(prev => {
            if (prev?.url?.startsWith('blob:')) URL.revokeObjectURL(prev.url);
            return null;
        });
    }, []);

    const triggerBlobDownload = (blob, filename) => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    };

    const loadSignedPdfBlob = async (signedFilePath) => {
        const res = await apiFetch(signedFilePath);
        if (!res.ok) {
            let msg = 'No se pudo cargar el PDF firmado';
            try {
                const data = await res.json();
                if (data?.error) msg = data.error;
            } catch (_) { }
            throw new Error(msg);
        }
        return res.blob();
    };

    // Calculate who is paid
    const targetMonth = monthIndex + 1;
    const periodPayments = matrixPayments.filter(p => {
        const d = new Date(p.period_start);
        if (d.getUTCFullYear() !== year) return false;
        if ((d.getUTCMonth() + 1) !== targetMonth) return false;
        const day = d.getUTCDate();
        const pNum = day <= 15 ? 1 : 2;
        return pNum === periodNum;
    });

    const paymentByUserId = {};
    periodPayments.forEach(p => paymentByUserId[p.user_id] = p);

    // Stats
    const totalUsers = matrixUsers.length;
    const paidCount = periodPayments.length;
    const pendingCount = totalUsers - paidCount;
    const partialCount = periodPayments.filter(p => p.is_partial).length;
    const completedCount = paidCount - partialCount;
    const totalPaid = periodPayments.reduce((acc, p) => acc + p.total_paid, 0);

    const handleOpenSignedPdf = async (payment, user) => {
        if (!payment?.signed_file) return;
        setPdfActionLoadingId(`view-${payment.id}`);
        try {
            const blob = await loadSignedPdfBlob(payment.signed_file);
            const objectUrl = URL.createObjectURL(blob);
            const safeName = (user?.name || user?.username || 'empleado').replace(/\s+/g, '_');
            setPdfModal({
                title: `PDF firmado · ${user?.name || user?.username || 'Empleado'}`,
                url: objectUrl,
                filename: `Nomina_Firmada_${safeName}_${payment.id}.pdf`
            });
        } catch (e) {
            console.error(e);
            alert(e.message || 'No se pudo cargar el PDF firmado');
        } finally {
            setPdfActionLoadingId(null);
        }
    };

    const handleDownloadSignedPdf = async (payment, user) => {
        if (!payment?.signed_file) return;
        setPdfActionLoadingId(`dl-${payment.id}`);
        try {
            const blob = await loadSignedPdfBlob(payment.signed_file);
            const safeName = (user?.name || user?.username || 'empleado').replace(/\s+/g, '_');
            triggerBlobDownload(blob, `Nomina_Firmada_${safeName}_${payment.id}.pdf`);
        } catch (e) {
            console.error(e);
            alert(e.message || 'No se pudo descargar el PDF firmado');
        } finally {
            setPdfActionLoadingId(null);
        }
    };

    const handleSendComprobanteClick = async (paymentId, employeeName = '') => {
        if (!paymentId || sendingComprobanteId !== null) return;
        const targetName = employeeName || 'este empleado';
        const confirmed = window.confirm(
            `Se enviará un mensaje de WhatsApp con el comprobante a ${targetName}.\n\n¿Deseas continuar?`
        );
        if (!confirmed) return;

        setSendingComprobanteId(paymentId);
        try {
            await onSendComprobante(paymentId, employeeName);
        } finally {
            setSendingComprobanteId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end" onClick={onClose}>
            <div
                className="w-full max-w-2xl bg-[var(--card-color)] h-full border-l border-[var(--border-color)] shadow-2xl flex flex-col"
                onClick={e => e.stopPropagation()}
                style={{ animation: 'slideInRight 0.3s ease-out' }}
            >
                {/* Header */}
                <div className="shrink-0 p-6 pb-0">
                    <div className="flex justify-between items-start mb-5">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">{MONTHS[monthIndex]} {year}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                                    periodNum === 1
                                        ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                                        : 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                                }`}>
                                    <span className="material-symbols-outlined text-sm">date_range</span>
                                    {periodLabel}
                                </span>
                                <span className="text-xs text-[var(--text-secondary-color)] font-mono">{periodDates}</span>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Stats cards */}
                    <div className="grid grid-cols-4 gap-3 mb-5">
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                            <div className="text-xl font-bold font-mono">{totalUsers}</div>
                            <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary-color)] font-bold mt-0.5">Total</div>
                        </div>
                        <div className="bg-green-500/10 border border-green-500/15 rounded-xl p-3 text-center">
                            <div className="text-xl font-bold font-mono text-green-400">{completedCount}</div>
                            <div className="text-[10px] uppercase tracking-widest text-green-400/70 font-bold mt-0.5">Pagados</div>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/15 rounded-xl p-3 text-center">
                            <div className="text-xl font-bold font-mono text-amber-400">{partialCount}</div>
                            <div className="text-[10px] uppercase tracking-widest text-amber-400/70 font-bold mt-0.5">Parciales</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                            <div className="text-xl font-bold font-mono text-[var(--text-secondary-color)]">{pendingCount}</div>
                            <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary-color)] font-bold mt-0.5">Pendientes</div>
                        </div>
                    </div>

                    {/* Billing status banner for 2nd fortnight */}
                    {is2ndFortnight && (
                        <div className={`mb-5 p-3.5 rounded-xl text-xs font-medium flex items-center gap-3 ${
                            billingConfirmed
                                ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                                : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                        }`}>
                            <span className="material-symbols-outlined text-lg">
                                {billingConfirmed ? 'verified' : 'info'}
                            </span>
                            <div className="flex-1">
                                <div className="font-bold text-sm">
                                    {billingConfirmed ? 'Informe confirmado' : 'Informe pendiente'}
                                </div>
                                <div className="opacity-80 mt-0.5">
                                    {billingConfirmed
                                        ? 'Comisiones disponibles para agregar a pagos parciales'
                                        : 'Los pagos de empleados con comisión se generarán como parciales'
                                    }
                                </div>
                            </div>
                            {!billingConfirmed && navigate && (
                                <button
                                    onClick={() => navigate(`/billing/generate?year=${year}&month=${monthIndex + 1}`)}
                                    className="shrink-0 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-200 hover:bg-amber-500/30 transition-colors text-xs font-bold"
                                >
                                    Ir a Billing
                                </button>
                            )}
                        </div>
                    )}

                    {/* Partial payments action banner */}
                    {is2ndFortnight && partialCount > 0 && billingConfirmed && (
                        <div className="mb-5 p-3.5 rounded-xl text-xs font-medium flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 text-purple-300">
                            <span className="material-symbols-outlined text-lg">pending_actions</span>
                            <div className="flex-1">
                                <div className="font-bold text-sm">{partialCount} pago{partialCount > 1 ? 's' : ''} esperando comisión</div>
                                <div className="opacity-80 mt-0.5">Agrega la comisión para completar estos pagos</div>
                            </div>
                        </div>
                    )}

                    {/* Separator */}
                    <div className="border-b border-[var(--border-color)]" />
                </div>

                {/* Employee List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {matrixUsers.map(user => {
                        const payment = paymentByUserId[user.id];
                        const isPaid = !!payment;
                        const isPartial = isPaid && payment.is_partial;
                        const isSigned = isPaid && payment.is_signed;
                        const isSendingComprobante = isPaid && sendingComprobanteId === payment.id;
                        const userPayType = user.payroll?.pay_type || 'fixed';
                        const userIsDaily = userPayType === 'daily';
                        const userIsHourly = userPayType === 'madrugones';

                        // Determine card style based on status
                        let cardStyle = 'border-[var(--border-color)] bg-[var(--background-color)] hover:bg-white/[0.03]';
                        if (isPaid && isPartial) {
                            cardStyle = 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10';
                        } else if (isPaid) {
                            cardStyle = 'border-green-500/30 bg-green-500/5 hover:bg-green-500/10';
                        }

                        return (
                            <div key={user.id} className={`rounded-2xl border ${cardStyle} transition-all duration-200`}>
                                {/* Main row */}
                                <div className="p-4 flex items-center gap-4">
                                    {/* Avatar / Status indicator */}
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
                                        isPaid && isPartial
                                            ? 'bg-amber-500/20 text-amber-400'
                                            : isPaid
                                                ? 'bg-green-500/20 text-green-400'
                                                : 'bg-white/10 text-[var(--text-secondary-color)]'
                                    }`}>
                                        {isPaid && !isPartial && <span className="material-symbols-outlined">check_circle</span>}
                                        {isPartial && <span className="material-symbols-outlined">schedule</span>}
                                        {!isPaid && <span className="material-symbols-outlined">person</span>}
                                    </div>

                                    {/* Employee info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold truncate">{user.name || user.username}</span>
                                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                                    userIsDaily
                                                        ? 'bg-amber-500/15 text-amber-400/80'
                                                        : userIsHourly
                                                            ? 'bg-cyan-500/15 text-cyan-400/80'
                                                            : 'bg-blue-500/10 text-blue-400/50'
                                                }`}>
                                                {userIsDaily ? 'Días' : (userIsHourly ? 'Horas' : 'Fijo')}
                                            </span>
                                        </div>
                                        <div className="text-xs text-[var(--text-secondary-color)] mt-0.5">
                                            {user.role}
                                            {isPaid && payment.pay_type === 'daily' && payment.days_worked > 0 && (
                                                <span className="ml-2 text-amber-400 font-medium">· {payment.days_worked} días</span>
                                            )}
                                            {isPaid && payment.pay_type === 'madrugones' && payment.hours_worked > 0 && (
                                                <span className="ml-2 text-cyan-400 font-medium">· {payment.hours_worked} horas</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Amount / Action */}
                                    <div className="shrink-0">
                                        {isPaid ? (
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <div className={`text-lg font-bold font-mono ${isPartial ? 'text-amber-400' : 'text-green-400'}`}>
                                                        {formatCLP(payment.total_paid)}
                                                    </div>
                                                    <div className={`text-[10px] font-bold uppercase tracking-wider ${isPartial ? 'text-amber-400/60' : 'text-green-400/60'}`}>
                                                        {isPartial ? 'Parcial' : (isSigned ? 'Firmado' : 'Completado')}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => onDelete(payment.id)}
                                                    className="p-2 text-red-500/50 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                                    title="Eliminar Pago"
                                                >
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => onPay(user)}
                                                className="px-5 py-2 bg-[var(--primary-color)] text-white text-sm font-bold rounded-xl hover:brightness-110 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                                            >
                                                Generar Pago
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Commission action for partial payments */}
                                {isPartial && billingConfirmed && (
                                    <div className="px-4 pb-4">
                                        <button
                                            onClick={() => onAddCommission(payment.id, user.id, monthIndex)}
                                            className="w-full py-2.5 bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-purple-500/20 active:scale-[0.98] transition-all"
                                        >
                                            <span className="material-symbols-outlined text-sm">add_circle</span>
                                            Agregar Comisión y Completar Pago
                                        </button>
                                    </div>
                                )}

                                {/* Partial note when billing not confirmed */}
                                {isPartial && !billingConfirmed && (
                                    <div className="px-4 pb-3">
                                        <div className="text-[11px] text-amber-400/50 flex items-center gap-1.5 bg-amber-500/5 rounded-lg px-3 py-2">
                                            <span className="material-symbols-outlined text-sm">info</span>
                                            Confirma el informe de billing para agregar comisiones
                                        </div>
                                    </div>
                                )}

                                {/* Actions for paid items */}
                                {isPaid && (
                                    <div className="px-4 pb-4 pt-0">
                                        <div className="flex gap-2 border-t border-[var(--border-color)] pt-3">
                                            {payment.is_signed ? (
                                                <button
                                                    onClick={() => handleDownloadSignedPdf(payment, user)}
                                                    disabled={pdfActionLoadingId === `dl-${payment.id}`}
                                                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
                                                >
                                                    <span className="material-symbols-outlined text-sm">download</span>
                                                    {pdfActionLoadingId === `dl-${payment.id}` ? 'Descargando...' : 'Descargar PDF firmado'}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => generatePaymentSlip(payment, user, config)}
                                                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                                                    Descargar PDF
                                                </button>
                                            )}

                                            {payment.is_signed ? (
                                                <button
                                                    onClick={() => handleOpenSignedPdf(payment, user)}
                                                    disabled={pdfActionLoadingId === `view-${payment.id}`}
                                                    className="flex-1 py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-green-500/20 transition-colors disabled:opacity-60"
                                                >
                                                    <span className="material-symbols-outlined text-sm">verified</span>
                                                    {pdfActionLoadingId === `view-${payment.id}` ? 'Abriendo...' : 'Ver PDF firmado'}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleSendComprobanteClick(payment.id, user.name || user.username || '')}
                                                    disabled={payment.is_partial || isSendingComprobante}
                                                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                                                        payment.is_partial
                                                            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400/60 cursor-not-allowed'
                                                            : isSendingComprobante
                                                                ? 'bg-blue-500/10 border border-blue-500/30 text-blue-300 opacity-80 cursor-wait'
                                                            : 'bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                                                    }`}
                                                >
                                                    {isSendingComprobante ? (
                                                        <div className="w-3.5 h-3.5 border-2 border-blue-300/60 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <span className="material-symbols-outlined text-sm">send</span>
                                                    )}
                                                    {payment.is_partial ? 'Pendiente comisión' : isSendingComprobante ? 'Enviando...' : 'Enviar comprobante'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer summary */}
                <div className="shrink-0 border-t border-[var(--border-color)] p-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary-color)] font-bold">Total Pagado</div>
                            <div className="text-xs text-[var(--text-secondary-color)] mt-0.5">{paidCount} de {totalUsers} empleados</div>
                        </div>
                        <div className="text-2xl font-bold font-mono text-white">
                            {formatCLP(totalPaid)}
                        </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-500"
                            style={{ width: `${totalUsers > 0 ? (paidCount / totalUsers) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            </div>

            {pdfModal && (
                <PdfViewerModal
                    title={pdfModal.title}
                    url={pdfModal.url}
                    filename={pdfModal.filename}
                    onClose={closePdfModal}
                />
            )}
        </div>
    );
}

function PdfViewerModal({ title, url, filename, onClose }) {
    if (!url) return null;
    return (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm p-3 flex items-center justify-center" onClick={onClose}>
            <div className="w-full max-w-5xl h-[90vh] bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="h-14 px-4 border-b border-[var(--border-color)] flex items-center justify-between bg-black/20">
                    <div className="font-bold text-sm truncate">{title || 'PDF'}</div>
                    <div className="flex items-center gap-2">
                        <a
                            href={url}
                            download={filename || 'documento.pdf'}
                            className="h-9 px-3 rounded-lg bg-white/10 border border-[var(--border-color)] text-xs font-bold inline-flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-sm">download</span>
                            Descargar
                        </a>
                        <button onClick={onClose} className="h-9 w-9 rounded-lg bg-white/10 border border-[var(--border-color)] inline-flex items-center justify-center">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                </div>
                <iframe title={title || 'PDF'} src={url} className="w-full flex-1 bg-[#1f2937]" />
            </div>
        </div>
    );
}

function ConfigForm({ config, onClose, onUpdate }) {
    const [formData, setFormData] = useState({ ...config });
    const [loading, setLoading] = useState(false);
    const [editingField, setEditingField] = useState(null); // 'auxilio', 'dominical', etc.
    const [tempValue, setTempValue] = useState('');
    const { notify } = useNotifications();

    const handleSaveField = async (field) => {
        setLoading(true);
        try {
            const isTextField = ['company_name', 'nit'].includes(field);
            const val = isTextField ? tempValue : Number(tempValue);

            if (!isTextField && (Number.isNaN(val) || val < 0)) {
                notify({ type: 'error', message: 'Ingresa un número válido mayor o igual a 0' });
                return;
            }

            const newConfig = { ...formData, [field]: val };
            const res = await apiFetch('/api/nomina/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });
            if (res.ok) {
                setFormData(newConfig);
                setEditingField(null);
                notify({ type: 'success', message: 'Configuración guardada' });
                if (onUpdate) onUpdate(); // Refresh the list without closing if needed
            }
        } catch (e) { console.error('Error updating config', e); }
        finally { setLoading(false); }
    };

    const renderField = (label, field, icon, options = {}) => {
        const { isCurrency = true, helper, suffix, placeholder } = options;
        const isEditing = editingField === field;
        const value = formData[field];
        const isText = ['company_name', 'nit'].includes(field);

        return (
            <div className={`p-4 rounded-2xl border transition-all flex justify-between items-start gap-3 group ${isEditing ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/5 border-[var(--border-color)] hover:bg-white/10'}`}>
                <div className="flex flex-col flex-1 gap-1">
                    <label className="text-[10px] uppercase font-bold text-[var(--text-secondary-color)] tracking-[0.2em]">{label}</label>
                    {isEditing ? (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200 max-w-full">
                            <input
                                type={isText ? "text" : "number"}
                                step={isCurrency ? "1" : "0.1"}
                                placeholder={placeholder}
                                value={tempValue}
                                onChange={e => setTempValue(e.target.value)}
                                className={`bg-[var(--dark-color)] border border-[var(--primary-color)] font-mono text-base px-3 py-2 rounded-lg outline-none shadow-lg ${isText ? 'w-full' : 'w-32'}`}
                                autoFocus
                            />
                            {!isCurrency && !isText && <span className="text-xs font-bold">{suffix || '%'}</span>}
                            <button onClick={() => handleSaveField(field)} disabled={loading} className="bg-[var(--success-color)] px-3 py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
                                <span className="material-symbols-outlined text-sm font-bold">check</span>
                            </button>
                            <button onClick={() => setEditingField(null)} className="bg-white/10 text-white px-3 py-2 rounded-lg hover:bg-white/20 active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                    ) : (
                        <div
                            className="flex items-center gap-2 cursor-pointer group/val"
                            onClick={() => { setEditingField(field); setTempValue(value ?? ''); }}
                        >
                            <span className={`font-mono text-xl font-bold tracking-tight ${isCurrency ? 'text-white' : (isText ? 'text-white uppercase' : 'text-blue-400')}`}>
                                {isText ? (value || 'SIN DEFINIR') : (isCurrency ? formatCLP(value) : `${value}${suffix || '%'}`)}
                            </span>
                            <span className="material-symbols-outlined text-sm text-[var(--primary-color)] opacity-0 group-hover/val:opacity-100 transition-opacity">edit</span>
                        </div>
                    )}
                    {helper && <p className="text-[11px] text-[var(--text-secondary-color)] leading-tight">{helper}</p>}
                </div>
                <div className={`p-3 rounded-xl transition-all shrink-0 ${isEditing ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-[var(--text-secondary-color)] opacity-70'}`}>
                    <span className="material-symbols-outlined text-xl">{icon}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 text-sm text-blue-100 flex gap-3 items-start">
                <span className="material-symbols-outlined text-lg">tips_and_updates</span>
                <div>
                    <p className="font-semibold text-blue-100">Consejo rápido</p>
                    <p className="text-blue-100/80">Los cambios se aplican de inmediato y afectan cálculos futuros. Revisa los valores antes de cerrar.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderField('Nombre Empresa', 'company_name', 'business', { isCurrency: false, helper: 'Se muestra en los PDFs y listados de nómina.', placeholder: 'Empresa S.A.' })}
                {renderField('NIT Empresa', 'nit', 'badge', { isCurrency: false, helper: 'Incluye dígito de verificación si aplica.', placeholder: '901234567' })}
            </div>

            <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary-color)] font-bold">Asignaciones fijas</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderField('Auxilio Transporte', 'auxilio_transporte', 'local_shipping', { helper: 'Se suma automáticamente a los colaboradores elegibles.' })}
                    {renderField('Valor Hora Madrugón', 'valor_madrugon', 'wb_sunny', { helper: 'Usado para recargos de madrugada.' })}
                </div>
            </div>

            <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary-color)] font-bold">Dominicales</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderField('Semestre 1 (Ene-Jun)', 'valor_dominical_s1', 'calendar_today', { helper: 'Valor fijo para turnos dominicales del primer semestre.' })}
                    {renderField('Semestre 2 (Jul-Dic)', 'valor_dominical_s2', 'calendar_today', { helper: 'Valor fijo para turnos dominicales del segundo semestre.' })}
                </div>
            </div>

            <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary-color)] font-bold">Aportes legales</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderField('Porcentaje Salud', 'porcentaje_salud', 'ecg_heart', { isCurrency: false, helper: 'Porcentaje que se descuenta al colaborador.', suffix: '%', placeholder: '4' })}
                    {renderField('Porcentaje Pensión', 'porcentaje_pension', 'savings', { isCurrency: false, helper: 'Porcentaje destinado a pensión.', suffix: '%', placeholder: '4' })}
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between pt-2 border-t border-[var(--border-color)]">
                <div className="text-xs text-[var(--text-secondary-color)] flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-[var(--primary-color)]">info</span>
                    Cambios guardados al confirmar cada campo.
                </div>
                <button
                    onClick={onClose}
                    className="md:w-auto w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-[var(--border-color)] rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all"
                >
                    Cerrar Configuración
                </button>
            </div>
        </div>
    );
}

function EmployeeManager({ onClose }) {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editDraft, setEditDraft] = useState({});
    const [savingId, setSavingId] = useState(null);

    // POS Assignments
    const [odooPOS, setOdooPOS] = useState([]); // Available POS from Odoo
    const [posAssignments, setPosAssignments] = useState({}); // { userId: [{pos_name, commission_percentage}] }
    const [posAssignDraft, setPosAssignDraft] = useState([]); // Draft for currently editing employee
    const { notify } = useNotifications();

    useEffect(() => {
        loadEmployees();
        loadOdooPOS();
        loadAllPosAssignments();
    }, []);

    const loadEmployees = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/nomina/employees');
            if (res.ok) setEmployees(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const loadOdooPOS = async () => {
        try {
            const res = await apiFetch('/api/nomina/odoo/pos');
            if (res.ok) {
                const data = await res.json();
                setOdooPOS(data || []);
            }
        } catch (e) { console.error(e); }
    };

    const loadAllPosAssignments = async () => {
        try {
            const res = await apiFetch('/api/nomina/pos-assignments');
            if (res.ok) {
                const data = await res.json();
                const map = {};
                data.forEach(a => {
                    if (!map[a.user_id]) map[a.user_id] = [];
                    map[a.user_id].push(a);
                });
                setPosAssignments(map);
            }
        } catch (e) { console.error(e); }
    };

    const startEdit = (emp) => {
        const payType = emp.payroll?.pay_type || 'fixed';
        setEditingId(emp.id);
        setEditDraft({
            full_name: emp.full_name || '',
            cedula: emp.cedula || '',
            celular: emp.celular || '',
            pay_type: payType,
            base_salary: emp.payroll?.base_salary || 0,
            daily_rate: emp.payroll?.daily_rate || 0,
            hourly_rate: emp.payroll?.hourly_rate || 0,
        });
        // Load POS assignments draft
        const existing = posAssignments[emp.id] || [];
        setPosAssignDraft(existing.map(a => ({ pos_name: a.pos_name, commission_percentage: a.commission_percentage })));
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditDraft({});
        setPosAssignDraft([]);
    };

    const handleSaveRow = async (empId) => {
        setSavingId(empId);
        try {
            const payload = {
                full_name: editDraft.full_name,
                cedula: editDraft.cedula,
                celular: editDraft.celular,
                pay_type: editDraft.pay_type,
                base_salary: Number(editDraft.base_salary),
                daily_rate: Number(editDraft.daily_rate),
                hourly_rate: Number(editDraft.hourly_rate),
            };

            const [empRes, posRes] = await Promise.all([
                apiFetch(`/api/nomina/employees/${empId}/salary`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }),
                apiFetch(`/api/nomina/employees/${empId}/pos-assignments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assignments: posAssignDraft.filter(a => a.pos_name) })
                })
            ]);

            if (empRes.ok) {
                setEmployees(prev => prev.map(e => {
                    if (e.id === empId) {
                        return {
                            ...e,
                            full_name: editDraft.full_name,
                            cedula: editDraft.cedula,
                            celular: editDraft.celular,
                            payroll: {
                                ...e.payroll,
                                pay_type: editDraft.pay_type,
                                base_salary: Number(editDraft.base_salary),
                                daily_rate: Number(editDraft.daily_rate),
                                hourly_rate: Number(editDraft.hourly_rate),
                            }
                        };
                    }
                    return e;
                }));
            }

            if (posRes.ok) {
                const updatedAssigns = await posRes.json();
                setPosAssignments(prev => ({ ...prev, [empId]: updatedAssigns }));
            }

            setEditingId(null);
            setEditDraft({});
            setPosAssignDraft([]);
            notify({ type: 'success', message: 'Empleado actualizado correctamente' });
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Error de conexión' });
        } finally {
            setSavingId(null);
        }
    };

    const addPosAssignment = () => {
        setPosAssignDraft(prev => [...prev, { pos_name: '', commission_percentage: 5 }]);
    };

    const removePosAssignment = (idx) => {
        setPosAssignDraft(prev => prev.filter((_, i) => i !== idx));
    };

    const updatePosAssignment = (idx, field, value) => {
        setPosAssignDraft(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
    };

    // Get POS names from Odoo or from existing assignments
    const availablePosNames = odooPOS.map(p => p.name || p.Name || p.pos_name || `POS ${p.id}`);

    // Stats
    const totalEmployees = employees.length;
    const dailyCount = employees.filter(e => (e.payroll?.pay_type || 'fixed') === 'daily').length;
    const hourlyCount = employees.filter(e => (e.payroll?.pay_type || 'fixed') === 'madrugones').length;
    const fixedCount = totalEmployees - dailyCount - hourlyCount;
    const withPosCount = employees.filter(e => (posAssignments[e.id] || []).length > 0).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="shrink-0 p-6 border-b border-[var(--border-color)]">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <span className="material-symbols-outlined text-[var(--primary-color)]">groups</span>
                                Empleados
                            </h2>
                            <p className="text-xs text-[var(--text-secondary-color)] mt-1">
                                Gestiona información, tipo de pago y asignación de POS para cada empleado.
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-5 gap-3">
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                            <div className="text-lg font-bold font-mono">{totalEmployees}</div>
                            <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary-color)] font-bold">Total</div>
                        </div>
                        <div className="bg-blue-500/10 border border-blue-500/15 rounded-xl p-3 text-center">
                            <div className="text-lg font-bold font-mono text-blue-400">{fixedCount}</div>
                            <div className="text-[10px] uppercase tracking-widest text-blue-400/70 font-bold">Fijo</div>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/15 rounded-xl p-3 text-center">
                            <div className="text-lg font-bold font-mono text-amber-400">{dailyCount}</div>
                            <div className="text-[10px] uppercase tracking-widest text-amber-400/70 font-bold">Por Días</div>
                        </div>
                        <div className="bg-cyan-500/10 border border-cyan-500/15 rounded-xl p-3 text-center">
                            <div className="text-lg font-bold font-mono text-cyan-400">{hourlyCount}</div>
                            <div className="text-[10px] uppercase tracking-widest text-cyan-400/70 font-bold">Por Horas</div>
                        </div>
                        <div className="bg-purple-500/10 border border-purple-500/15 rounded-xl p-3 text-center">
                            <div className="text-lg font-bold font-mono text-purple-400">{withPosCount}</div>
                            <div className="text-[10px] uppercase tracking-widest text-purple-400/70 font-bold">Con POS</div>
                        </div>
                    </div>
                </div>

                {/* Employee List */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />)}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {employees.map(emp => {
                                const isEditing = editingId === emp.id;
                                const isSaving = savingId === emp.id;
                                const payType = isEditing ? editDraft.pay_type : (emp.payroll?.pay_type || 'fixed');
                                const isDaily = payType === 'daily';
                                const isHourly = payType === 'madrugones';
                                const empPosAssigns = posAssignments[emp.id] || [];
                                const salaryAmount = isDaily
                                    ? (emp.payroll?.daily_rate || 0)
                                    : isHourly
                                        ? (emp.payroll?.hourly_rate || 0)
                                        : (emp.payroll?.base_salary || 0);

                                return (
                                    <div key={emp.id} className={`rounded-2xl border transition-all duration-200 ${
                                        isEditing
                                            ? 'border-[var(--primary-color)]/40 bg-[var(--primary-color)]/5 shadow-lg shadow-[var(--primary-color)]/5'
                                            : 'border-[var(--border-color)] bg-[var(--background-color)] hover:bg-white/[0.02]'
                                    }`}>
                                        {/* Main row */}
                                        <div className="p-4 flex items-center gap-4">
                                            {/* Avatar */}
                                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
                                                isDaily
                                                    ? 'bg-amber-500/15 text-amber-400'
                                                    : isHourly
                                                        ? 'bg-cyan-500/15 text-cyan-400'
                                                        : 'bg-blue-500/15 text-blue-400'
                                            }`}>
                                                <span className="material-symbols-outlined">
                                                    {isDaily ? 'calendar_today' : (isHourly ? 'schedule' : 'person')}
                                                </span>
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold truncate">{emp.name || emp.username}</span>
                                                    <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                                        isDaily
                                                            ? 'bg-amber-500/15 text-amber-400/80'
                                                            : isHourly
                                                                ? 'bg-cyan-500/15 text-cyan-400/80'
                                                                : 'bg-blue-500/10 text-blue-400/60'
                                                    }`}>
                                                        {isDaily ? 'Días' : (isHourly ? 'Horas' : 'Fijo')}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--text-secondary-color)]">
                                                    <span>{emp.role}</span>
                                                    {emp.full_name && (
                                                        <>
                                                            <span className="text-white/10">|</span>
                                                            <span>{emp.full_name}</span>
                                                        </>
                                                    )}
                                                    {emp.cedula && (
                                                        <>
                                                            <span className="text-white/10">|</span>
                                                            <span className="font-mono">{emp.cedula}</span>
                                                        </>
                                                    )}
                                                    {emp.celular && (
                                                        <>
                                                            <span className="text-white/10">|</span>
                                                            <span className="font-mono">{emp.celular}</span>
                                                        </>
                                                    )}
                                                </div>
                                                {/* POS badges (view mode only) */}
                                                {!isEditing && empPosAssigns.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                                        {empPosAssigns.map((a, i) => (
                                                            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-300 text-[9px] border border-purple-500/20">
                                                                <span className="material-symbols-outlined text-[9px]">store</span>
                                                                {a.pos_name}
                                                                <span className="text-purple-400/60 font-mono">{a.commission_percentage}%</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Salary */}
                                            <div className="text-right shrink-0">
                                                {!isEditing && (
                                                    <>
                                                        <div className="text-lg font-bold font-mono">{formatCLP(salaryAmount)}</div>
                                                        <div className="text-[10px] text-[var(--text-secondary-color)] uppercase tracking-wider">
                                                            {isDaily ? '/ día' : (isHourly ? '/ hora' : '/ mes')}
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="shrink-0">
                                                {isEditing ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleSaveRow(emp.id)}
                                                            disabled={isSaving}
                                                            className="px-4 py-2 bg-[var(--success-color)] rounded-xl text-sm font-bold hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">
                                                                {isSaving ? 'hourglass_empty' : 'check'}
                                                            </span>
                                                            Guardar
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            disabled={isSaving}
                                                            className="p-2 bg-white/10 rounded-xl hover:bg-white/20 active:scale-95 transition-all disabled:opacity-50"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => startEdit(emp)}
                                                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-[var(--text-secondary-color)] hover:text-white"
                                                        title="Editar empleado"
                                                    >
                                                        <span className="material-symbols-outlined">edit</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Edit form (expanded) */}
                                        {isEditing && (
                                            <div className="px-4 pb-4 space-y-4">
                                                <div className="border-t border-[var(--border-color)] pt-4" />

                                                {/* Form fields grid */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {/* Nombre Legal */}
                                                    <div>
                                                        <label className="block text-[10px] uppercase tracking-widest text-[var(--text-secondary-color)] font-bold mb-1.5">
                                                            Nombre Legal
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={editDraft.full_name}
                                                            onChange={e => setEditDraft({ ...editDraft, full_name: e.target.value })}
                                                            className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] focus:border-[var(--primary-color)] rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
                                                            placeholder="Nombre completo para documentos"
                                                        />
                                                    </div>

                                                    {/* Cédula */}
                                                    <div>
                                                        <label className="block text-[10px] uppercase tracking-widest text-[var(--text-secondary-color)] font-bold mb-1.5">
                                                            Cédula
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={editDraft.cedula}
                                                            onChange={e => setEditDraft({ ...editDraft, cedula: e.target.value })}
                                                            className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] focus:border-[var(--primary-color)] rounded-xl px-3 py-2.5 text-sm font-mono outline-none transition-colors"
                                                            placeholder="Número de documento"
                                                        />
                                                    </div>

                                                    {/* Celular */}
                                                    <div>
                                                        <label className="block text-[10px] uppercase tracking-widest text-[var(--text-secondary-color)] font-bold mb-1.5">
                                                            Celular (WhatsApp)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={editDraft.celular}
                                                            onChange={e => setEditDraft({ ...editDraft, celular: e.target.value })}
                                                            className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] focus:border-[var(--primary-color)] rounded-xl px-3 py-2.5 text-sm font-mono outline-none transition-colors"
                                                            placeholder="3201234567"
                                                        />
                                                    </div>

                                                    {/* Tipo de Pago */}
                                                    <div>
                                                        <label className="block text-[10px] uppercase tracking-widest text-[var(--text-secondary-color)] font-bold mb-1.5">
                                                            Tipo de Pago
                                                        </label>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => setEditDraft({ ...editDraft, pay_type: 'daily' })}
                                                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-[0.98] ${
                                                                    isDaily
                                                                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                                                        : 'bg-white/5 text-[var(--text-secondary-color)] border-[var(--border-color)] hover:bg-white/10'
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-sm align-middle mr-1">calendar_today</span>
                                                                Por Días
                                                            </button>
                                                            <button
                                                                onClick={() => setEditDraft({ ...editDraft, pay_type: 'fixed' })}
                                                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-[0.98] ${
                                                                    (!isDaily && !isHourly)
                                                                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                                                        : 'bg-white/5 text-[var(--text-secondary-color)] border-[var(--border-color)] hover:bg-white/10'
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-sm align-middle mr-1">attach_money</span>
                                                                Fijo
                                                            </button>
                                                            <button
                                                                onClick={() => setEditDraft({ ...editDraft, pay_type: 'madrugones' })}
                                                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-[0.98] ${
                                                                    isHourly
                                                                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                                                                        : 'bg-white/5 text-[var(--text-secondary-color)] border-[var(--border-color)] hover:bg-white/10'
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-sm align-middle mr-1">schedule</span>
                                                                Madrugones
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Salario / Valor Día */}
                                                    <div>
                                                        <label className="block text-[10px] uppercase tracking-widest text-[var(--text-secondary-color)] font-bold mb-1.5">
                                                            {isDaily ? 'Valor por Día ($)' : (isHourly ? 'Valor por Hora ($)' : 'Salario Base Mensual ($)')}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={isDaily ? editDraft.daily_rate : (isHourly ? editDraft.hourly_rate : editDraft.base_salary)}
                                                            onChange={e => setEditDraft({
                                                                ...editDraft,
                                                                [isDaily ? 'daily_rate' : (isHourly ? 'hourly_rate' : 'base_salary')]: e.target.value
                                                            })}
                                                            className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] focus:border-[var(--primary-color)] rounded-xl px-3 py-2.5 text-sm font-mono outline-none transition-colors"
                                                            placeholder="0"
                                                            min="0"
                                                        />
                                                    </div>
                                                </div>

                                                {/* POS Assignments */}
                                                <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-purple-400 text-lg">store</span>
                                                            <div>
                                                                <div className="text-xs font-bold uppercase tracking-wider text-purple-300">Puntos de Venta</div>
                                                                <div className="text-[10px] text-purple-300/50">Asigna locales y porcentaje de comisión</div>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={addPosAssignment}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold hover:bg-purple-500/25 active:scale-95 transition-all"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">add</span>
                                                            Agregar POS
                                                        </button>
                                                    </div>

                                                    {posAssignDraft.length === 0 && (
                                                        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary-color)] italic py-3 px-2 bg-white/5 rounded-lg">
                                                            <span className="material-symbols-outlined text-sm">info</span>
                                                            Sin puntos de venta asignados — la comisión no aplicará para este empleado.
                                                        </div>
                                                    )}

                                                    {posAssignDraft.map((assign, idx) => (
                                                        <div key={idx} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                                                            <select
                                                                value={assign.pos_name}
                                                                onChange={e => updatePosAssignment(idx, 'pos_name', e.target.value)}
                                                                className="flex-1 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-sm outline-none"
                                                            >
                                                                <option value="">Seleccionar POS...</option>
                                                                {availablePosNames.map(name => (
                                                                    <option key={name} value={name}>{name}</option>
                                                                ))}
                                                            </select>
                                                            <div className="flex items-center gap-1.5 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-xl px-3 py-2">
                                                                <input
                                                                    type="number"
                                                                    value={assign.commission_percentage}
                                                                    onChange={e => updatePosAssignment(idx, 'commission_percentage', Number(e.target.value) || 0)}
                                                                    className="w-14 text-right bg-transparent text-sm font-mono outline-none"
                                                                    min="0"
                                                                    max="100"
                                                                    step="0.5"
                                                                />
                                                                <span className="text-xs text-[var(--text-secondary-color)] font-bold">%</span>
                                                            </div>
                                                            <button
                                                                onClick={() => removePosAssignment(idx)}
                                                                className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                                                title="Quitar POS"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">close</span>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function SignatureLinkModal({ payload, onClose }) {
    const [copyState, setCopyState] = useState('idle');
    const signingUrl = payload?.signingUrl || '';
    const dispatchMode = payload?.dispatchMode || 'preview_only';
    const dispatchMeta = {
        whatsapp_sent: {
            title: 'Enviado por WhatsApp',
            description: 'El link se envió automáticamente al empleado.'
        },
        missing_phone: {
            title: 'Número no configurado',
            description: 'No se encontró un número válido del empleado. Comparte el link manualmente.'
        },
        dispatch_error: {
            title: 'Error en envío automático',
            description: 'No fue posible enviar el mensaje. Comparte el link manualmente.'
        },
        preview_only: {
            title: 'Modo manual',
            description: 'Comparte el link manualmente con el empleado.'
        }
    };
    const currentDispatch = dispatchMeta[dispatchMode] || dispatchMeta.preview_only;

    const handleCopy = async () => {
        if (!signingUrl) return;
        try {
            await navigator.clipboard.writeText(signingUrl);
            setCopyState('copied');
            setTimeout(() => setCopyState('idle'), 1500);
        } catch (e) {
            console.error(e);
            setCopyState('error');
            setTimeout(() => setCopyState('idle'), 1500);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-6 max-w-lg w-full shadow-2xl">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-bold">Enviar comprobante</h3>
                        <p className="text-xs text-[var(--text-secondary-color)] mt-1">
                            {payload?.employeeName ? `${payload.employeeName} · ` : ''}Pago #{payload?.paymentId}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="rounded-xl border border-[var(--border-color)] bg-white/5 p-3 break-all text-xs font-mono">
                        {signingUrl}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={handleCopy}
                            className="h-11 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-sm font-bold"
                        >
                            {copyState === 'copied' ? 'Copiado' : 'Copiar'}
                        </button>
                        <a
                            href={signingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-11 rounded-xl bg-[var(--primary-color)] text-white text-sm font-bold flex items-center justify-center"
                        >
                            Abrir link
                        </a>
                    </div>

                    <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-200">
                        <div><strong>Expira:</strong> {formatDateTime(payload?.expiresAt)}</div>
                        <div className="mt-1">
                            Estado de envío: <strong>{currentDispatch.title}</strong>.
                        </div>
                        <div className="mt-1">
                            {currentDispatch.description}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
