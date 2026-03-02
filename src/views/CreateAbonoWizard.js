import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import Preloader from '../components/Preloader';
import useTitle from '../useTitle';
import { listClientInvoices, uploadSupportImage, createAbono } from '../carteraApi';

function formatCurrency(v){ const n=Number(v); if(!Number.isFinite(n)) return String(v??''); return n.toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}); }

export default function CreateAbonoWizard(){
  const navigate = useNavigate();
  const { id: clientId } = useParams();
  useTitle('Nuevo abono · ATM');

  const [step,setStep]=useState(1);
  const [invoices,setInvoices]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [metodo,setMetodo]=useState('');
  const [montoTotal,setMontoTotal]=useState('');
  const [referencia,setReferencia]=useState('');
  const [soporteUploading,setSoporteUploading]=useState(false);
  const [soporteData,setSoporteData]=useState(null); // {url, fullUrl, nombre, path}
  const [distribucionModo,setDistribucionModo]=useState('una'); // 'una' | 'multiple'
  const [facturaSeleccionada,setFacturaSeleccionada]=useState(null);
  const [distribucionValores,setDistribucionValores]=useState({}); // factura_id -> valor string
  const [creating,setCreating]=useState(false);
  const [result,setResult]=useState(null); // {status,message,abono}
  const [submitError,setSubmitError]=useState('');

  const montoNumber = useMemo(()=>Number(montoTotal)||0,[montoTotal]);

  const fetchInvoices = useCallback(async()=>{
    if(!clientId) return;
    setLoading(true); setError('');
    try { const data = await listClientInvoices(clientId); setInvoices(Array.isArray(data)?data:[]);} catch(err){ setError(err?.message||'No se pudieron cargar las facturas'); } finally { setLoading(false);} 
  },[clientId]);

  useEffect(()=>{ fetchInvoices(); },[fetchInvoices]);

  const invoicesPendientes = useMemo(()=> invoices.filter(f=> Number(f.valor_pendiente)>0 ),[invoices]);

  const canNextStep1 = metodo && (metodo==='EFECTIVO'||metodo==='TRANSFERENCIA') && montoNumber>0;
  const canNextStep2 = Boolean(soporteData); // soporte obligatorio según flujo dado
  const canNextStep3 = useMemo(()=>{
    if(distribucionModo==='una') return !!facturaSeleccionada;
    // multiple: suma debe coincidir con montoTotal y >0 cada uno opcional
    const entries = Object.entries(distribucionValores).filter(([k,v])=> v!=='' && !isNaN(Number(v)) && Number(v)>0);
    if(entries.length===0) return false;
    const sum = entries.reduce((acc,[,v])=> acc + Number(v),0);
    return sum === montoNumber && sum>0;
  },[distribucionModo,facturaSeleccionada,distribucionValores,montoNumber]);

  const distribucionFinal = useMemo(()=>{
    if(step<4) return [];
    if(distribucionModo==='una' && facturaSeleccionada){
      return [{ factura_id: facturaSeleccionada, valor: montoNumber }];
    }
    const out=[]; Object.entries(distribucionValores).forEach(([fid,val])=>{ const n=Number(val); if(n>0) out.push({ factura_id:Number(fid), valor:n }); });
    return out;
  },[step,distribucionModo,facturaSeleccionada,distribucionValores,montoNumber]);

  const handleUpload = async (file) => {
    if(!file) return;
    setSoporteUploading(true); setSoporteData(null);
    try {
      const data = await uploadSupportImage(file);
      setSoporteData({ nombre: file.name, path: data.url || data.fullUrl, url: data.fullUrl });
    } catch(err){
      alert(err?.message || 'Error subiendo imagen');
    } finally { setSoporteUploading(false);} 
  };

  const proceed = () => setStep(s=> Math.min(4,s+1));
  const back = () => { if(step===1) navigate(`/wallet/client/${clientId}/invoices`); else setStep(s=> Math.max(1,s-1)); };

  const handleCreate = async () => {
    if(creating) return;
    setCreating(true); setSubmitError(''); setResult(null);
    try {
      const payload = {
        cliente_id: Number(clientId),
        metodo_pago: metodo,
        monto_total: montoNumber,
        referencia: referencia.trim() || undefined,
        distribucion: distribucionFinal,
        soporte: soporteData ? { nombre: soporteData.nombre, path: soporteData.path, url: soporteData.url } : undefined,
        notificacion: { enviar: false }
      };
      const abono = await createAbono(payload);
      setResult({ status:'success', message:'Abono creado correctamente', abono });
    } catch(err){
      setSubmitError(err?.message || 'No se pudo crear el abono');
      setResult({ status:'error', message: err?.message || 'Error al crear el abono' });
    } finally { setCreating(false);} 
  };

  const StepDots = () => (
    <div className="flex items-center gap-2">{[1,2,3,4].map(n=> <span key={n} className={`h-2.5 w-2.5 rounded-full ${step===n?'bg-[var(--primary-color)] shadow-[0_0_0_4px_rgba(255,255,255,0.07)]':'bg-white/15'}`}></span>)}</div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background-color)] text-[var(--text-color)]">
      <Header title="Nuevo abono" />
      <main className="flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] overflow-y-auto view-enter view-enter-active">
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-4 pb-10">
          <section className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl shadow-[0_10px_40px_-24px_rgba(0,0,0,0.9)] overflow-hidden">
            <header className="px-4 sm:px-6 py-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">Crear abono</h2>
                <p className="text-sm text-[var(--text-secondary-color)]">Cliente ID: {clientId}</p>
              </div>
              <StepDots />
            </header>

            {step===1 && (
              <div className="px-4 sm:px-6 py-5 flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold">Método y monto</h3>
                  <p className="text-xs text-[var(--text-secondary-color)]">Define cómo se recibió el pago y su monto total.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium">
                    Método de pago
                    <select value={metodo} onChange={e=>setMetodo(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20">
                      <option value="">Selecciona…</option>
                      <option value="EFECTIVO">EFECTIVO</option>
                      <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium">
                    Monto total
                    <input type="number" min="0" value={montoTotal} onChange={e=>setMontoTotal(e.target.value)} placeholder="0" className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium">
                    Referencia (opcional)
                    <input value={referencia} onChange={e=>setReferencia(e.target.value)} maxLength={60} placeholder="# de transacción u observación corta" className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20" />
                  </label>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <button type="button" onClick={back} className="px-4 py-2 rounded-lg bg-white/5 text-sm font-medium hover:bg-white/10 inline-flex items-center gap-2"><span className="material-symbols-outlined text-sm" aria-hidden>arrow_back</span>Volver</button>
                  <button type="button" disabled={!canNextStep1} onClick={proceed} className="px-4 py-2 rounded-lg bg-[var(--primary-color)]/20 border border-[var(--primary-color)]/50 text-sm font-semibold text-[var(--primary-color)] hover:bg-[var(--primary-color)]/30 disabled:opacity-40 inline-flex items-center gap-2">Continuar<span className="material-symbols-outlined text-sm" aria-hidden>arrow_forward</span></button>
                </div>
              </div>
            )}

            {step===2 && (
              <div className="px-4 sm:px-6 py-5 flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold">Soporte</h3>
                  <p className="text-xs text-[var(--text-secondary-color)]">Sube la imagen del comprobante del pago.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <input type="file" accept="image/*" onChange={e=> handleUpload(e.target.files?.[0])} />
                  {soporteUploading && <Preloader label="Subiendo imagen…" />}
                  {soporteData && !soporteUploading && (
                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <span className="material-symbols-outlined text-3xl text-[#86efac]" aria-hidden>image</span>
                      <div className="flex-1 flex flex-col truncate">
                        <span className="text-xs font-medium truncate">{soporteData.nombre}</span>
                        <a href={soporteData.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--primary-color)] underline truncate">Ver imagen</a>
                      </div>
                      <button type="button" onClick={()=> setSoporteData(null)} className="text-[10px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10">Quitar</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <button type="button" onClick={back} className="px-4 py-2 rounded-lg bg-white/5 text-sm font-medium hover:bg-white/10 inline-flex items-center gap-2"><span className="material-symbols-outlined text-sm" aria-hidden>arrow_back</span>Atrás</button>
                  <button type="button" disabled={!canNextStep2} onClick={proceed} className="px-4 py-2 rounded-lg bg-[var(--primary-color)]/20 border border-[var(--primary-color)]/50 text-sm font-semibold text-[var(--primary-color)] hover:bg-[var(--primary-color)]/30 disabled:opacity-40 inline-flex items-center gap-2">Continuar<span className="material-symbols-outlined text-sm" aria-hidden>arrow_forward</span></button>
                </div>
              </div>
            )}

            {step===3 && (
              <div className="px-4 sm:px-6 py-5 flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold">Distribución</h3>
                  <p className="text-xs text-[var(--text-secondary-color)]">Decide si aplicas el pago a una sola factura o lo distribuyes.</p>
                </div>
                <div className="flex gap-4 text-xs font-medium">
                  <button type="button" onClick={()=> setDistribucionModo('una')} className={`px-3 py-1.5 rounded-lg border ${distribucionModo==='una'?'border-[var(--primary-color)] bg-[var(--primary-color)]/15 text-[var(--primary-color)]':'border-white/10 bg-white/5 text-white/60'}`}>Una factura</button>
                  <button type="button" onClick={()=> setDistribucionModo('multiple')} className={`px-3 py-1.5 rounded-lg border ${distribucionModo==='multiple'?'border-[var(--primary-color)] bg-[var(--primary-color)]/15 text-[var(--primary-color)]':'border-white/10 bg-white/5 text-white/60'}`}>Varias facturas</button>
                </div>
                {loading ? <Preloader label="Cargando facturas…" /> : error ? <p className="text-xs text-[var(--danger-color)]">{error}</p> : (
                  <div className="flex flex-col gap-3">
                    {distribucionModo==='una' ? (
                      <div className="flex flex-col divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-white/[0.02]">
                        {invoicesPendientes.map(f => {
                          const selected = facturaSeleccionada===f.id;
                          return (
                            <button key={f.id} type="button" onClick={()=> setFacturaSeleccionada(f.id)} className={`text-left px-4 py-3 flex items-center gap-3 transition hover:bg-white/5 ${selected?'bg-[var(--primary-color)]/10 ring-1 ring-[var(--primary-color)]/40':''}`}>
                              <div className="flex-1 flex flex-col">
                                <span className="text-sm font-semibold">OP {f.op}</span>
                                <span className="text-[10px] text-white/50">Pendiente: {formatCurrency(f.valor_pendiente)}</span>
                              </div>
                              <span className={`material-symbols-outlined text-base ${selected? 'text-[var(--primary-color)]':'text-white/40'}`}>{selected?'check_circle':'radio_button_unchecked'}</span>
                            </button>
                          );
                        })}
                        {invoicesPendientes.length===0 && <div className="px-4 py-6 text-center text-xs text-white/50">No hay facturas con saldo pendiente.</div>}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <p className="text-[10px] text-white/50">Distribuye exactamente {formatCurrency(montoNumber)} entre las facturas con saldo. La suma debe coincidir.</p>
                        <div className="flex flex-col gap-2 max-h-[50vh] overflow-auto pr-1">
                          {invoicesPendientes.map(f => {
                            const value = distribucionValores[f.id] || '';
                            return (
                              <div key={f.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="text-xs font-medium truncate">OP {f.op}</span>
                                  <span className="text-[10px] text-white/50 truncate">Pend: {formatCurrency(f.valor_pendiente)}</span>
                                </div>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={value}
                                  onChange={e=> setDistribucionValores(s=> ({...s, [f.id]: e.target.value}))}
                                  className="w-28 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                                  placeholder="0"
                                />
                              </div>
                            );
                          })}
                          {invoicesPendientes.length===0 && <div className="px-4 py-6 text-center text-xs text-white/50">Sin facturas pendientes.</div>}
                        </div>
                        <DistribucionResumen monto={montoNumber} distribucionValores={distribucionValores} />
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <button type="button" onClick={back} className="px-4 py-2 rounded-lg bg-white/5 text-sm font-medium hover:bg-white/10 inline-flex items-center gap-2"><span className="material-symbols-outlined text-sm" aria-hidden>arrow_back</span>Atrás</button>
                  <button type="button" disabled={!canNextStep3} onClick={proceed} className="px-4 py-2 rounded-lg bg-[var(--primary-color)]/20 border border-[var(--primary-color)]/50 text-sm font-semibold text-[var(--primary-color)] hover:bg-[var(--primary-color)]/30 disabled:opacity-40 inline-flex items-center gap-2">Continuar<span className="material-symbols-outlined text-sm" aria-hidden>arrow_forward</span></button>
                </div>
              </div>
            )}

            {step===4 && (
              <div className="px-4 sm:px-6 py-5 flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold">Resumen</h3>
                  <p className="text-xs text-[var(--text-secondary-color)]">Verifica los datos antes de confirmar.</p>
                </div>
                <div className="space-y-2 text-sm">
                  <ResumenRow label="Método" value={metodo||'—'} />
                  <ResumenRow label="Monto total" value={formatCurrency(montoNumber)} />
                  <ResumenRow label="Referencia" value={referencia.trim()||'—'} />
                  <ResumenRow label="Distribución" value={distribucionModo==='una'? 'Una factura' : 'Varias facturas'} />
                  <div className="pt-2 border-t border-white/5 space-y-1 text-[11px]">
                    {distribucionFinal.map(d => {
                      const inv = invoices.find(f=> f.id===d.factura_id);
                      return <div key={d.factura_id} className="flex justify-between gap-3"><span className="text-white/50">OP {inv?.op}</span><span className="font-medium">{formatCurrency(d.valor)}</span></div>;
                    })}
                  </div>
                  {soporteData && (
                    <div className="pt-2 border-t border-white/5 text-[11px] flex items-center gap-3">
                      <span className="material-symbols-outlined text-base text-white/60" aria-hidden>image</span>
                      <a href={soporteData.url} target="_blank" rel="noopener noreferrer" className="underline truncate text-[var(--primary-color)]">{soporteData.nombre}</a>
                    </div>
                  )}
                </div>
                {submitError && <div className="rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#fca5a5]">{submitError}</div>}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <button type="button" onClick={back} className="px-4 py-2 rounded-lg bg-white/5 text-sm font-medium hover:bg-white/10 inline-flex items-center gap-2"><span className="material-symbols-outlined text-sm" aria-hidden>arrow_back</span>Atrás</button>
                  <button type="button" disabled={creating || distribucionFinal.length===0} onClick={handleCreate} className="px-4 py-2 rounded-lg bg-[#22c55e]/20 border border-[#16a34a]/60 text-sm font-semibold text-[#86efac] hover:bg-[#22c55e]/30 disabled:opacity-40 inline-flex items-center gap-2">{creating?'Creando…':'Confirmar y crear'}<span className="material-symbols-outlined text-sm" aria-hidden>check_circle</span></button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      <BottomNav
        onHome={()=> navigate('/dashboard')}
        onMovements={()=> navigate('/movements')}
        onWallet={()=> navigate('/wallet')}
        onReports={()=> navigate('/reports')}
        onCreateMovement={()=> navigate('/new')}
        onCashout={()=> navigate('/cashout')}
        onCashoutBank={()=> navigate('/cashout-bank')}
      />

      {creating && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm"><Preloader label="Creando abono…" /></div>
      )}
      {result && !creating && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center px-4 py-10 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--card-color)] p-6 flex flex-col gap-4 items-center text-center shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
            <span className={`material-symbols-outlined text-5xl ${result.status==='success'?'text-[#86efac]':'text-[var(--danger-color)]'}`}>{result.status==='success'?'task_alt':'error'}</span>
            <p className="text-base font-semibold">{result.status==='success'?'Abono creado':'Error'}</p>
            <p className="text-xs text-[var(--text-secondary-color)] break-anywhere">{result.message}</p>
            <div className="flex gap-2 flex-wrap justify-center mt-2">
              {result.status==='success' && (
                <button type="button" onClick={()=> navigate(`/wallet/client/${clientId}/invoices`)} className="px-4 py-2 rounded-lg bg-[#22c55e]/20 border border-[#16a34a]/50 text-xs font-medium text-[#86efac] hover:bg-[#22c55e]/30">Ver facturas</button>
              )}
              <button type="button" onClick={()=> setResult(null)} className="px-4 py-2 rounded-lg bg-white/10 text-xs font-medium hover:bg-white/15">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumenRow({label,value}){ return <div className="flex justify-between gap-4"><span className="text-white/50 text-[11px]">{label}</span><span className="font-medium text-[11px]">{value}</span></div>; }

function DistribucionResumen({monto, distribucionValores}){
  const sum = Object.values(distribucionValores).reduce((acc,v)=> acc + (Number(v)||0),0);
  const diff = monto - sum;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-1 text-[11px]">
      <div className="flex justify-between"><span className="text-white/50">Suma</span><span className="font-medium">{formatCurrency(sum)}</span></div>
      <div className="flex justify-between"><span className="text-white/50">Objetivo</span><span className="font-medium">{formatCurrency(monto)}</span></div>
      <div className="flex justify-between"><span className="text-white/50">Diferencia</span><span className={`font-semibold ${diff===0?'text-[#86efac]': diff>0?'text-[#fbbf24]':'text-[#fca5a5]'}`}>{formatCurrency(diff)}</span></div>
      <p className="text-[10px] text-white/40">La suma debe ser exactamente igual al monto total.</p>
    </div>
  );
}
