import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../api';
import { formatCLP } from '../formatMoney';
import { formatDateTimeCO } from '../dateFormat';
import { useNotifications } from './Notifications';
import { generatePaymentSlip } from '../utils/pdfGenerator';

const STEPS_FIXED = [
    { id: 1, title: 'Periodo', icon: 'date_range' },
    { id: 2, title: 'Salario Base', icon: 'attach_money' },
    { id: 3, title: 'Auxilio Transporte', icon: 'local_shipping' },
    { id: 4, title: 'Dominicales', icon: 'today' },
    { id: 5, title: 'Madrugones', icon: 'wb_twilight' },
    { id: 6, title: 'Adelantos', icon: 'money_off' },
    { id: 7, title: 'Seguridad Social', icon: 'health_and_safety' },
    { id: 8, title: 'Ajustes', icon: 'tune' },
    { id: 9, title: 'Resumen', icon: 'receipt_long' },
];

const STEPS_DAILY = [
    { id: 1, title: 'Días Trabajados', icon: 'calendar_today' },
    { id: 2, title: 'Adelantos', icon: 'money_off' },
    { id: 3, title: 'Resumen', icon: 'receipt_long' },
];

export default function PayrollWizard({ isOpen, onClose, employee, config, onConfirm, initialDates, billingConfirmed = false, periodNum = 1, hasCommission = false }) {
    const { notify } = useNotifications();
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Pay type from employee payroll
    const payType = employee?.payroll?.pay_type || 'fixed';
    const isDaily = payType === 'daily';
    const STEPS = isDaily ? STEPS_DAILY : STEPS_FIXED;

    // Global State
    const [period, setPeriod] = useState({ start: '', end: '' });
    const [baseSalary, setBaseSalary] = useState(0);
    const [dailyRate, setDailyRate] = useState(0);
    const [isEditingBase, setIsEditingBase] = useState(false);
    const [tempBaseSalary, setTempBaseSalary] = useState(0);
    const [tempDailyRate, setTempDailyRate] = useState(0);
    const [daysWorked, setDaysWorked] = useState(15);

    // Calendar selection for daily employees
    const [selectedDays, setSelectedDays] = useState([]);

    // Step 3: Sundays
    const [sundaysMode, setSundaysMode] = useState('manual'); // manual, odoo
    const [sundaysManualQty, setSundaysManualQty] = useState(0);
    const [sundaysOdooPos, setSundaysOdooPos] = useState(null);
    const [sundaysOdooSessions, setSundaysOdooSessions] = useState([]);
    const [sundayValue, setSundayValue] = useState(config?.valor_dominical || 0);
    const [isEditingSundayValue, setIsEditingSundayValue] = useState(false);
    const [tempSundayValue, setTempSundayValue] = useState(0);

    // Step 4: Madrugones
    const [madrugonesMode, setMadrugonesMode] = useState('none'); // none, manual, odoo
    const [madrugonesManualQty, setMadrugonesManualQty] = useState(0);
    const [madrugonesOdooPos, setMadrugonesOdooPos] = useState(null);
    const [madrugonesOdooSessions, setMadrugonesOdooSessions] = useState([]);
    const [madrugonValue, setMadrugonValue] = useState(config?.valor_madrugon || 10000);
    const [isEditingMadrugonValue, setIsEditingMadrugonValue] = useState(false);
    const [tempMadrugonValue, setTempMadrugonValue] = useState(0);

    // Step 5: Advances
    const [advance, setAdvance] = useState(0);
    const [advanceMode, setAdvanceMode] = useState('none'); // none, manual

    // Auxilio de transporte (solo pago fijo)
    const [includesTransportAid, setIncludesTransportAid] = useState(true);

    // Step 6: Health/Pension
    const [includesSecurity, setIncludesSecurity] = useState(true);
    const [health, setHealth] = useState(0);
    const [pension, setPension] = useState(0);

    // Configurable Percentages
    const [healthPercentage, setHealthPercentage] = useState(4.0);
    const [pensionPercentage, setPensionPercentage] = useState(4.0);
    const [isEditingHealthPct, setIsEditingHealthPct] = useState(false);
    const [isEditingPensionPct, setIsEditingPensionPct] = useState(false);
    const [tempHealthPct, setTempHealthPct] = useState(4.0);
    const [tempPensionPct, setTempPensionPct] = useState(4.0);

    // Step 7: Adjustments
    const [adjustments, setAdjustments] = useState([]); // { type: 'income'|'deduction', label: '', value: 0 }

    // Commission (2da quincena only)
    const [commission, setCommission] = useState(0);
    const [commissionDetails, setCommissionDetails] = useState([]);
    const [, setCommissionConfirmed] = useState(false);

    // Odoo Data
    const [posList, setPosList] = useState([]);

    // Init
    useEffect(() => {
        if (isOpen && employee) {
            const currentSalary = employee.payroll?.base_salary || 0;
            const currentDailyRate = employee.payroll?.daily_rate || 0;
            setBaseSalary(currentSalary);
            setDailyRate(currentDailyRate);
            setTempBaseSalary(currentSalary);
            setTempDailyRate(currentDailyRate);
            setIsEditingBase(false);

            // Determine Sunday Value based on Period Month
            let sv = 0;
            // Need period start date. If initialDates is set, use it. Else calculate default.
            let pStart = null;
            if (initialDates) {
                const dates = typeof initialDates === 'function' ? initialDates() : initialDates;
                pStart = new Date(dates.start);
            } else {
                const now = new Date(); // Default to now if no dates provided (initially) which might be wrong but it recalcs later
                pStart = now;
            }

            // Re-eval when period changes actually? UseEffect below handles period setting.
            // Let's rely on period state? No, period state is set inside this effect later.
            // But we have initialDates prop.

            const monthIndex = pStart.getMonth(); // 0-11
            if (monthIndex < 6) {
                // Semester 1
                sv = config?.valor_dominical_s1 || config?.valor_dominical || 0;
            } else {
                // Semester 2
                sv = config?.valor_dominical_s2 || config?.valor_dominical || 0;
            }

            setSundayValue(sv);
            setTempSundayValue(sv);
            setIsEditingSundayValue(false);
            setMadrugonValue(config?.valor_madrugon || 10000);
            setTempMadrugonValue(config?.valor_madrugon || 10000);
            setIsEditingMadrugonValue(false);
            setAdvance(0);
            setAdvanceMode('none');
            setIncludesTransportAid(!isDaily);
            setSelectedDays([]);

            // Security Init
            const sec = employee.payroll?.has_security !== undefined ? employee.payroll.has_security : true;
            setIncludesSecurity(sec);
            setHealthPercentage(config?.porcentaje_salud || 4.0);
            setTempHealthPct(config?.porcentaje_salud || 4.0);
            setPensionPercentage(config?.porcentaje_pension || 4.0);
            setTempPensionPct(config?.porcentaje_pension || 4.0);

            setCurrentStep(1);

            // Set Period
            if (initialDates) {
                const dates = typeof initialDates === 'function' ? initialDates() : initialDates;
                setPeriod(dates);
            } else {
                // Default: Current fortnight
                const now = new Date();
                const day = now.getDate();
                const year = now.getFullYear();
                const month = now.getMonth();
                if (day <= 15) {
                    setPeriod({
                        start: new Date(year, month, 1).toISOString().split('T')[0],
                        end: new Date(year, month, 15).toISOString().split('T')[0]
                    });
                } else {
                    setPeriod({
                        start: new Date(year, month, 16).toISOString().split('T')[0],
                        end: new Date(year, month + 1, 0).toISOString().split('T')[0]
                    });
                }
            }

            // Reset commission
            setCommission(0);
            setCommissionDetails([]);
            setCommissionConfirmed(false);

            // Load POS list
            apiFetch('/api/nomina/odoo/pos')
                .then(async res => {
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data)) setPosList(data);
                        else console.error('Odoo POS response not array:', data);
                    } else {
                        console.error('Odoo POS fetch error:', await res.text());
                    }
                })
                .catch(console.error);

            // Load commission if 2nd fortnight AND billing is confirmed
            const periodStart = initialDates
                ? (typeof initialDates === 'function' ? initialDates() : initialDates).start
                : null;
            if (periodStart) {
                const startDate = new Date(periodStart);
                const day = startDate.getUTCDate();
                if (day > 15 && employee?.id && billingConfirmed) {
                    // 2nd fortnight with confirmed billing — fetch commission
                    const cMonth = startDate.getUTCMonth() + 1;
                    const cYear = startDate.getUTCFullYear();
                    apiFetch(`/api/billing/commission?year=${cYear}&month=${cMonth}&user_id=${employee.id}`)
                        .then(async res => {
                            if (res.ok) {
                                const data = await res.json();
                                const total = Math.round(data.total || 0);
                                setCommission(total);
                                setCommissionDetails(data.details || []);
                                setCommissionConfirmed(!!data.confirmed);
                            }
                        })
                        .catch(console.error);
                }
            }
        }
    }, [isOpen, employee, initialDates, config?.valor_dominical, config?.valor_dominical_s1, config?.valor_dominical_s2, config?.valor_madrugon, config?.porcentaje_salud, config?.porcentaje_pension, billingConfirmed, isDaily]);

    // Derived Values
    const effectiveDaysWorked = isDaily ? selectedDays.length : 0;
    const paidBase = isDaily ? Math.round(dailyRate * effectiveDaysWorked) : Math.round(baseSalary / 2);
    const transport = (isDaily || !includesTransportAid) ? 0 : (config?.auxilio_transporte || 0) / 2;

    const handleUpdateBaseSalary = async () => {
        setLoading(true);
        try {
            const payload = isDaily
                ? { daily_rate: Number(tempDailyRate) }
                : { base_salary: Number(tempBaseSalary) };

            const res = await apiFetch(`/api/nomina/employees/${employee.id}/salary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (isDaily) {
                    setDailyRate(Number(tempDailyRate));
                } else {
                    setBaseSalary(Number(tempBaseSalary));
                }
                setIsEditingBase(false);
                notify({ type: 'success', message: isDaily ? 'Valor por día actualizado correctamente' : 'Salario base actualizado correctamente' });
            } else {
                const errorData = await res.json();
                notify({ type: 'error', message: errorData.error || 'Error al actualizar' });
            }
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Error de conexión' });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSundayValue = async () => {
        setLoading(true);
        try {
            // Determine which semester to update
            const pStart = new Date(period.start);
            const monthIndex = pStart.getMonth();
            const isS1 = monthIndex < 6;
            const field = isS1 ? 'valor_dominical_s1' : 'valor_dominical_s2';

            const res = await apiFetch('/api/nomina/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, [field]: Number(tempSundayValue) })
            });

            if (res.ok) {
                setSundayValue(Number(tempSundayValue));
                setIsEditingSundayValue(false);
                notify({ type: 'success', message: 'Valor dominical actualizado correctamente' });
            } else {
                notify({ type: 'error', message: 'Error al actualizar el valor dominical' });
            }
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Error de conexión' });
        } finally {
            setLoading(false);
        }
    };
    const handleUpdateMadrugonValue = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/nomina/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, valor_madrugon: Number(tempMadrugonValue) })
            });

            if (res.ok) {
                setMadrugonValue(Number(tempMadrugonValue));
                setIsEditingMadrugonValue(false);
                notify({ type: 'success', message: 'Valor hora madrugón actualizado correctamente' });
            } else {
                notify({ type: 'error', message: 'Error al actualizar el valor madrugón' });
            }
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Error de conexión' });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateConfig = async (field, value) => {
        setLoading(true);
        try {
            const newConfig = { ...config, [field]: Number(value) };
            const res = await apiFetch('/api/nomina/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });

            if (res.ok) {
                if (field === 'porcentaje_salud') {
                    setHealthPercentage(Number(value));
                    setIsEditingHealthPct(false);
                }
                if (field === 'porcentaje_pension') {
                    setPensionPercentage(Number(value));
                    setIsEditingPensionPct(false);
                }
                notify({ type: 'success', message: 'Configuración actualizada correctamente' });
            } else {
                notify({ type: 'error', message: 'Error al actualizar configuración' });
            }
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Error de conexión' });
        } finally {
            setLoading(false);
        }
    };

    const sundaysQty = useMemo(() => {
        if (sundaysMode === 'manual') return Number(sundaysManualQty);
        // Odoo calculation: sessions starting on Sunday (Day 0)
        return (Array.isArray(sundaysOdooSessions) ? sundaysOdooSessions : []).filter(s => {
            const d = new Date(s.start_at);
            // In JS getDay(): 0=Sunday
            return d.getUTCDay() === 0;
        }).length;
    }, [sundaysMode, sundaysManualQty, sundaysOdooSessions]);

    // Helper to get Bogota time parts
    const getBogotaTime = (dateObj) => {
        const fmt = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
            timeZone: 'America/Bogota'
        });
        const parts = fmt.formatToParts(dateObj);
        const h = parseInt(parts.find(p => p.type === 'hour').value);
        const m = parseInt(parts.find(p => p.type === 'minute').value);
        return { h, m };
    };

    const calculateMadrugonHours = React.useCallback((start_at) => {
        const d = new Date(start_at);
        const bogotaDay = new Date(d.toLocaleString("en-US", { timeZone: "America/Bogota" })).getDay();

        // Only Wed(3) and Sat(6)
        if (bogotaDay !== 3 && bogotaDay !== 6) return 0;

        const targetHour = 9;
        const { h: startHour, m: startMin } = getBogotaTime(d);

        if (startHour >= targetHour) return 0;

        let effectiveHour = startHour;
        let effectiveMin = 0;

        if (startMin >= 15 && startMin < 45) {
            effectiveMin = 30;
        } else if (startMin >= 45) {
            effectiveHour += 1;
            effectiveMin = 0;
        }

        const effectiveDiffMin = (targetHour * 60) - (effectiveHour * 60 + effectiveMin);
        return effectiveDiffMin > 0 ? effectiveDiffMin / 60 : 0;
    }, []);

    const madrugonesQty = useMemo(() => {
        if (madrugonesMode === 'manual') return Number(madrugonesManualQty);
        if (madrugonesMode === 'none') return 0;

        let hours = 0;
        (madrugonesOdooSessions || []).forEach(s => {
            hours += calculateMadrugonHours(s.start_at);
        });
        return hours;
    }, [madrugonesMode, madrugonesManualQty, madrugonesOdooSessions, calculateMadrugonHours]);

    // Determine if this payment should be partial:
    // Only 2nd fortnight + employee has commission assigned = partial
    // 1st fortnight ALWAYS completes immediately
    // No commission ALWAYS completes immediately
    const is2ndFortnight = periodNum === 2;
    const shouldBePartial = is2ndFortnight && hasCommission;

    // Effective commission: 0 if partial
    const effectiveCommission = shouldBePartial ? 0 : commission;

    const totalCalculated = useMemo(() => {
        if (isDaily) {
            // Daily employees: days worked minus advance + commission
            return paidBase - advance + effectiveCommission;
        }
        const sundaysVal = sundaysQty * sundayValue;
        const madrugonesVal = madrugonesQty * madrugonValue;
        const incomeAdj = adjustments.filter(a => a.type === 'income').reduce((acc, a) => acc + Number(a.value), 0);
        const dedAdj = adjustments.filter(a => a.type === 'deduction').reduce((acc, a) => acc + Number(a.value), 0);

        return paidBase + transport + sundaysVal + madrugonesVal + effectiveCommission + incomeAdj - health - pension - advance - dedAdj;
    }, [isDaily, paidBase, transport, sundaysQty, sundayValue, madrugonesQty, madrugonValue, health, pension, advance, adjustments, effectiveCommission]);


    // Step Handlers
    const maxStep = STEPS.length;
    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, maxStep));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    // Odoo Fetchers
    const fetchOdooSessions = async (type) => {
        setLoading(true);
        try {
            const posId = type === 'sundays' ? sundaysOdooPos : madrugonesOdooPos;
            if (!posId) return;
            // Use ISO dates with time to cover full days in UTC?
            // "2023-01-01" -> "2023-01-01T00:00:00Z"
            const startT = new Date(period.start + 'T00:00:00');
            const endT = new Date(period.end + 'T23:59:59');

            const params = new URLSearchParams({
                pos_id: posId,
                start: startT.toISOString(),
                end: endT.toISOString()
            });
            const res = await apiFetch(`/api/nomina/odoo/sessions?${params}`);
            const data = await res.json();

            if (type === 'sundays') setSundaysOdooSessions(Array.isArray(data) ? data : []);
            if (type === 'madrugones') setMadrugonesOdooSessions(Array.isArray(data) ? data : []);
        } catch (e) {
            notify({ type: 'error', message: 'Error cargando sesiones de Odoo' });
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        // Recalc health/pension when base changes or toggle changes
        if (includesSecurity) {
            setHealth(Math.round(paidBase * (healthPercentage / 100)));
            setPension(Math.round(paidBase * (pensionPercentage / 100)));
        } else {
            setHealth(0);
            setPension(0);
        }
    }, [paidBase, healthPercentage, pensionPercentage, includesSecurity]);



    const handleConfirm = async () => {
        setLoading(true);
        try {
            const payload = {
                user_id: employee.id,
                period_start: new Date(period.start + 'T00:00:00Z').toISOString(),
                period_end: new Date(period.end + 'T23:59:59Z').toISOString(),
                days_worked: isDaily ? effectiveDaysWorked : 0,
                sundays_qty: isDaily ? 0 : sundaysQty,
                madrugones_qty: isDaily ? 0 : madrugonesQty,
                advance: advance,
                commission: shouldBePartial ? 0 : commission, // Sin comisión si es parcial
                includes_security: isDaily ? false : includesSecurity,
                includes_transport_aid: isDaily ? false : includesTransportAid,
                notes: isDaily ? '' : JSON.stringify(adjustments),
                aditions: isDaily ? '[]' : JSON.stringify(adjustments.filter(a => a.type === 'income')),
                deductions: isDaily ? '[]' : JSON.stringify(adjustments.filter(a => a.type === 'deduction')),
                is_partial: shouldBePartial, // Marcar como parcial si billing no confirmado
            };

            const payment = await onConfirm(payload);

            if (payment) {
                notify({ type: 'success', message: 'Pago generado exitosamente' });
                try {
                    generatePaymentSlip(payment, employee, config);
                    console.log('PDF Generated');
                } catch (pdfErr) {
                    console.error('PDF Generation Error', pdfErr);
                    notify({ type: 'error', message: 'Error generando PDF' });
                }
            }
        } catch (e) {
            console.error(e);
            notify({ type: 'error', message: 'Error al procesar el pago' });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[var(--card-color)] w-full max-w-4xl max-h-[90vh] rounded-2xl border border-[var(--border-color)] shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center bg-[#111]">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-3">
                            {isDaily ? 'Recibo de Pago' : 'Generar Pago'}: {employee?.name}
                            {isDaily && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                    <span className="material-symbols-outlined text-[10px]">calendar_today</span>
                                    Por Días
                                </span>
                            )}
                        </h2>
                        <div className="text-xs text-[var(--text-secondary-color)] mt-1 flex gap-2">
                            <span>Paso {currentStep} de {maxStep}: {STEPS[currentStep - 1].title}</span>
                        </div>
                    </div>
                    {/* Stepper visual */}
                    <div className="hidden md:flex gap-1">
                        {STEPS.map((s) => (
                            <div key={s.id} className={`h-1 w-8 rounded-full transition-colors ${currentStep >= s.id ? 'bg-[var(--primary-color)]' : 'bg-white/10'}`} />
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8">

                    {/* STEP 1: PERIOD (Fixed) or CALENDAR (Daily) */}
                    {currentStep === 1 && !isDaily && (
                        <div className="space-y-6 max-w-lg mx-auto">
                            <h3 className="text-lg font-bold">Seleccionar Periodo de Pago</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-[var(--text-secondary-color)]">Fecha Inicio</label>
                                    <input type="date" value={period.start} onChange={e => setPeriod({ ...period, start: e.target.value })} className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] p-3 rounded-lg" />
                                </div>
                                <div>
                                    <label className="text-sm text-[var(--text-secondary-color)]">Fecha Fin</label>
                                    <input type="date" value={period.end} onChange={e => setPeriod({ ...period, end: e.target.value })} className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] p-3 rounded-lg" />
                                </div>
                            </div>
                            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-200">
                                Sugerencia automática basada en la fecha actual. Verifica que cubra la quincena correcta.
                            </div>
                        </div>
                    )}

                    {/* STEP 1 DAILY: Interactive Calendar */}
                    {currentStep === 1 && isDaily && (
                        <DailyCalendarStep
                            period={period}
                            selectedDays={selectedDays}
                            setSelectedDays={setSelectedDays}
                            dailyRate={dailyRate}
                            setDailyRate={setDailyRate}
                            tempDailyRate={tempDailyRate}
                            setTempDailyRate={setTempDailyRate}
                            isEditingBase={isEditingBase}
                            setIsEditingBase={setIsEditingBase}
                            handleUpdateBaseSalary={handleUpdateBaseSalary}
                            loading={loading}
                            paidBase={paidBase}
                        />
                    )}

                    {/* STEP 3 DAILY: SUMMARY */}
                    {currentStep === 3 && isDaily && (
                        <div className="space-y-4 max-w-lg mx-auto bg-[var(--background-color)] p-6 rounded-2xl border border-[var(--border-color)]">
                            <h3 className="text-xl font-bold text-center mb-6">Resumen de Pago</h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-[var(--text-secondary-color)]">Valor por día</span>
                                    <span className="font-mono font-bold">{formatCLP(dailyRate)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[var(--text-secondary-color)]">Días seleccionados</span>
                                    <span className="font-mono font-bold text-amber-400">{effectiveDaysWorked}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[var(--text-secondary-color)]">Subtotal</span>
                                    <span className="font-mono font-bold">{formatCLP(paidBase)}</span>
                                </div>
                                {advance > 0 && (
                                    <div className="flex justify-between items-center text-red-400">
                                        <span>Adelanto descontado</span>
                                        <span className="font-mono font-bold">-{formatCLP(advance)}</span>
                                    </div>
                                )}
                                {commission > 0 && !shouldBePartial && (
                                    <>
                                        <div className="border-t border-purple-500/20 my-2"></div>
                                        <div className="flex justify-between items-center text-purple-300">
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">store</span>
                                                Comisión Administración POS
                                            </span>
                                            <span className="font-mono font-bold">+{formatCLP(commission)}</span>
                                        </div>
                                        {commissionDetails.map((d, i) => (
                                            <div key={i} className="flex justify-between items-center text-[11px] text-purple-300/60 pl-4">
                                                <span>{d.pos_name} ({d.percentage}%)</span>
                                                <span className="font-mono">{formatCLP(d.commission)}</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                                {shouldBePartial && (
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 flex items-center gap-2 mt-1">
                                        <span className="material-symbols-outlined text-sm">info</span>
                                        Pago parcial — la comisión se agregará cuando el informe de billing sea confirmado
                                    </div>
                                )}
                                <div className="border-t border-white/10 my-2"></div>
                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-lg font-bold">Total a Pagar</span>
                                    <span className="text-3xl font-bold text-[var(--primary-color)]">{formatCLP(totalCalculated)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: BASE SALARY (Fixed only) */}
                    {currentStep === 2 && !isDaily && (
                        <div className="space-y-10 max-w-lg mx-auto py-4">
                            {/* Pay Type Badge */}
                            <div className="flex justify-center">
                                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider ${isDaily ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'}`}>
                                    <span className="material-symbols-outlined text-sm">{isDaily ? 'calendar_today' : 'attach_money'}</span>
                                    {isDaily ? 'Pago por Días Trabajados' : 'Salario Fijo Quincenal'}
                                </div>
                            </div>

                            <div className="text-center space-y-2">
                                <h3 className="text-lg font-bold text-[var(--text-secondary-color)] uppercase tracking-widest">
                                    {isDaily ? 'Valor por Día' : 'Salario Base Actual'}
                                </h3>

                                {isEditingBase ? (
                                    <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="relative group">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold opacity-30">$</span>
                                            <input
                                                type="number"
                                                value={isDaily ? tempDailyRate : tempBaseSalary}
                                                onChange={e => isDaily ? setTempDailyRate(e.target.value) : setTempBaseSalary(e.target.value)}
                                                className="bg-[var(--dark-color)] border-2 border-[var(--primary-color)] text-4xl font-bold font-mono w-80 px-10 py-4 rounded-2xl text-center outline-none shadow-2xl shadow-blue-500/10"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setIsEditingBase(false); setTempBaseSalary(baseSalary); setTempDailyRate(dailyRate); }}
                                                className="px-4 py-2 text-sm font-bold uppercase tracking-wider text-[var(--text-secondary-color)] hover:bg-white/5 rounded-xl transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleUpdateBaseSalary}
                                                disabled={loading}
                                                className="px-6 py-2 bg-[var(--primary-color)] text-white text-sm font-bold uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg shadow-blue-500/20 disabled:opacity-50"
                                            >
                                                {loading ? 'Guardando...' : 'Confirmar Cambio'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-4 group cursor-pointer" onClick={() => setIsEditingBase(true)}>
                                        <div className="text-6xl font-bold font-mono text-white tracking-normal transition-all group-hover:scale-105 group-hover:text-[var(--primary-color)]">
                                            {formatCLP(isDaily ? dailyRate : baseSalary)}
                                        </div>
                                        <button className="p-3 bg-white/10 rounded-full transition-all hover:bg-white/20 text-[var(--primary-color)] shadow-xl">
                                            <span className="material-symbols-outlined text-2xl">edit</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Days Worked Input (only for daily pay type) */}
                            {isDaily && (
                                <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-8 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    <div className="flex items-center justify-center gap-2 text-amber-400">
                                        <span className="material-symbols-outlined">calendar_today</span>
                                        <span className="text-xs font-bold uppercase tracking-widest">Días Trabajados en esta Quincena</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-4">
                                        <button
                                            onClick={() => setDaysWorked(Math.max(0, daysWorked - 1))}
                                            className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all active:scale-90"
                                        >
                                            <span className="material-symbols-outlined">remove</span>
                                        </button>
                                        <input
                                            type="number"
                                            value={daysWorked}
                                            onChange={e => setDaysWorked(Math.max(0, Number(e.target.value)))}
                                            className="bg-[var(--dark-color)] border-2 border-amber-500/50 text-5xl font-black font-mono w-32 py-4 rounded-2xl text-center outline-none shadow-2xl shadow-amber-500/5"
                                        />
                                        <button
                                            onClick={() => setDaysWorked(daysWorked + 1)}
                                            className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all active:scale-90"
                                        >
                                            <span className="material-symbols-outlined">add</span>
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-amber-400/60 leading-relaxed">
                                        Valor por día: {formatCLP(dailyRate)}
                                    </p>
                                </div>
                            )}

                            <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/5 shadow-inner relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5">
                                    <span className="material-symbols-outlined text-6xl">account_balance_wallet</span>
                                </div>
                                <div className="relative z-10 flex flex-col items-center text-center">
                                    <span className="text-xs font-bold text-[var(--text-secondary-color)] uppercase tracking-widest mb-1">
                                        {isDaily ? `Pago por ${daysWorked} Días Trabajados` : 'Pago Quincenal Proyectado'}
                                    </span>
                                    <div className="text-3xl font-bold text-[var(--success-color)] mb-2">
                                        {formatCLP(paidBase)}
                                    </div>
                                    <p className="text-[10px] text-[var(--text-secondary-color)] max-w-[280px] leading-relaxed">
                                        {isDaily
                                            ? `Calculado como ${formatCLP(dailyRate)} × ${daysWorked} días. No incluye auxilio de transporte ni otros extras.`
                                            : 'Calculado automáticamente como el 50% del salario base mensual. No incluye auxilio de transporte ni otros extras.'
                                        }
                                    </p>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* STEP 3: TRANSPORT AID (Fixed only) */}
                    {currentStep === 3 && !isDaily && (
                        <div className="space-y-6 max-w-xl mx-auto py-6">
                            <h3 className="text-lg font-bold text-center uppercase tracking-widest text-[var(--text-secondary-color)]">Auxilio de Transporte</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { id: false, label: 'No Aplica', desc: 'No se suma al recibo', icon: 'block' },
                                    { id: true, label: 'Sí Aplica', desc: `Se suma ${formatCLP((config?.auxilio_transporte || 0) / 2)}`, icon: 'local_shipping' },
                                ].map(option => (
                                    <div
                                        key={option.label}
                                        onClick={() => setIncludesTransportAid(option.id)}
                                        className={`p-6 rounded-2xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${includesTransportAid === option.id
                                            ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/10'
                                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                                            }`}
                                    >
                                        <div className={`p-3 rounded-full ${includesTransportAid === option.id ? 'bg-blue-500 text-white' : 'bg-white/10 text-[var(--text-secondary-color)]'}`}>
                                            <span className="material-symbols-outlined text-2xl">{option.icon}</span>
                                        </div>
                                        <span className={`text-sm font-bold uppercase tracking-wider ${includesTransportAid === option.id ? 'text-white' : 'text-[var(--text-secondary-color)]'}`}>
                                            {option.label}
                                        </span>
                                        <span className="text-xs text-[var(--text-secondary-color)] text-center">
                                            {option.desc}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex justify-between items-center">
                                <span className="text-sm text-[var(--text-secondary-color)]">Valor quincenal considerado</span>
                                <span className="font-mono text-xl font-bold text-[var(--success-color)]">{formatCLP(transport)}</span>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: SUNDAYS (Fixed only) */}
                    {currentStep === 4 && !isDaily && (
                        <div className="space-y-6 max-w-2xl mx-auto">
                            <h3 className="text-lg font-bold">Dominicales Trabajados</h3>

                            <div className="flex bg-[var(--background-color)] p-1 rounded-lg w-fit mx-auto border border-[var(--border-color)]">
                                <button onClick={() => setSundaysMode('manual')} className={`px-4 py-2 rounded-md text-sm ${sundaysMode === 'manual' ? 'bg-[var(--card-color)] shadow' : 'opacity-50'}`}>Manual</button>
                                <button onClick={() => setSundaysMode('odoo')} className={`px-4 py-2 rounded-md text-sm ${sundaysMode === 'odoo' ? 'bg-[var(--card-color)] shadow' : 'opacity-50'}`}>Desde Odoo</button>
                            </div>

                            {sundaysMode === 'manual' ? (
                                <div className="text-center">
                                    <label className="block text-sm text-[var(--text-secondary-color)] mb-2">Días Trabajados</label>
                                    <input type="number" value={sundaysManualQty} onChange={e => setSundaysManualQty(e.target.value)} className="text-center text-3xl font-bold bg-transparent border-none w-24 mx-auto outline-none" placeholder="0" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm text-[var(--text-secondary-color)] mb-2">Punto de Venta Odoo</label>
                                        <select
                                            value={sundaysOdooPos || ''}
                                            onChange={e => { setSundaysOdooPos(e.target.value); setSundaysOdooSessions([]); }}
                                            className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] p-3 rounded-lg"
                                        >
                                            <option value="">Seleccionar...</option>
                                            {posList.map(pos => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                                        </select>
                                    </div>
                                    <button
                                        onClick={() => fetchOdooSessions('sundays')}
                                        disabled={!sundaysOdooPos || loading}
                                        className="w-full py-2 bg-blue-600/20 text-blue-400 rounded-lg font-bold border border-blue-600/30 hover:bg-blue-600/30"
                                    >
                                        {loading ? 'Buscando...' : 'Buscar Sesiones Dominicales'}
                                    </button>

                                    {sundaysOdooSessions?.length > 0 && (
                                        <div className="bg-[var(--background-color)] p-4 rounded-xl border border-[var(--border-color)] max-h-40 overflow-y-auto">
                                            <h4 className="text-xs uppercase text-[var(--text-secondary-color)] mb-2">Sesiones Encontradas (Domingos)</h4>
                                            {sundaysOdooSessions.filter(s => new Date(s.start_at).getUTCDay() === 0).map(s => (
                                                <div key={s.id} className="flex justify-between text-sm py-1 border-b border-white/5 last:border-0">
                                                    <span>{formatDateTimeCO(s.start_at)}</span>
                                                    <span className="text-[var(--success-color)] text-xs">{s.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-between items-center bg-white/5 rounded-2xl p-4 shadow-inner">
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-secondary-color)] uppercase tracking-widest mb-1 block">Valor Día Dominical (Global)</label>
                                    {isEditingSundayValue ? (
                                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                                            <input
                                                type="number"
                                                value={tempSundayValue}
                                                onChange={e => setTempSundayValue(e.target.value)}
                                                className="bg-[var(--dark-color)] border border-[var(--primary-color)] font-mono text-base px-3 py-1 rounded-lg w-36 outline-none shadow-lg"
                                                autoFocus
                                            />
                                            <button
                                                onClick={handleUpdateSundayValue}
                                                disabled={loading}
                                                className="bg-[var(--success-color)] p-1.5 rounded-lg hover:brightness-110 active:scale-95 transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm font-bold">check</span>
                                            </button>
                                            <button
                                                onClick={() => { setIsEditingSundayValue(false); setTempSundayValue(sundayValue); }}
                                                className="bg-white/10 text-white p-1.5 rounded-lg hover:bg-white/20 active:scale-95 transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 group cursor-pointer bg-white/5 pl-3 pr-2 py-1.5 rounded-xl border border-transparent hover:border-[var(--primary-color)]/30 hover:bg-white/10 transition-all w-fit" onClick={() => setIsEditingSundayValue(true)}>
                                            <span className="font-mono text-xl font-bold text-white tracking-normal">{formatCLP(sundayValue)}</span>
                                            <span className="material-symbols-outlined text-sm text-[var(--primary-color)] opacity-50 group-hover:opacity-100 transition-all">edit</span>
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-black font-mono text-[var(--success-color)] leading-none mb-1">
                                        {formatCLP(sundaysQty * sundayValue)}
                                    </div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider opacity-50">Subtotal Dominicales ({sundaysQty} días)</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 5: MADRUGONES (Fixed only) */}
                    {currentStep === 5 && !isDaily && (
                        <div className="space-y-8 max-w-2xl mx-auto py-2">
                            <h3 className="text-lg font-bold text-center uppercase tracking-widest text-[var(--text-secondary-color)]">Madrugones</h3>

                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { id: 'none', label: 'No Aplica', icon: 'block' },
                                    { id: 'manual', label: 'Manual', icon: 'edit_note' },
                                    { id: 'odoo', label: 'Desde Odoo', icon: 'sync_alt' }
                                ].map(mode => (
                                    <div
                                        key={mode.id}
                                        onClick={() => setMadrugonesMode(mode.id)}
                                        className={`p-6 rounded-3xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group ${madrugonesMode === mode.id
                                            ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/10'
                                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                                            }`}
                                    >
                                        <div className={`p-3 rounded-full transition-colors ${madrugonesMode === mode.id ? 'bg-blue-500 text-white' : 'bg-white/5 text-[var(--text-secondary-color)] group-hover:text-white'
                                            }`}>
                                            <span className="material-symbols-outlined text-2xl">{mode.icon}</span>
                                        </div>
                                        <span className={`text-xs font-bold uppercase tracking-wider ${madrugonesMode === mode.id ? 'text-white' : 'text-[var(--text-secondary-color)]'}`}>
                                            {mode.label}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {madrugonesMode !== 'none' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    {madrugonesMode === 'manual' ? (
                                        <div className="bg-white/5 rounded-3xl p-8 border border-white/5 text-center space-y-2">
                                            <span className="text-xs font-bold text-[var(--text-secondary-color)] uppercase tracking-widest block mb-2">Horas Totales Trabajadas</span>
                                            <div className="flex items-center justify-center gap-4">
                                                <input
                                                    type="number"
                                                    value={madrugonesManualQty}
                                                    onChange={e => setMadrugonesManualQty(e.target.value)}
                                                    className="bg-[var(--dark-color)] border border-[var(--primary-color)] text-5xl font-black font-mono w-40 py-4 rounded-2xl text-center outline-none shadow-2xl shadow-blue-500/5"
                                                    autoFocus
                                                />
                                                <span className="text-2xl font-bold opacity-50">Hrs</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-4">
                                                <div>
                                                    <label className="text-[10px] font-bold text-[var(--text-secondary-color)] uppercase tracking-widest mb-1 block">Punto de Venta Odoo (Mié/Sáb)</label>
                                                    <select
                                                        value={madrugonesOdooPos || ''}
                                                        onChange={e => { setMadrugonesOdooPos(e.target.value); setMadrugonesOdooSessions([]); }}
                                                        className="w-full bg-[var(--dark-color)] border border-white/10 p-4 rounded-2xl outline-none focus:border-[var(--primary-color)] transition-colors"
                                                    >
                                                        <option value="">Seleccionar Local...</option>
                                                        {posList.map(pos => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                                                    </select>
                                                </div>
                                                <button
                                                    onClick={() => fetchOdooSessions('madrugones')}
                                                    disabled={!madrugonesOdooPos || loading}
                                                    className="w-full py-4 bg-[var(--primary-color)] text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                                                >
                                                    {loading ? 'Analizando sesiones...' : 'Analizar Horarios de Madrugada'}
                                                </button>

                                                {madrugonesOdooSessions?.length > 0 && (
                                                    <div className="bg-black/20 p-4 rounded-2xl border border-white/5 max-h-48 overflow-y-auto space-y-1">
                                                        <h4 className="text-[10px] uppercase font-bold text-[var(--text-secondary-color)] mb-3">Registros Encontrados</h4>
                                                        {madrugonesOdooSessions.map(s => {
                                                            const hoursCounted = calculateMadrugonHours(s.start_at);
                                                            if (hoursCounted <= 0) return null;

                                                            const d = new Date(s.start_at);
                                                            const bogotaTime = new Date(d.toLocaleString("en-US", { timeZone: "America/Bogota" }));

                                                            return (
                                                                <div key={s.id} className="flex justify-between items-center text-xs py-2 border-b border-white/5 last:border-0 px-2">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-white/80">{formatDateTimeCO(s.start_at)}</span>
                                                                        <span className="text-[10px] text-[var(--text-secondary-color)]">
                                                                            Inicio: {bogotaTime.getHours()}:{String(bogotaTime.getMinutes()).padStart(2, '0')} am
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-col items-end">
                                                                        <span className="font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 font-bold">
                                                                            +{hoursCounted.toFixed(1)} hrs
                                                                        </span>
                                                                        <span className="text-[9px] uppercase tracking-tighter text-[var(--text-secondary-color)] mt-0.5">Contado</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-center bg-white/5 rounded-2xl p-4 shadow-inner">
                                        <div>
                                            <label className="text-[10px] font-bold text-[var(--text-secondary-color)] uppercase tracking-widest mb-1 block">Valor Hora Madrugón (Global)</label>
                                            {isEditingMadrugonValue ? (
                                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                                                    <input
                                                        type="number"
                                                        value={tempMadrugonValue}
                                                        onChange={e => setTempMadrugonValue(e.target.value)}
                                                        className="bg-[var(--dark-color)] border border-[var(--primary-color)] font-mono text-base px-3 py-1 rounded-lg w-36 outline-none shadow-lg"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={handleUpdateMadrugonValue}
                                                        disabled={loading}
                                                        className="bg-[var(--success-color)] p-1.5 rounded-lg hover:brightness-110 active:scale-95 transition-all"
                                                    >
                                                        <span className="material-symbols-outlined text-sm font-bold">check</span>
                                                    </button>
                                                    <button
                                                        onClick={() => { setIsEditingMadrugonValue(false); setTempMadrugonValue(madrugonValue); }}
                                                        className="bg-white/10 text-white p-1.5 rounded-lg hover:bg-white/20 active:scale-95 transition-all"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 group cursor-pointer bg-white/5 pl-3 pr-2 py-1.5 rounded-xl border border-transparent hover:border-[var(--primary-color)]/30 hover:bg-white/10 transition-all w-fit" onClick={() => setIsEditingMadrugonValue(true)}>
                                                    <span className="font-mono text-xl font-bold text-white tracking-normal">{formatCLP(madrugonValue)}</span>
                                                    <span className="material-symbols-outlined text-sm text-[var(--primary-color)] opacity-50 group-hover:opacity-100 transition-all">edit</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="text-3xl font-black font-mono text-[var(--success-color)] leading-none mb-1">
                                                {formatCLP(madrugonesQty * madrugonValue)}
                                            </div>
                                            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-50">Subtotal Madrugones ({madrugonesQty.toFixed(1)} hrs)</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 6: ADVANCES (Fixed) / STEP 2: ADVANCES (Daily) */}
                    {((currentStep === 6 && !isDaily) || (currentStep === 2 && isDaily)) && (
                        <div className="space-y-10 max-w-lg mx-auto py-4">
                            <h3 className="text-lg font-bold text-center uppercase tracking-widest text-[var(--text-secondary-color)]">Adelantos de Nómina</h3>

                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { id: 'none', label: 'No Hubo Adelantos', icon: 'check_circle' },
                                    { id: 'manual', label: 'Ingresar Adelanto', icon: 'money_off' },
                                ].map(mode => (
                                    <div
                                        key={mode.id}
                                        onClick={() => {
                                            setAdvanceMode(mode.id);
                                            if (mode.id === 'none') setAdvance(0);
                                        }}
                                        className={`p-8 rounded-3xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-3 group ${advanceMode === mode.id
                                            ? 'bg-red-500/10 border-red-500 shadow-lg shadow-red-500/10'
                                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                                            }`}
                                    >
                                        <div className={`p-4 rounded-full transition-colors ${advanceMode === mode.id ? 'bg-red-500 text-white' : 'bg-white/5 text-[var(--text-secondary-color)] group-hover:text-white'
                                            }`}>
                                            <span className="material-symbols-outlined text-3xl">{mode.icon}</span>
                                        </div>
                                        <span className={`text-sm font-bold uppercase tracking-wider ${advanceMode === mode.id ? 'text-white' : 'text-[var(--text-secondary-color)]'}`}>
                                            {mode.label}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {advanceMode === 'manual' && (
                                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                                    <div className="bg-white/5 rounded-3xl p-10 border border-white/5 text-center space-y-4">
                                        <span className="text-xs font-bold text-[var(--text-secondary-color)] uppercase tracking-widest block">Monto del Adelanto</span>
                                        <div className="relative group max-w-[280px] mx-auto">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-bold opacity-30 text-[var(--danger-color)]">$</span>
                                            <input
                                                type="number"
                                                value={advance === 0 ? '' : advance}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setAdvance(val === '' ? 0 : Number(val));
                                                }}
                                                className="bg-[var(--dark-color)] border-2 border-[var(--danger-color)] text-4xl font-black font-mono w-full pl-12 pr-6 py-5 rounded-2xl text-center outline-none shadow-2xl shadow-red-500/5 text-[var(--danger-color)]"
                                                placeholder="0"
                                                autoFocus
                                            />
                                        </div>
                                        <p className="text-[11px] text-[var(--text-secondary-color)] leading-relaxed italic">
                                            Este monto se descontará automáticamente del pago total de esta quincena.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {advanceMode === 'none' && (
                                <div className="bg-[var(--success-color)]/5 rounded-2xl p-6 text-center animate-in fade-in slide-in-from-top-2">
                                    <p className="text-[var(--success-color)] font-bold text-sm">✓ Confirmado: Sin adelantos para este periodo.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 7: HEALTH / PENSION (Fixed only) */}
                    {currentStep === 7 && !isDaily && (
                        <div className="space-y-8 max-w-3xl mx-auto py-2">
                            <h3 className="text-lg font-bold text-center uppercase tracking-widest text-[var(--text-secondary-color)]">Seguridad Social</h3>

                            {/* Main Toggle Cards */}
                            <div className="grid grid-cols-2 gap-6">
                                {[
                                    { id: false, label: 'No Aplica', desc: 'No realizar deducciones', icon: 'health_and_safety', color: 'gray' },
                                    { id: true, label: 'Sí Aplica', desc: 'Calcular Salud y Pensión', icon: 'medical_services', color: 'blue' },
                                ].map(option => (
                                    <div
                                        key={option.label}
                                        onClick={() => setIncludesSecurity(option.id)}
                                        className={`p-6 rounded-3xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-3 group ${includesSecurity === option.id
                                            ? `bg-${option.color}-500/10 border-${option.color}-500 shadow-lg shadow-${option.color}-500/10`
                                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                                            }`}
                                    >
                                        <div className={`p-4 rounded-full transition-colors ${includesSecurity === option.id ? `bg-${option.color}-500 text-white` : 'bg-white/5 text-[var(--text-secondary-color)] group-hover:text-white'
                                            }`}>
                                            <span className="material-symbols-outlined text-3xl">{option.icon}</span>
                                        </div>
                                        <div className="text-center">
                                            <span className={`text-sm font-bold uppercase tracking-wider block ${includesSecurity === option.id ? 'text-white' : 'text-[var(--text-secondary-color)]'}`}>
                                                {option.label}
                                            </span>
                                            <span className="text-[10px] text-[var(--text-secondary-color)] opacity-70">
                                                {option.desc}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Content based on selection */}
                            {!includesSecurity ? (
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center animate-in fade-in slide-in-from-top-2">
                                    <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)] mb-2 opacity-50">block</span>
                                    <p className="text-[var(--text-secondary-color)] font-medium text-sm">No se aplicarán deducciones de salud ni pensión para este pago.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    {/* HEALTH CARD */}
                                    <div className="bg-white/5 rounded-3xl p-6 border border-white/5 flex flex-col justify-between group hover:border-blue-500/30 transition-all">
                                        <div className="flex items-center gap-3 mb-4 opacity-70 group-hover:opacity-100 transition-opacity">
                                            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                                                <span className="material-symbols-outlined">favorite</span>
                                            </div>
                                            <span className="text-xs font-bold text-[var(--text-secondary-color)] uppercase tracking-widest">Aporte Salud</span>
                                        </div>

                                        <div className="mb-4">
                                            {isEditingHealthPct ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            value={tempHealthPct}
                                                            onChange={e => setTempHealthPct(e.target.value)}
                                                            className="w-16 bg-[var(--dark-color)] border border-blue-500 rounded px-2 py-1 text-center font-mono focus:outline-none"
                                                            autoFocus
                                                        />
                                                        <span className="text-sm font-bold">%</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleUpdateConfig('porcentaje_salud', tempHealthPct)} className="text-[10px] bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">Guardar</button>
                                                        <button onClick={() => { setIsEditingHealthPct(false); setTempHealthPct(healthPercentage); }} className="text-[10px] bg-white/10 px-2 py-1 rounded hover:bg-white/20">Cancelar</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-baseline gap-2 cursor-pointer group/edit" onClick={() => setIsEditingHealthPct(true)}>
                                                    <span className="text-4xl font-black text-white group-hover/edit:text-blue-400 transition-colors">{healthPercentage}</span>
                                                    <span className="text-sm font-bold opacity-50">%</span>
                                                    <span className="material-symbols-outlined text-[10px] opacity-0 group-hover/edit:opacity-50 ml-1">edit</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-4 border-t border-white/5">
                                            <div className="text-2xl font-mono font-bold text-[var(--danger-color)]">
                                                -{formatCLP(health)}
                                            </div>
                                            <div className="text-[10px] text-[var(--text-secondary-color)] mt-1">Deducción Calculada</div>
                                        </div>
                                    </div>

                                    {/* PENSION CARD */}
                                    <div className="bg-white/5 rounded-3xl p-6 border border-white/5 flex flex-col justify-between group hover:border-purple-500/30 transition-all">
                                        <div className="flex items-center gap-3 mb-4 opacity-70 group-hover:opacity-100 transition-opacity">
                                            <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl">
                                                <span className="material-symbols-outlined">elderly</span>
                                            </div>
                                            <span className="text-xs font-bold text-[var(--text-secondary-color)] uppercase tracking-widest">Aporte Pensión</span>
                                        </div>

                                        <div className="mb-4">
                                            {isEditingPensionPct ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            value={tempPensionPct}
                                                            onChange={e => setTempPensionPct(e.target.value)}
                                                            className="w-16 bg-[var(--dark-color)] border border-purple-500 rounded px-2 py-1 text-center font-mono focus:outline-none"
                                                            autoFocus
                                                        />
                                                        <span className="text-sm font-bold">%</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleUpdateConfig('porcentaje_pension', tempPensionPct)} className="text-[10px] bg-purple-500 text-white px-2 py-1 rounded hover:bg-purple-600">Guardar</button>
                                                        <button onClick={() => { setIsEditingPensionPct(false); setTempPensionPct(pensionPercentage); }} className="text-[10px] bg-white/10 px-2 py-1 rounded hover:bg-white/20">Cancelar</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-baseline gap-2 cursor-pointer group/edit" onClick={() => setIsEditingPensionPct(true)}>
                                                    <span className="text-4xl font-black text-white group-hover/edit:text-purple-400 transition-colors">{pensionPercentage}</span>
                                                    <span className="text-sm font-bold opacity-50">%</span>
                                                    <span className="material-symbols-outlined text-[10px] opacity-0 group-hover/edit:opacity-50 ml-1">edit</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-4 border-t border-white/5">
                                            <div className="text-2xl font-mono font-bold text-[var(--danger-color)]">
                                                -{formatCLP(pension)}
                                            </div>
                                            <div className="text-[10px] text-[var(--text-secondary-color)] mt-1">Deducción Calculada</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}



                    {/* STEP 8: ADJUSTMENTS (Fixed only) */}
                    {
                        currentStep === 8 && !isDaily && (
                            <div className="space-y-6 max-w-2xl mx-auto py-2">
                                <h3 className="text-lg font-bold text-center uppercase tracking-widest text-[var(--text-secondary-color)]">Ajustes y Extras</h3>

                                {/* Summary Mini Cards */}
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider block">Total Adiciones</span>
                                            <span className="text-xl font-bold text-white font-mono">
                                                {formatCLP(adjustments.filter(a => a.type === 'income').reduce((acc, a) => acc + Number(a.value), 0))}
                                            </span>
                                        </div>
                                        <div className="bg-green-500/20 p-2 rounded-full text-green-400">
                                            <span className="material-symbols-outlined">trending_up</span>
                                        </div>
                                    </div>
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">Total Deducciones</span>
                                            <span className="text-xl font-bold text-white font-mono">
                                                {formatCLP(adjustments.filter(a => a.type === 'deduction').reduce((acc, a) => acc + Number(a.value), 0))}
                                            </span>
                                        </div>
                                        <div className="bg-red-500/20 p-2 rounded-full text-red-400">
                                            <span className="material-symbols-outlined">trending_down</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Main List */}
                                <div className="space-y-3">
                                    {adjustments.length === 0 ? (
                                        <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-3xl opacity-50">
                                            <span className="material-symbols-outlined text-4xl mb-2">tune</span>
                                            <p className="text-sm">No hay ajustes adicionales.</p>
                                        </div>
                                    ) : (
                                        adjustments.map((adj, idx) => (
                                            <div key={idx} className="group bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center gap-4 hover:border-white/10 transition-all animate-in slide-in-from-bottom-2 fade-in">
                                                {/* Type Toggle Icon */}
                                                <button
                                                    onClick={() => {
                                                        const newA = [...adjustments];
                                                        newA[idx].type = newA[idx].type === 'income' ? 'deduction' : 'income';
                                                        setAdjustments(newA);
                                                    }}
                                                    className={`p-3 rounded-xl transition-colors ${adj.type === 'income' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                                                    title="Cambiar Tipo"
                                                >
                                                    <span className="material-symbols-outlined">
                                                        {adj.type === 'income' ? 'add_circle' : 'remove_circle'}
                                                    </span>
                                                </button>

                                                {/* Inputs */}
                                                <div className="flex-1 space-y-1">
                                                    <input
                                                        type="text"
                                                        placeholder="Descripción del concepto..."
                                                        value={adj.label}
                                                        onChange={e => {
                                                            const newA = [...adjustments];
                                                            newA[idx].label = e.target.value;
                                                            setAdjustments(newA);
                                                        }}
                                                        className="w-full bg-transparent text-sm font-bold placeholder:font-normal placeholder:opacity-30 outline-none border-none focus:ring-0 shadow-none appearance-none pb-1 transition-colors"
                                                        autoFocus={!adj.label}
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs font-bold ${adj.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>$</span>
                                                        <input
                                                            type="number"
                                                            placeholder="0"
                                                            value={adj.value === 0 ? '' : adj.value}
                                                            onChange={e => {
                                                                const newA = [...adjustments];
                                                                newA[idx].value = Number(e.target.value);
                                                                setAdjustments(newA);
                                                            }}
                                                            className={`w-full bg-transparent font-mono text-lg font-bold outline-none border-none focus:ring-0 shadow-none appearance-none leading-none ${adj.type === 'income' ? 'text-green-400 placeholder:text-green-400/30' : 'text-red-400 placeholder:text-red-400/30'}`}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Delete */}
                                                <button
                                                    onClick={() => setAdjustments(adjustments.filter((_, i) => i !== idx))}
                                                    className="p-2 text-[var(--text-secondary-color)] hover:text-white hover:bg-white/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center transform scale-90 group-hover:scale-100"
                                                >
                                                    <span className="material-symbols-outlined">delete</span>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Add Button */}
                                <button
                                    onClick={() => setAdjustments([...adjustments, { type: 'income', label: '', value: 0 }])}
                                    className="w-full py-4 rounded-2xl border border-dashed border-white/10 text-[var(--text-secondary-color)] font-bold text-sm hover:bg-white/5 hover:border-white/20 transition-all flex items-center justify-center gap-2 group"
                                >
                                    <div className="bg-white/10 p-1 rounded-md text-white group-hover:scale-110 transition-transform">
                                        <span className="material-symbols-outlined text-sm">add</span>
                                    </div>
                                    Agregar Nuevo Ajuste
                                </button>
                            </div>
                        )
                    }

                    {/* STEP 9: SUMMARY (Fixed only) */}
                    {
                        currentStep === 9 && !isDaily && (
                            <div className="space-y-4 max-w-lg mx-auto bg-[var(--background-color)] p-6 rounded-2xl border border-[var(--border-color)]">
                                <h3 className="text-xl font-bold text-center mb-6">Resumen de Pago</h3>

                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-secondary-color)]">
                                            {isDaily ? `Pago por ${daysWorked} días (${formatCLP(dailyRate)}/día)` : 'Salario Base Quincenal (50%)'}
                                        </span>
                                        <span className="font-mono">{formatCLP(paidBase)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-secondary-color)]">
                                            Auxilio Transporte {includesTransportAid ? '' : '(No aplica)'}
                                        </span>
                                        <span className="font-mono">{formatCLP(transport)}</span>
                                    </div>
                                    {sundaysQty > 0 && (
                                        <div className="flex justify-between text-[var(--success-color)]">
                                            <span>Dominicales ({sundaysQty})</span>
                                            <span className="font-mono">+{formatCLP(sundaysQty * sundayValue)}</span>
                                        </div>
                                    )}
                                    {madrugonesQty > 0 && (
                                        <div className="flex justify-between text-[var(--success-color)]">
                                            <span>Madrugones ({madrugonesQty.toFixed(1)}h)</span>
                                            <span className="font-mono">+{formatCLP(madrugonesQty * madrugonValue)}</span>
                                        </div>
                                    )}
                                    {adjustments.map((a, i) => (
                                        <div key={i} className={`flex justify-between ${a.type === 'income' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}`}>
                                            <span>{a.label || 'Ajuste'}</span>
                                            <span className="font-mono">{a.type === 'income' ? '+' : '-'}{formatCLP(Number(a.value))}</span>
                                        </div>
                                    ))}

                                    <div className="border-t border-[var(--border-color)] my-2"></div>

                                    <div className="flex justify-between text-[var(--danger-color)]">
                                        <span>Salud (4%)</span>
                                        <span className="font-mono">-{formatCLP(health)}</span>
                                    </div>
                                    <div className="flex justify-between text-[var(--danger-color)]">
                                        <span>Pensión (4%)</span>
                                        <span className="font-mono">-{formatCLP(pension)}</span>
                                    </div>
                                    {advance > 0 && (
                                        <div className="flex justify-between text-[var(--danger-color)]">
                                            <span>Adelantos</span>
                                            <span className="font-mono">-{formatCLP(advance)}</span>
                                        </div>
                                    )}

                                    {commission > 0 && !shouldBePartial && (
                                        <>
                                            <div className="border-t border-purple-500/20 my-2"></div>
                                            <div className="flex justify-between text-purple-300">
                                                <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm">store</span>
                                                    Comisión POS
                                                </span>
                                                <span className="font-mono">+{formatCLP(commission)}</span>
                                            </div>
                                            {commissionDetails.map((d, i) => (
                                                <div key={i} className="flex justify-between text-[11px] text-purple-300/60 pl-4">
                                                    <span>{d.pos_name} ({d.percentage}%)</span>
                                                    <span className="font-mono">{formatCLP(d.commission)}</span>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {shouldBePartial && (
                                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 flex items-center gap-2 mt-2">
                                            <span className="material-symbols-outlined text-sm">info</span>
                                            Pago parcial — la comisión se agregará cuando el informe de billing sea confirmado
                                        </div>
                                    )}

                                    <div className="border-t border-white/20 pt-4 mt-4 flex justify-between items-center">
                                        <span className="text-lg font-bold">Total a Pagar</span>
                                        <span className="text-2xl font-bold text-[var(--primary-color)]">{formatCLP(totalCalculated)}</span>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                </div >

                {/* Footer Controls */}
                < div className="p-6 border-t border-[var(--border-color)] flex justify-between bg-[#111]" >
                    <button
                        onClick={currentStep === 1 ? onClose : prevStep}
                        className="px-6 py-2 rounded-lg font-bold text-[var(--text-secondary-color)] hover:bg-white/10 transition-all"
                    >
                        {currentStep === 1 ? 'Cancelar' : 'Atrás'}
                    </button>

                    {
                        currentStep < maxStep ? (
                            <button
                                onClick={nextStep}
                                className="px-6 py-2 bg-[var(--primary-color)] text-white rounded-lg font-bold hover:bg-blue-600 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                            >
                                Siguiente
                            </button>
                        ) : (
                            <button
                                onClick={handleConfirm}
                                disabled={loading || (isDaily && effectiveDaysWorked === 0)}
                                className="px-8 py-2 bg-[var(--success-color)] rounded-lg font-bold hover:brightness-110 shadow-lg shadow-green-500/20 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {loading ? 'Procesando...' : (shouldBePartial ? 'Generar Pago Parcial' : 'Confirmar y Generar Pago')}
                            </button>
                        )
                    }
                </div >
            </div >
        </div >
    );
}

// --- Daily Calendar Step Component ---
function DailyCalendarStep({ period, selectedDays, setSelectedDays, dailyRate, tempDailyRate, setTempDailyRate, isEditingBase, setIsEditingBase, handleUpdateBaseSalary, loading, paidBase }) {
    // Generate days for the period
    const periodDays = useMemo(() => {
        if (!period.start || !period.end) return [];
        const days = [];
        const start = new Date(period.start + 'T12:00:00');
        const end = new Date(period.end + 'T12:00:00');
        const current = new Date(start);
        while (current <= end) {
            days.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }
        return days;
    }, [period.start, period.end]);

    const toggleDay = (day) => {
        setSelectedDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const selectAll = () => setSelectedDays([...periodDays]);
    const clearAll = () => setSelectedDays([]);

    const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Get month/year for the header
    const periodDate = period.start ? new Date(period.start + 'T12:00:00') : new Date();
    const monthName = MONTH_NAMES[periodDate.getMonth()];
    const yearNum = periodDate.getFullYear();

    // Build a week-based grid. Find what day of week the first day falls on.
    const firstDayOfWeek = periodDays.length > 0 ? new Date(periodDays[0] + 'T12:00:00').getDay() : 0;

    // Create grid cells: prefix empty cells + actual days
    const gridCells = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
        gridCells.push({ type: 'empty', key: `empty-${i}` });
    }
    periodDays.forEach(day => {
        gridCells.push({ type: 'day', key: day, date: day });
    });

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center space-y-2">
                <h3 className="text-lg font-bold uppercase tracking-widest text-[var(--text-secondary-color)]">
                    Selecciona los días trabajados
                </h3>
                <p className="text-sm text-[var(--text-secondary-color)]">
                    {monthName} {yearNum} — Haz clic en cada día para marcarlo
                </p>
            </div>

            {/* Daily Rate Display */}
            <div className="flex items-center justify-center gap-3">
                <span className="text-xs font-bold text-[var(--text-secondary-color)] uppercase tracking-wider">Valor por día:</span>
                {isEditingBase ? (
                    <div className="flex items-center gap-2 animate-in fade-in">
                        <input
                            type="number"
                            value={tempDailyRate}
                            onChange={e => setTempDailyRate(e.target.value)}
                            className="bg-[var(--dark-color)] border border-[var(--primary-color)] font-mono text-base px-3 py-1 rounded-lg w-36 outline-none"
                            autoFocus
                        />
                        <button onClick={handleUpdateBaseSalary} disabled={loading} className="bg-[var(--success-color)] p-1.5 rounded-lg hover:brightness-110">
                            <span className="material-symbols-outlined text-sm">check</span>
                        </button>
                        <button onClick={() => setIsEditingBase(false)} className="bg-white/10 p-1.5 rounded-lg hover:bg-white/20">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 cursor-pointer group" onClick={() => setIsEditingBase(true)}>
                        <span className="font-mono text-xl font-bold text-amber-400">{formatCLP(dailyRate)}</span>
                        <span className="material-symbols-outlined text-sm text-[var(--primary-color)] opacity-0 group-hover:opacity-100">edit</span>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="flex justify-center gap-3">
                <button onClick={selectAll} className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold hover:bg-white/10 transition-all">
                    Seleccionar todos
                </button>
                <button onClick={clearAll} className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold hover:bg-white/10 transition-all">
                    Limpiar
                </button>
            </div>

            {/* Calendar Grid */}
            <div className="bg-[var(--background-color)] rounded-2xl border border-[var(--border-color)] p-4">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                    {DAY_NAMES.map(d => (
                        <div key={d} className="text-center text-[10px] font-bold text-[var(--text-secondary-color)] uppercase tracking-wider py-1">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-2">
                    {gridCells.map(cell => {
                        if (cell.type === 'empty') {
                            return <div key={cell.key} />;
                        }
                        const isSelected = selectedDays.includes(cell.date);
                        const dateObj = new Date(cell.date + 'T12:00:00');
                        const dayNum = dateObj.getDate();
                        const isSunday = dateObj.getDay() === 0;

                        return (
                            <button
                                key={cell.key}
                                onClick={() => toggleDay(cell.date)}
                                className={`
                                    relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all active:scale-90 cursor-pointer border
                                    ${isSelected
                                        ? 'bg-amber-500 border-amber-400 shadow-lg shadow-amber-500/20'
                                        : isSunday
                                            ? 'bg-white/3 border-white/5 text-[var(--text-secondary-color)] opacity-50'
                                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15 text-white'
                                    }
                                `}
                            >
                                <span className="text-lg font-bold">
                                    {dayNum}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Summary Footer */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex justify-between items-center">
                <div>
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Días seleccionados</div>
                    <div className="text-4xl font-black font-mono text-white">{selectedDays.length}</div>
                </div>
                <div className="text-right">
                    <div className="text-xs font-bold text-[var(--text-secondary-color)] uppercase tracking-wider">Total a Pagar</div>
                    <div className="text-3xl font-bold font-mono text-[var(--success-color)]">{formatCLP(paidBase)}</div>
                    <div className="text-[10px] text-[var(--text-secondary-color)]">
                        {formatCLP(dailyRate)} × {selectedDays.length} días
                    </div>
                </div>
            </div>
        </div>
    );
}
