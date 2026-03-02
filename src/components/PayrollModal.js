import React, { useState, useEffect } from 'react';
import { formatCLP } from '../formatMoney';

export default function PayrollModal({ isOpen, onClose, employee, config, onConfirm, loading }) {
    const [sundays, setSundays] = useState(0);
    const [advance, setAdvance] = useState(0);
    const [notes, setNotes] = useState('');

    // Reset fields when modal opens or employee changes
    useEffect(() => {
        if (isOpen) {
            setSundays(0);
            setAdvance(0);
            setNotes('');
        }
    }, [isOpen, employee]);

    if (!isOpen || !employee) return null;

    const baseSalary = employee.payroll?.base_salary || 0;
    const auxTransporte = config?.auxilio_transporte || 0;
    const valorDominical = config?.valor_dominical || 0;

    // Calculos Quincenales
    const paidBase = Math.round(baseSalary / 2);
    const paidTransport = Math.round(auxTransporte / 2);

    // Dominicales
    const totalDominicales = sundays * valorDominical;

    // Deducciones (4% Salud, 4% Pension) sobre el Devengado Base (sin auxilio)
    // Devengado Base = paidBase + totalDominicales ? O solo paidBase?
    // Usualmente salud/pension es sobre (Salario + Horas Extras + Recargos)
    // Asumiremos que dominicales hacen parte de la base para seguridad social.
    const baseCotizacion = paidBase + totalDominicales;
    const health = Math.round(baseCotizacion * 0.04);
    const pension = Math.round(baseCotizacion * 0.04);

    // Total
    const totalPay = (paidBase + paidTransport + totalDominicales) - (health + pension) - advance;

    const handleSubmit = (e) => {
        e.preventDefault();
        onConfirm({
            user_id: employee.id,
            period_start: new Date(), // This should ideally be selected or fixed logic
            period_end: new Date(),
            sundays_qty: Number(sundays),
            advance: Number(advance),
            notes
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center">
                    <h3 className="text-lg font-bold">Generar Pago de Nómina</h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 rounded-full bg-[var(--primary-color)]/20 text-[var(--primary-color)]">
                            <span className="material-symbols-outlined text-2xl">person</span>
                        </div>
                        <div>
                            <p className="text-sm text-[var(--text-secondary-color)]">Empleado</p>
                            <p className="text-xl font-bold">{employee.name || employee.username}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <p className="text-xs text-[var(--text-secondary-color)]">Salario Base Mensual</p>
                            <p className="font-semibold">{formatCLP(baseSalary)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <p className="text-xs text-[var(--text-secondary-color)]">Quincena Base (50%)</p>
                            <p className="font-semibold text-[var(--success-color)]">+ {formatCLP(paidBase)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <p className="text-xs text-[var(--text-secondary-color)]">Aux. Transporte (50%)</p>
                            <p className="font-semibold text-[var(--success-color)]">+ {formatCLP(paidTransport)}</p>
                        </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[var(--border-color)]">
                        <h4 className="text-sm font-semibold text-[var(--text-secondary-color)] uppercase">Adicionales</h4>

                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <label className="block text-xs mb-1">Dominicales (+{formatCLP(valorDominical)} c/u)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={sundays}
                                    onChange={e => setSundays(parseInt(e.target.value) || 0)}
                                    className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2"
                                />
                            </div>
                            <div className="pt-5 font-semibold text-[var(--success-color)]">
                                + {formatCLP(totalDominicales)}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[var(--border-color)]">
                        <h4 className="text-sm font-semibold text-[var(--text-secondary-color)] uppercase">Deducciones</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex justify-between">
                                <span>Salud (4%)</span>
                                <span className="text-[var(--danger-color)]">- {formatCLP(health)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Pensión (4%)</span>
                                <span className="text-[var(--danger-color)]">- {formatCLP(pension)}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs mb-1">Adelanto / Préstamo</label>
                            <input
                                type="number"
                                min="0"
                                value={advance}
                                onChange={e => setAdvance(parseInt(e.target.value) || 0)}
                                className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-[var(--border-color)]">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-lg font-bold">Total a Pagar</span>
                            <span className="text-2xl font-bold text-[var(--primary-color)]">{formatCLP(totalPay)}</span>
                        </div>

                        <input
                            placeholder="Notas opcionales..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm mb-4"
                        />

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-[var(--primary-color)] text-white rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {loading ? 'Procesando...' : 'Confirmar Pago'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
