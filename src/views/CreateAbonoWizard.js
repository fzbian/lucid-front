import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import Preloader from '../components/Preloader';
import useTitle from '../useTitle';
import { createAbono, getAbono, getClient, getPendingIncome, listClientInvoices, updateAbono } from '../carteraApi';

function formatCurrency(v){ const n=Number(v); if(!Number.isFinite(n)) return String(v??''); return n.toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}); }
function todayInputValue(){ const now = new Date(); const y = now.getFullYear(); const m = String(now.getMonth()+1).padStart(2,'0'); const d = String(now.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; }
function toDateInputValue(value){ if(!value) return ''; const date = new Date(value); if(Number.isNaN(date.getTime())) return ''; const y = date.getFullYear(); const m = String(date.getMonth()+1).padStart(2,'0'); const d = String(date.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; }
function formatDateInputLabel(value){ if(!value) return '—'; const date = new Date(`${value}T12:00:00`); if(Number.isNaN(date.getTime())) return value; return date.toLocaleDateString('es-CO', { year:'numeric', month:'long', day:'numeric' }); }
function serializeDateForApi(dateInput, baseValue){ if(!dateInput) return undefined; const [y,m,d] = String(dateInput).split('-').map(Number); if(!y || !m || !d) return undefined; const base = baseValue ? new Date(baseValue) : new Date(); const hours = Number.isNaN(base.getTime()) ? 12 : base.getHours(); const minutes = Number.isNaN(base.getTime()) ? 0 : base.getMinutes(); const seconds = Number.isNaN(base.getTime()) ? 0 : base.getSeconds(); return new Date(y, m-1, d, hours, minutes, seconds, 0).toISOString(); }
function invoiceCode(invoice){ return invoice?.op || invoice?.codigo || `#${invoice?.id || ''}`; }
function getInitials(name){ return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0,2).map((part)=> part[0]?.toUpperCase() || '').join('') || 'CL'; }
function normalizeAbonoError(message){
  const safe = String(message || '').trim();
  if (!safe) return '';

  const saldoFacturaMatch = safe.match(/el valor aplicado supera el saldo pendiente de la factura\s+(.+)$/i);
  if (saldoFacturaMatch) {
    return `El valor aplicado supera el saldo pendiente de la factura ${saldoFacturaMatch[1].trim()}. Ajusta la distribución o reparte el abono entre varias facturas.`;
  }
  if (/la suma de la distribuci[oó]n/i.test(safe) || /debe coincidir con el monto total/i.test(safe)) {
    return 'La distribución del abono debe coincidir exactamente con el monto total.';
  }
  if (/abono vinculado a una transacci[oó]n/i.test(safe) && /monto total/i.test(safe)) {
    return 'Este abono viene de un ingreso registrado en caja, así que su monto no puede cambiarse aquí.';
  }
  if (/abono vinculado a una transacci[oó]n/i.test(safe) && /origen/i.test(safe)) {
    return 'Este abono sigue ligado a un ingreso de caja y no se puede desvincular desde esta pantalla.';
  }
  return safe;
}

export default function CreateAbonoWizard(){
  const navigate = useNavigate();
  const location = useLocation();
  const { id: clientId, abonoId } = useParams();
  const editing = Boolean(abonoId);
  const sourceTransactionId = new URLSearchParams(location.search).get('sourceTransactionId');
  useTitle(editing ? 'Editar abono · ATM' : 'Nuevo abono · ATM');

  const [step,setStep]=useState(1);
  const [client,setClient]=useState(location.state?.client || null);
  const [existingAbono,setExistingAbono]=useState(location.state?.abono || null);
  const [sourceTransaction,setSourceTransaction]=useState(location.state?.sourceTransaction || null);
  const [invoices,setInvoices]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [metodo,setMetodo]=useState('');
  const [montoTotal,setMontoTotal]=useState('');
  const [fechaPago,setFechaPago]=useState(todayInputValue());
  const [referencia,setReferencia]=useState('');
  const [observaciones,setObservaciones]=useState('');
  const [distribucionModo,setDistribucionModo]=useState('una'); // 'una' | 'multiple'
  const [facturaSeleccionada,setFacturaSeleccionada]=useState(null);
  const [distribucionValores,setDistribucionValores]=useState({}); // factura_id -> valor string
  const [creating,setCreating]=useState(false);
  const [result,setResult]=useState(null); // {status,message,abono}
  const [submitError,setSubmitError]=useState('');

  const montoNumber = useMemo(()=>Number(montoTotal)||0,[montoTotal]);
  const linkedTransactionId = sourceTransaction?.id || existingAbono?.origen_transaccion_id || null;
  const amountLocked = Boolean(linkedTransactionId);

  const loadData = useCallback(async()=>{
    if(!clientId) return;
    setLoading(true); setError('');
    try {
      const tasks = [getClient(clientId), listClientInvoices(clientId)];
      if (editing) tasks.push(getAbono(abonoId));
      if (!editing && sourceTransactionId && !location.state?.sourceTransaction) tasks.push(getPendingIncome(sourceTransactionId));
      const [clientData, data, abonoData] = await Promise.all(tasks);
      setClient(clientData || null);
      setInvoices(Array.isArray(data) ? data : []);

      if (editing && abonoData) {
        setExistingAbono(abonoData);
        setMetodo(abonoData.metodo_pago || '');
        setMontoTotal(String(Number(abonoData.monto_total || 0)));
        setFechaPago(toDateInputValue(abonoData.fecha_pago) || todayInputValue());
        setReferencia(abonoData.referencia || '');
        setObservaciones(abonoData.observaciones || '');
        const distribucion = Array.isArray(abonoData.distribucion) ? abonoData.distribucion : [];
        if (distribucion.length <= 1) {
          setDistribucionModo('una');
          setFacturaSeleccionada(distribucion[0]?.factura_id || null);
          setDistribucionValores({});
        } else {
          setDistribucionModo('multiple');
          const next = {};
          distribucion.forEach((item) => {
            next[item.factura_id] = String(Number(item.valor || 0));
          });
          setDistribucionValores(next);
          setFacturaSeleccionada(null);
        }
      }
      if (!editing && sourceTransactionId) {
        const pendingIncome = location.state?.sourceTransaction || abonoData;
        if (pendingIncome) {
          setSourceTransaction(pendingIncome);
          setMontoTotal(String(Number(pendingIncome.monto || 0)));
          setFechaPago(toDateInputValue(pendingIncome.fecha) || todayInputValue());
          setMetodo((prev) => prev || (Number(pendingIncome.caja_id) === 2 ? 'TRANSFERENCIA' : 'EFECTIVO'));
          setReferencia((prev) => prev || `#ING-${pendingIncome.id}`);
          setObservaciones((prev) => prev || `Abono creado desde ingreso de caja #${pendingIncome.id}${pendingIncome.descripcion ? ` · ${pendingIncome.descripcion}` : ''}`);
        }
      }
    } catch(err){
      setError(err?.message||'No se pudieron cargar las facturas');
    } finally {
      setLoading(false);
    }
  },[abonoId, clientId, editing, location.state, sourceTransactionId]);

  useEffect(()=>{ loadData(); },[loadData]);

  const existingInvoiceIds = useMemo(() => {
    const source = Array.isArray(existingAbono?.distribucion) ? existingAbono.distribucion : [];
    return new Set(source.map((item) => item.factura_id));
  }, [existingAbono]);

  const invoicesPendientes = useMemo(
    () => invoices.filter((f) => Number(f.valor_pendiente) > 0 || existingInvoiceIds.has(f.id)),
    [existingInvoiceIds, invoices]
  );
  const invoiceMap = useMemo(() => {
    const map = new Map();
    invoicesPendientes.forEach((invoice) => {
      map.set(Number(invoice.id), invoice);
    });
    return map;
  }, [invoicesPendientes]);

  const canNextStep1 = metodo && (metodo==='EFECTIVO'||metodo==='TRANSFERENCIA') && montoNumber>0 && !!fechaPago;
  const distributionError = useMemo(() => {
    if (!montoNumber) return 'Ingresa un monto válido para poder distribuir el abono.';
    if (invoicesPendientes.length === 0) return 'No hay facturas con saldo pendiente para aplicar este abono.';

    if (distribucionModo === 'una') {
      if (!facturaSeleccionada) return 'Selecciona la factura a la que quieres aplicar el abono.';
      const invoice = invoiceMap.get(Number(facturaSeleccionada));
      if (!invoice) return 'Selecciona una factura válida para continuar.';
      const pending = Number(invoice.valor_pendiente || 0);
      if (montoNumber > pending) {
        return `El abono supera el saldo pendiente de la factura ${invoiceCode(invoice)}. Distribúyelo entre varias facturas o reduce el valor.`;
      }
      return '';
    }

    const entries = Object.entries(distribucionValores).filter(([, value]) => value !== '' && !Number.isNaN(Number(value)) && Number(value) > 0);
    if (entries.length === 0) return 'Ingresa al menos un valor para distribuir el abono.';

    for (const [invoiceId, value] of entries) {
      const invoice = invoiceMap.get(Number(invoiceId));
      if (!invoice) return 'Hay una factura inválida dentro de la distribución.';
      const applied = Number(value) || 0;
      const pending = Number(invoice.valor_pendiente || 0);
      if (applied > pending) {
        return `La factura ${invoiceCode(invoice)} solo tiene ${formatCurrency(pending)} pendientes. Ajusta ese valor antes de continuar.`;
      }
    }

    const sum = entries.reduce((acc, [, value]) => acc + Number(value), 0);
    if (sum < montoNumber) return `Todavía faltan ${formatCurrency(montoNumber - sum)} por distribuir.`;
    if (sum > montoNumber) return `La distribución excede el monto total del abono por ${formatCurrency(sum - montoNumber)}.`;
    return '';
  }, [distribucionModo, distribucionValores, facturaSeleccionada, invoiceMap, invoicesPendientes.length, montoNumber]);
  const canNextStep2 = !distributionError;

  const distribucionFinal = useMemo(()=>{
    if(step<3) return [];
    if(distribucionModo==='una' && facturaSeleccionada){
      return [{ factura_id: facturaSeleccionada, valor: montoNumber }];
    }
    const out=[]; Object.entries(distribucionValores).forEach(([fid,val])=>{ const n=Number(val); if(n>0) out.push({ factura_id:Number(fid), valor:n }); });
    return out;
  },[step,distribucionModo,facturaSeleccionada,distribucionValores,montoNumber]);

  const proceed = () => setStep(s=> Math.min(3,s+1));
  const back = () => { if(step===1) navigate(`/wallet/client/${clientId}/invoices`); else setStep(s=> Math.max(1,s-1)); };

  const handleCreate = async () => {
    if(creating) return;
    if (observaciones.trim().length > 300) {
      setSubmitError('Las observaciones no pueden superar los 300 caracteres.');
      return;
    }
    setCreating(true); setSubmitError(''); setResult(null);
    try {
      const payload = {
        cliente_id: Number(clientId),
        metodo_pago: metodo,
        monto_total: montoNumber,
        fecha_pago: serializeDateForApi(fechaPago, existingAbono?.fecha_pago || sourceTransaction?.fecha || new Date().toISOString()),
        referencia: referencia.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        distribucion: distribucionFinal,
        ...(linkedTransactionId ? { transaccion_id: Number(linkedTransactionId) } : {}),
        notificacion: { enviar: false }
      };
      const abono = editing ? await updateAbono(abonoId, payload) : await createAbono(payload);
      setResult({ status:'success', message: editing ? 'Abono actualizado correctamente' : 'Abono creado correctamente', abono });
    } catch(err){
      const friendlyMessage = normalizeAbonoError(err?.message) || `No se pudo ${editing ? 'actualizar' : 'crear'} el abono`;
      setSubmitError(friendlyMessage);
      setResult({ status:'error', message: friendlyMessage });
    } finally { setCreating(false);} 
  };

  const stepMeta = {
    1: {
      title: 'Pago base',
      description: 'Define método, monto, fecha real de pago y referencias principales.',
      icon: 'payments',
    },
    2: {
      title: 'Distribución',
      description: 'Decide cómo aplicar el abono sobre una o varias facturas.',
      icon: 'splitscreen',
    },
    3: {
      title: 'Confirmación',
      description: 'Revisa el resumen final antes de guardar el movimiento.',
      icon: 'task_alt',
    },
  };

  const currentStep = stepMeta[step];
  const selectedDistributionCount = distribucionModo === 'una'
    ? (facturaSeleccionada ? 1 : 0)
    : Object.values(distribucionValores).filter((value) => Number(value) > 0).length;

  const StepDots = () => (
    <div className="grid gap-2 sm:grid-cols-3">
      {[1, 2, 3].map((item) => {
        const config = stepMeta[item];
        const active = step === item;
        const completed = step > item;
        return (
          <div
            key={item}
            className={`rounded-2xl border px-3 py-2 transition ${
              active
                ? 'border-[var(--primary-color)]/35 bg-[var(--primary-color)]/14 text-[var(--primary-color)]'
                : completed
                  ? 'border-[#22c55e]/25 bg-[#16a34a]/10 text-[#bbf7d0]'
                  : 'border-white/10 bg-white/[0.03] text-white/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                active ? 'bg-[var(--primary-color)]/16' : completed ? 'bg-[#16a34a]/16' : 'bg-white/5'
              }`}>
                <span className="material-symbols-outlined text-base" aria-hidden>{completed ? 'check' : config.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] opacity-70">Paso {item}</p>
                <p className="truncate text-xs font-semibold">{config.title}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background-color)] text-[var(--text-color)]">
      <Header title={editing ? "Editar abono" : "Nuevo abono"} />
      <main className="flex-1 overflow-y-auto px-3 pt-4 pb-8 lg:px-5 lg:pt-6 xl:px-6 view-enter view-enter-active">
        <div className="flex w-full flex-col gap-5 pb-10">
          <section className="relative overflow-hidden rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-5 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)] lg:p-6">
            <div className="hidden pointer-events-none absolute inset-0">
              <div className="absolute -top-24 right-[-8%] h-64 w-64 rounded-full bg-[var(--primary-color)]/16 blur-3xl" />
              <div className="absolute bottom-[-5rem] left-[-3rem] h-56 w-56 rounded-full bg-[#22c55e]/10 blur-3xl" />
            </div>

            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => navigate(`/wallet/client/${clientId}/invoices`)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden>arrow_back</span>
                    Volver a facturas
                  </button>

                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-white/10 bg-black/20 text-lg font-bold text-white">
                      {getInitials(client?.nombre)}
                    </div>
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-200">
                        <span className="material-symbols-outlined text-sm" aria-hidden>{currentStep.icon}</span>
                        {editing ? 'Edición de abono' : 'Nuevo abono'}
                      </div>
                      <div>
                        <h2 className="break-words text-3xl font-semibold leading-tight text-white">
                          {currentStep.title} para {client?.nombre || `cliente ${clientId}`}
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                          {currentStep.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <StatusPill icon="person" label={client?.nombre || `Cliente ${clientId}`} tone="neutral" />
                        <StatusPill icon="payments" label={metodo || 'Método pendiente'} tone={metodo ? 'info' : 'warning'} />
                        <StatusPill icon="calendar_month" label={formatDateInputLabel(fechaPago)} tone="neutral" />
                        {linkedTransactionId ? (
                          <StatusPill icon="account_balance" label={`Ingreso #${linkedTransactionId}`} tone="success" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
                  <HeroMetric label="Monto" value={formatCurrency(montoNumber)} icon="request_quote" tone="primary" />
                  <HeroMetric label="Facturas elegibles" value={String(invoicesPendientes.length)} icon="receipt_long" tone="info" />
                  <HeroMetric label="Paso actual" value={`${step}/3`} icon={currentStep.icon} tone="neutral" />
                  <HeroMetric label="Distribución" value={`${selectedDistributionCount} seleccionada(s)`} icon="splitscreen" tone="success" />
                </div>
              </div>

              <StepDots />

              {sourceTransaction ? (
                <div className="rounded-[24px] border border-sky-400/25 bg-sky-500/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-400/12 text-sky-200">
                      <span className="material-symbols-outlined text-xl" aria-hidden>notifications_active</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-sky-100">Abono originado desde ingreso en caja</p>
                      <p className="text-sm text-sky-50/85 break-anywhere">
                        Ingreso #{sourceTransaction.id} · {formatCurrency(sourceTransaction.monto)} · {sourceTransaction.descripcion || 'Sin descripción'}
                      </p>
                      <p className="text-xs text-sky-100/70">
                        El monto y el método se bloquean para conservar la consistencia con caja, pero la fecha sí puede ajustarse para reflejar el pago real.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {loading ? (
            <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-8 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
              <Preloader label="Cargando datos del abono…" />
            </section>
          ) : error ? (
            <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-8 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--danger-color)]/10 text-[var(--danger-color)]">
                  <span className="material-symbols-outlined text-4xl" aria-hidden>error</span>
                </div>
                <div className="space-y-1">
                  <p className="text-base font-medium">No pudimos abrir el flujo del abono</p>
                  <p className="text-sm text-[var(--text-secondary-color)] break-anywhere">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/wallet/client/${clientId}/invoices`)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/15"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden>arrow_back</span>
                  Volver
                </button>
              </div>
            </section>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)] overflow-hidden">
                <header className="border-b border-white/5 px-5 py-5 lg:px-6">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary-color)]">Paso {step} de 3</p>
                    <h3 className="text-xl font-semibold">{currentStep.title}</h3>
                    <p className="text-sm text-[var(--text-secondary-color)]">{currentStep.description}</p>
                  </div>
                </header>

                {step===1 && (
                  <div className="px-5 py-5 lg:px-6 flex flex-col gap-6">
                    {amountLocked ? (
                      <div className="rounded-[22px] border border-sky-400/25 bg-sky-500/10 p-4 text-sm text-sky-100">
                        El monto y el método vienen desde un ingreso de caja ya registrado. Aquí solo ajustas la fecha real del pago, la referencia y las observaciones.
                      </div>
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <WizardField label="Método de pago" icon="payments" helpText="Selecciona cómo se recibió el dinero.">
                        <select value={metodo} onChange={e=>setMetodo(e.target.value)} disabled={amountLocked} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-70 disabled:cursor-not-allowed">
                          <option value="">Selecciona…</option>
                          <option value="EFECTIVO">EFECTIVO</option>
                          <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                        </select>
                      </WizardField>

                      <WizardField label="Monto total" icon="request_quote" helpText={formatCurrency(montoNumber)}>
                        <input type="number" min="0" value={montoTotal} onChange={e=>setMontoTotal(e.target.value)} placeholder="0" disabled={amountLocked} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </WizardField>

                      <WizardField label="Fecha de pago" icon="calendar_month" helpText="Debe representar cuándo pagó realmente el cliente.">
                        <input type="date" value={fechaPago} onChange={e=>setFechaPago(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20" />
                      </WizardField>

                      <WizardField label="Referencia" icon="tag" helpText="Opcional: número de transacción o dato corto.">
                        <input value={referencia} onChange={e=>setReferencia(e.target.value)} maxLength={60} placeholder="# de transacción u observación corta" className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20" />
                      </WizardField>
                    </div>

                    <WizardField label="Observaciones" icon="sticky_note_2" helpText="Úsalo para acuerdos, contexto o aclaraciones del pago.">
                      <textarea value={observaciones} onChange={e=>setObservaciones(e.target.value)} maxLength={300} rows={4} placeholder="Notas del pago o acuerdos con el cliente" className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20" />
                    </WizardField>

                    <StepActions
                      onBack={back}
                      onNext={proceed}
                      nextDisabled={!canNextStep1}
                      nextLabel="Continuar"
                    />
                  </div>
                )}

                {step===2 && (
                  <div className="px-5 py-5 lg:px-6 flex flex-col gap-6">
                    <div className="flex flex-wrap gap-3">
                      <ModeButton active={distribucionModo==='una'} onClick={()=> setDistribucionModo('una')} icon="radio_button_checked" label="Una factura" />
                      <ModeButton active={distribucionModo==='multiple'} onClick={()=> setDistribucionModo('multiple')} icon="splitscreen" label="Varias facturas" />
                    </div>

                    {distribucionModo==='una' ? (
                      <div className="grid gap-3">
                        {invoicesPendientes.map((f) => {
                          const selected = facturaSeleccionada===f.id;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={()=> setFacturaSeleccionada(f.id)}
                              className={`rounded-[24px] border p-4 text-left transition ${
                                selected
                                  ? 'border-[var(--primary-color)]/35 bg-[var(--primary-color)]/10'
                                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="text-lg font-semibold">OP {f.op}</p>
                                  <p className="text-sm text-[var(--text-secondary-color)]">{f.concepto || 'Sin concepto'}</p>
                                </div>
                                <span className={`material-symbols-outlined text-2xl ${selected ? 'text-[var(--primary-color)]' : 'text-white/35'}`} aria-hidden>
                                  {selected ? 'check_circle' : 'radio_button_unchecked'}
                                </span>
                              </div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <MiniMetric label="Total" value={formatCurrency(f.valor_total)} tone="neutral" />
                                <MiniMetric label="Abonado" value={formatCurrency(f.valor_abonado)} tone="success" />
                                <MiniMetric label="Pendiente" value={formatCurrency(f.valor_pendiente)} tone="danger" />
                              </div>
                            </button>
                          );
                        })}
                        {invoicesPendientes.length===0 ? <EmptyInvoiceState message="No hay facturas con saldo pendiente para aplicar este abono." /> : null}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <p className="text-sm text-[var(--text-secondary-color)]">
                          Distribuye exactamente {formatCurrency(montoNumber)} entre las facturas con saldo. La suma debe coincidir.
                        </p>
                        <div className="grid gap-3 max-h-[52vh] overflow-auto pr-1">
                          {invoicesPendientes.map((f) => {
                            const value = distribucionValores[f.id] || '';
                            return (
                              <div key={f.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="space-y-1">
                                    <p className="text-lg font-semibold">OP {f.op}</p>
                                    <p className="text-sm text-[var(--text-secondary-color)]">{f.concepto || 'Sin concepto'}</p>
                                  </div>
                                  <div className="w-full sm:w-40">
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={value}
                                      onChange={e=> setDistribucionValores(s=> ({...s, [f.id]: e.target.value}))}
                                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                                      placeholder="0"
                                    />
                                  </div>
                                </div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                  <MiniMetric label="Total" value={formatCurrency(f.valor_total)} tone="neutral" />
                                  <MiniMetric label="Abonado" value={formatCurrency(f.valor_abonado)} tone="success" />
                                  <MiniMetric label="Pendiente" value={formatCurrency(f.valor_pendiente)} tone="danger" />
                                </div>
                              </div>
                            );
                          })}
                          {invoicesPendientes.length===0 ? <EmptyInvoiceState message="No hay facturas con saldo pendiente para distribuir este abono." /> : null}
                        </div>
                        <DistribucionResumen monto={montoNumber} distribucionValores={distribucionValores} />
                      </div>
                    )}

                    {!!distributionError && (
                      <div className="rounded-[22px] border border-[#f59e0b]/35 bg-[#f59e0b]/10 px-4 py-3 text-sm text-[#fde68a]">
                        {distributionError}
                      </div>
                    )}

                    <StepActions
                      onBack={back}
                      onNext={proceed}
                      nextDisabled={!canNextStep2}
                      nextLabel="Continuar"
                    />
                  </div>
                )}

                {step===3 && (
                  <div className="px-5 py-5 lg:px-6 flex flex-col gap-6">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <HeroMetric label="Monto" value={formatCurrency(montoNumber)} icon="request_quote" tone="primary" />
                      <HeroMetric label="Método" value={metodo || '—'} icon="payments" tone="info" />
                      <HeroMetric label="Facturas" value={String(distribucionFinal.length)} icon="receipt_long" tone="success" />
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="space-y-2 text-sm">
                        <ResumenRow label="Fecha de pago" value={formatDateInputLabel(fechaPago)} />
                        {linkedTransactionId ? <ResumenRow label="Ingreso origen" value={`#${linkedTransactionId}`} /> : null}
                        <ResumenRow label="Referencia" value={referencia.trim()||'—'} />
                        <ResumenRow label="Observaciones" value={observaciones.trim()||'—'} />
                        <ResumenRow label="Distribución" value={distribucionModo==='una'? 'Una factura' : 'Varias facturas'} />
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
                      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                        <span className="material-symbols-outlined text-sm" aria-hidden>splitscreen</span>
                        Aplicación del abono
                      </div>
                      <div className="space-y-2">
                        {distribucionFinal.map((d) => {
                          const inv = invoices.find((f) => f.id===d.factura_id);
                          return (
                            <div key={d.factura_id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm">
                              <div>
                                <p className="font-medium">OP {inv?.op || d.factura_id}</p>
                                <p className="text-xs text-[var(--text-secondary-color)]">{inv?.concepto || 'Sin concepto'}</p>
                              </div>
                              <span className="font-semibold">{formatCurrency(d.valor)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {submitError ? <div className="rounded-[22px] border border-[#ef4444]/40 bg-[#ef4444]/10 px-4 py-3 text-sm text-[#fca5a5]">{submitError}</div> : null}

                    <StepActions
                      onBack={back}
                      onNext={handleCreate}
                      nextDisabled={creating || distribucionFinal.length===0 || !!distributionError}
                      nextLabel={creating ? (editing ? 'Actualizando…' : 'Creando…') : (editing ? 'Guardar cambios' : 'Confirmar y crear')}
                      nextTone="success"
                    />
                  </div>
                )}
              </section>

              <aside className="flex flex-col gap-5">
                <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-5 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)] lg:sticky lg:top-4">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary-color)]">Resumen rápido</p>
                    <h3 className="text-lg font-semibold">Lo que llevas construido</h3>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <MiniMetric label="Monto total" value={formatCurrency(montoNumber)} tone="primary" />
                    <MiniMetric label="Fecha" value={formatDateInputLabel(fechaPago)} tone="neutral" />
                    <MiniMetric label="Método" value={metodo || 'Pendiente'} tone={metodo ? 'info' : 'danger'} />
                    <MiniMetric label="Facturas elegidas" value={String(selectedDistributionCount)} tone="success" />
                  </div>

                  <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="space-y-2 text-sm">
                      <ResumenRow label="Cliente" value={client?.nombre || `Cliente ${clientId}`} />
                      <ResumenRow label="Modo" value={editing ? 'Edición' : 'Creación'} />
                      <ResumenRow label="Referencia" value={referencia.trim() || '—'} />
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-5 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary-color)]">Guía del flujo</p>
                    <HintCard icon="calendar_month" text="La fecha del abono debe reflejar cuándo pagó el cliente, incluso si lo registras después." />
                    <HintCard icon="rule" text="Si el abono viene desde caja, el monto y el método se respetan para no desalinear la caja principal." />
                    <HintCard icon="splitscreen" text="Cuando uses distribución múltiple, la suma aplicada debe coincidir exactamente con el monto total." />
                  </div>
                </section>
              </aside>
            </div>
          )}
        </div>
      </main>

      {creating && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <Preloader label={editing ? "Actualizando abono…" : "Creando abono…"} />
        </div>
      )}
      {result && !creating && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center px-4 py-10 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--card-color)] p-6 flex flex-col gap-4 items-center text-center shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
            <span className={`material-symbols-outlined text-5xl ${result.status==='success'?'text-[#86efac]':'text-[var(--danger-color)]'}`}>{result.status==='success'?'task_alt':'error'}</span>
            <p className="text-base font-semibold">{result.status==='success'?(editing ? 'Abono actualizado' : 'Abono creado'):'Error'}</p>
            <p className="text-xs text-[var(--text-secondary-color)] break-anywhere">{result.message}</p>
            <div className="flex gap-2 flex-wrap justify-center mt-2">
              {result.status==='success' && (
                <button type="button" onClick={()=> navigate(`/wallet/client/${clientId}/invoices`)} className="px-4 py-2 rounded-lg bg-[#22c55e]/20 border border-[#16a34a]/50 text-xs font-medium text-[#86efac] hover:bg-[#22c55e]/30">
                  Ver facturas
                </button>
              )}
              <button type="button" onClick={()=> setResult(null)} className="px-4 py-2 rounded-lg bg-white/10 text-xs font-medium hover:bg-white/15">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeroMetric({ label, value, icon, tone = 'neutral' }) {
  const toneClass = {
    neutral: 'border-white/10 bg-white/[0.03] text-white',
    primary: 'border-white/10 bg-white/[0.03] text-white',
    success: 'border-white/10 bg-white/[0.03] text-white',
    danger: 'border-white/10 bg-white/[0.03] text-white',
    info: 'border-white/10 bg-white/[0.03] text-white',
  }[tone] || 'border-white/10 bg-white/[0.03] text-white';

  return (
    <div className={`rounded-[24px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] opacity-70">{label}</p>
          <p className="mt-3 break-words text-lg font-semibold leading-tight">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04]">
          <span className="material-symbols-outlined text-xl opacity-80" aria-hidden>{icon}</span>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ icon, label, tone = 'neutral' }) {
  const toneClass = {
    neutral: 'border-white/10 bg-white/[0.03] text-slate-200',
    success: 'border-white/10 bg-white/[0.03] text-slate-200',
    warning: 'border-white/10 bg-white/[0.03] text-slate-200',
    info: 'border-white/10 bg-white/[0.03] text-slate-200',
  }[tone] || 'border-white/10 bg-white/[0.03] text-slate-200';

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 break-words ${toneClass}`}>
      <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function WizardField({ label, icon, helpText, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary-color)]">
        <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
        {label}
      </span>
      {children}
      {helpText ? <span className="text-[11px] text-[var(--text-secondary-color)]">{helpText}</span> : null}
    </label>
  );
}

function StepActions({ onBack, onNext, nextDisabled = false, nextLabel, nextTone = 'primary' }) {
  const nextClass = nextTone === 'success'
    ? 'bg-[#22c55e]/20 border-[#16a34a]/60 text-[#86efac] hover:bg-[#22c55e]/30'
    : 'bg-[var(--primary-color)]/20 border-[var(--primary-color)]/50 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/30';

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <button type="button" onClick={onBack} className="px-4 py-2 rounded-2xl bg-white/5 text-sm font-medium hover:bg-white/10 inline-flex items-center gap-2">
        <span className="material-symbols-outlined text-sm" aria-hidden>arrow_back</span>
        Volver
      </button>
      <button type="button" disabled={nextDisabled} onClick={onNext} className={`px-4 py-2 rounded-2xl border text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-2 ${nextClass}`}>
        {nextLabel}
        <span className="material-symbols-outlined text-sm" aria-hidden>{nextTone === 'success' ? 'check_circle' : 'arrow_forward'}</span>
      </button>
    </div>
  );
}

function ModeButton({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
        active
          ? 'border-[var(--primary-color)]/40 bg-[var(--primary-color)]/10 text-[var(--primary-color)]'
          : 'border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.05]'
      }`}
    >
      <span className="material-symbols-outlined text-base" aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function MiniMetric({ label, value, tone = 'neutral' }) {
  const valueClass = {
    neutral: 'text-white',
    primary: 'text-[var(--primary-color)]',
    success: 'text-[#86efac]',
    danger: 'text-[#fca5a5]',
    info: 'text-sky-200',
  }[tone] || 'text-white';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs text-[var(--text-secondary-color)]">{label}</p>
      <p className={`mt-2 break-words text-sm font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function EmptyInvoiceState({ message }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-[var(--text-secondary-color)]">
      {message}
    </div>
  );
}

function HintCard({ icon, text }) {
  return (
    <div className="flex items-start gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
      <span className="material-symbols-outlined text-base text-sky-200" aria-hidden>{icon}</span>
      <p className="leading-6">{text}</p>
    </div>
  );
}

function ResumenRow({label,value}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[11px] text-white/50 uppercase tracking-[0.12em]">{label}</span>
      <span className="font-medium text-sm text-right break-anywhere">{value}</span>
    </div>
  );
}

function DistribucionResumen({monto, distribucionValores}){
  const sum = Object.values(distribucionValores).reduce((acc,v)=> acc + (Number(v)||0),0);
  const diff = monto - sum;
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/15 p-4 flex flex-col gap-2 text-sm">
      <ResumenRow label="Suma distribuida" value={formatCurrency(sum)} />
      <ResumenRow label="Objetivo" value={formatCurrency(monto)} />
      <ResumenRow label="Diferencia" value={formatCurrency(diff)} />
      <p className={`text-xs ${diff===0?'text-[#86efac]': diff>0?'text-[#fbbf24]':'text-[#fca5a5]'}`}>
        {diff===0 ? 'La distribución está cuadrada correctamente.' : 'La suma debe ser exactamente igual al monto total del abono.'}
      </p>
    </div>
  );
}
