import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
// import BottomNav from '../components/BottomNav';
import ServerDown from '../components/ServerDown';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiFetch, pingServer } from '../api';
import useTitle from '../useTitle';
import useTimeout from '../useTimeout';
import { formatCLP } from '../formatMoney';
import { getSessionUsername, getUsers } from '../auth';
import { useNotifications } from '../components/Notifications';

export default function CashoutPOS() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialPos = queryParams.get('pos'); // "Caja 1", "Barra", etc.

  useTitle('Retirar efectivo en punto · ATM Ricky Rich');
  const { notify } = useNotifications();

  const [checking, setChecking] = useState(true);
  const [serverOk, setServerOk] = useState(null);
  const [, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCaja, setLoadingCaja] = useState(false);
  const [cajaData, setCajaData] = useState(null);
  const [step, setStep] = useState(1);
  const [retiroTipo, setRetiroTipo] = useState(''); // 'caja' | 'cashout' | 'gasto_operativo'

  const [amount, setAmount] = useState('');
  const [posName, setPosName] = useState(initialPos || '');
  const [reason, setReason] = useState('');
  const [categoriaId, setCategoriaId] = useState('');

  // Gasto Operativo state
  const [file, setFile] = useState(null); // eslint-disable-line no-unused-vars
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    (async () => {
      const ok = await pingServer();
      setServerOk(ok);
      setChecking(false);
      if (ok) {
        try {
          setLoadingCaja(true);
          console.log('[CashoutPOS] Request GET caja', { path: '/api/caja' });
          const r = await apiFetch('/api/caja', { headers: { accept: 'application/json' } });
          console.log('[CashoutPOS] Response GET caja', { ok: r.ok, status: r.status, url: r.url, statusText: r.statusText });
          if (!r.ok) throw new Error(await r.text().catch(() => 'Error cargando caja'));
          const data = await r.json();
          console.log('[CashoutPOS] Data GET caja', data);
          setCajaData(data);
        } catch (e) {
          console.error(e);
          setError(e.message || 'No se pudo cargar caja');
        } finally {
          setLoadingCaja(false);
        }
      }
    })();
  }, []);

  useTimeout(() => {
    if (serverOk === null && checking) setChecking(false);
  }, 4000, [serverOk, checking]);

  const currentUser = getSessionUsername();
  const [displayName, setDisplayName] = useState('');

  const localesList = useMemo(() => {
    if (!cajaData?.locales) return [];
    return Object.entries(cajaData.locales).map(([key, info]) => {
      const label = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const estado = String(info?.estado_sesion || '').toLowerCase();
      const estadoLabel = estado ? estado.charAt(0).toUpperCase() + estado.slice(1) : '—';
      const estadoBadge = estado === 'abierta'
        ? 'border-green-500/40 bg-green-500/10 text-green-200'
        : 'border-white/15 bg-white/5 text-white/70';
      return {
        value: label,
        label,
        saldo: Number(info?.saldo_en_caja) || 0,
        vendido: Number(info?.vendido) || 0,
        estado,
        estadoLabel,
        estadoBadge,
      };
    });
  }, [cajaData]);

  const selectedLocal = useMemo(() => localesList.find(l => l.value === posName), [localesList, posName]);

  const isGastoOp = retiroTipo === 'gasto_operativo';
  const totalSteps = isGastoOp ? 6 : 5;

  const canStep2 = Boolean(retiroTipo);
  const canStep3 = canStep2 && !loadingCaja && posName;
  const canStep4 = canStep3 && Number(amount) > 0;
  // Step 5
  // If GastoOp: Step 4 is Reason (mandatory), Step 5 is Image (mandatory), Step 6 confirm
  // If Normal: Step 4 is Reason (optional), Step 5 confirm
  const canStep5 = canStep4 && (isGastoOp ? Boolean(reason) : true);
  const canStep6 = isGastoOp ? Boolean(imageUrl) : true;

  // Navigation Logic with Skip
  const nextStep = () => {
    if (step === 1 && canStep2) {
      if (initialPos) return setStep(3); // Skip Step 2 if POS predefined
      return setStep(2);
    }
    if (step === 2 && canStep3) return setStep(3);
    if (step === 3 && canStep4) return setStep(4);
    if (step === 4 && canStep5) return setStep(5);
    if (step === 5 && isGastoOp && canStep6) return setStep(6);
  };

  const prevStep = () => {
    if (step === 3 && initialPos) return setStep(1); // Skip Step 2 if POS predefined
    setStep(Math.max(1, step - 1));
  };

  // UX: al cambiar de paso, lleva al inicio del formulario para evitar que el usuario quede scrolleado
  useEffect(() => {
    const el = document.getElementById('cashout-form-top');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [step]);

  useEffect(() => {
    (async () => {
      try {
        const uname = getSessionUsername();
        const list = await getUsers();
        const arr = Array.isArray(list) ? list : [];
        const me = arr.find(u => u.username === uname);
        setDisplayName(me?.displayName || uname || '');
      } catch {
        setDisplayName(getSessionUsername() || '');
      }
    })();
  }, []);

  const handleFileUpload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', f);
      // Sube vía proxy interno para no hardcodear dominios externos en el cliente.
      const res = await fetch('/external/upload', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error('Error subiendo imagen');
      const data = await res.json();
      if (!data.url) throw new Error('Respuesta inválida del servidor de imágenes');
      const finalUrl = String(data.url || '').trim();
      if (!finalUrl) throw new Error('URL de imagen vacía');
      setImageUrl(finalUrl);
      notify({ type: 'success', title: 'Imagen subida', message: 'Soporte adjuntado correctamente' });
    } catch (err) {
      console.error(err);
      notify({ type: 'error', title: 'Error subida', message: 'No se pudo subir la imagen' });
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (loading) return;
    setError('');

    const amt = Number(amount);
    if (!amt || isNaN(amt) || amt <= 0) return setError('Monto inválido');
    if (!posName) return setError('Selecciona un punto de venta');
    if (!retiroTipo) return setError('Selecciona el tipo de retiro');
    if (isGastoOp && !imageUrl) return setError('Debes adjuntar imagen de soporte');

    const usuario = displayName || currentUser;

    try {
      setLoading(true);

      if (isGastoOp) {
        // Nuevo endpoint /api/gastos
        const payload = {
          local: posName,
          monto: amt,
          motivo: reason || 'Gasto Operativo', // Motivo obligatorio para gasto
          imagen_url: imageUrl,
          usuario
        };
        const r = await apiFetch('/api/gastos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || 'Error registrando gasto');
        }
        notify({ type: 'success', title: 'Gasto registrado', message: 'Se ha guardado el gasto correctamente' });
        // Navigate new view
        sessionStorage.removeItem('atm_caja_cache'); // Invalidate dashboard
        navigate('/gastos');
      } else {
        // Flujo normal /api/odoo/cashout
        const payload = { amount: amt, category_name: 'RETIRADA', pos_name: posName, reason: reason || 'RETIRO', usuario };
        if (categoriaId !== '') payload.categoria_id = Number(categoriaId);

        console.log('[CashoutPOS] Request POST cashout', { path: '/api/odoo/cashout', body: payload });
        const r = await apiFetch('/api/odoo/cashout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
          body: JSON.stringify(payload)
        });
        console.log('[CashoutPOS] Response POST cashout', { ok: r.ok, status: r.status, url: r.url, statusText: r.statusText });

        if (!r.ok) {
          let msg = 'No se pudo enviar la solicitud';
          try { const d = await r.json(); if (d?.error) msg = d.error; } catch { msg = await r.text().catch(() => msg) || msg; }
          // notify handled below or throw
          throw new Error(msg);
        }

        // leer cuerpo para evaluar ok en payload
        let data = null;
        try { data = await r.json(); } catch { }
        if (data && data.ok === false) {
          const msg = data.message || `Cashout rechazado por validación${amount ? ` (${formatCLP(amount)})` : ''}`;
          notify({ type: 'error', title: 'Cashout rechazado', message: msg });
          setError(msg);
          return;
        }

        // éxito
        notify({ type: 'success', title: 'Cashout enviado', message: (data && data.message) ? String(data.message) : `Solicitud enviada (${formatCLP(amount)})` });
        sessionStorage.removeItem('atm_caja_cache');
        sessionStorage.removeItem('atm_movs_cache');
        navigate('/movements');
      }

    } catch (e) {
      console.error('[CashoutPOS] Error POST cashout', e);
      setError(e.message || 'Error al solicitar retiro');
      if (!e.message && !isGastoOp) notify({ type: 'error', title: 'Cashout fallido', message: 'Error al solicitar retiro' });
    } finally {
      setLoading(false);
    }
  };

  if (serverOk === false) {
    return (
      <Layout title="Retirar efectivo en punto">
        <ServerDown onRetry={() => {
          setChecking(true);
          (async () => {
            const ok = await pingServer();
            setServerOk(ok);
            setChecking(false);
            if (ok) window.location.reload();
          })();
        }} />
      </Layout>
    );
  }

  return (
    <Layout title="Retirar efectivo en punto">
      <div className="flex-1 p-4 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] view-enter view-enter-active">
        <div id="cashout-form-top" className="max-w-lg mx-auto space-y-4">
          <header className="space-y-1">
            <p className="text-xs text-[var(--text-secondary-color)]">Flujo guiado · {totalSteps} pasos</p>
            <h1 className="text-xl font-semibold">Retiro de efectivo</h1>
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary-color)]">
              Paso {step} de {totalSteps}
            </div>
            <div className="flex gap-1 mt-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? 'bg-[var(--primary-color)]' : 'bg-white/10'}`}></span>
              ))}
            </div>
          </header>

          <section className="bg-[var(--card-color)] rounded-2xl p-4 border border-[var(--border-color)] space-y-4">
            {step === 1 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">1. Tipo de retiro</h3>
                  <span className="text-[11px] text-[var(--text-secondary-color)]">Selecciona una opción</span>
                </div>
                <div className="space-y-2">
                  {/* Grid for standard options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setRetiroTipo('caja'); setCategoriaId('16'); }}
                      className={`p-3 rounded-xl border text-left flex items-center gap-3 ${retiroTipo === 'caja' ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10 shadow-[0_10px_30px_-18px_var(--primary-color)]' : 'border-[var(--border-color)] hover:bg-white/5'}`}
                    >
                      <span className="material-symbols-outlined text-[var(--success-color)]" aria-hidden>trending_up</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">Retirada de caja</p>
                        <p className="text-[11px] text-[var(--text-secondary-color)]">Registra retiro y pasa a efectivo interno.</p>
                      </div>
                      {retiroTipo === 'caja' && <span className="material-symbols-outlined text-[var(--primary-color)]">check_circle</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRetiroTipo('cashout'); setCategoriaId(''); }}
                      className={`p-3 rounded-xl border text-left flex items-center gap-3 ${retiroTipo === 'cashout' ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10 shadow-[0_10px_30px_-18px_var(--primary-color)]' : 'border-[var(--border-color)] hover:bg-white/5'}`}
                    >
                      <span className="material-symbols-outlined text-[var(--text-secondary-color)]" aria-hidden>sell</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">Solo cashout</p>
                        <p className="text-[11px] text-[var(--text-secondary-color)]">Retiro rápido para gastos comunes.</p>
                      </div>
                      {retiroTipo === 'cashout' && <span className="material-symbols-outlined text-[var(--primary-color)]">check_circle</span>}
                    </button>
                  </div>

                  {/* Gasto Operativo Option */}
                  <button
                    type="button"
                    onClick={() => { setRetiroTipo('gasto_operativo'); setCategoriaId(''); }}
                    className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 ${retiroTipo === 'gasto_operativo' ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10 shadow-[0_10px_30px_-18px_var(--primary-color)]' : 'border-[var(--border-color)] hover:bg-white/5'}`}
                  >
                    <span className="material-symbols-outlined text-orange-400" aria-hidden>engineering</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Gasto Operativo</p>
                      <p className="text-[11px] text-[var(--text-secondary-color)]">Requiere imagen de soporte. Se guarda en historial de gastos.</p>
                    </div>
                    {retiroTipo === 'gasto_operativo' && <span className="material-symbols-outlined text-[var(--primary-color)]">check_circle</span>}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">2. Punto de venta</h3>
                  <span className="text-[11px] text-[var(--text-secondary-color)]">Saldo y estado en vivo</span>
                </div>
                {loadingCaja ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-10 rounded-xl bg-white/5" />
                    <div className="h-10 rounded-xl bg-white/5" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <ul className="flex flex-col gap-2">
                      {localesList.map((loc) => {
                        const disabled = loc.estado === 'cerrada';
                        const isSelected = posName === loc.value;
                        return (
                          <li key={loc.value}>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => { setPosName(loc.value); }}
                              className={`w-full p-3 rounded-xl border text-left flex flex-col gap-2 transition ${isSelected ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10 shadow-[0_10px_30px_-18px_var(--primary-color)]' : 'border-[var(--border-color)] hover:bg-white/5'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <div className="flex items-center justify-between pointer-events-none">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-full ${isSelected ? 'bg-[var(--primary-color)] text-white' : 'bg-white/5 text-[var(--text-secondary-color)]'}`}>
                                    <span className="material-symbols-outlined text-lg" aria-hidden>store</span>
                                  </div>
                                  <span className={`font-semibold text-sm ${isSelected ? 'text-[var(--primary-color)]' : 'text-white'}`}>{loc.label}</span>
                                </div>
                                <span className={`text-[10px] px-2.5 py-1 rounded-full border font-medium ${loc.estadoBadge}`}>{loc.estadoLabel}</span>
                              </div>
                              <div className="mt-3 pl-11 text-xs">
                                <div className={`rounded-lg p-2.5 flex items-center gap-3 border ${isSelected ? 'bg-[var(--primary-color)]/5 border-[var(--primary-color)]/20' : 'bg-white/[0.03] border-white/5'}`}>
                                  <span className="material-symbols-outlined text-sm text-[var(--text-secondary-color)]" aria-hidden>payments</span>
                                  <div>
                                    <p className="text-[10px] text-[var(--text-secondary-color)] uppercase tracking-wide">En caja</p>
                                    <p className="font-semibold text-sm">{formatCLP(loc.saldo)}</p>
                                  </div>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {(!localesList || localesList.length === 0) && (
                      <p className="text-xs text-[var(--text-secondary-color)]">No hay locales disponibles.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">3. Monto</h3>
                  <span className="text-[11px] text-[var(--text-secondary-color)]">Ingresa el valor</span>
                </div>
                <div className="space-y-4">
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="1"
                    step="1"
                    className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-[var(--primary-color)] focus:border-transparent transition-all"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0"
                    autoFocus
                  />
                  <p className="text-xs text-[var(--text-secondary-color)] ml-1">
                    {Number(amount) > 0 ? `Vista previa: ${formatCLP(amount)}` : 'Ingresa un monto mayor a 0'}
                  </p>
                  {selectedLocal && selectedLocal.estado === 'abierta' && selectedLocal.saldo > 0 && Number(amount) > selectedLocal.saldo && (
                    <div className="p-3 rounded-lg bg-[var(--danger-color)]/10 border border-[var(--danger-color)]/20 text-[var(--danger-color)] text-xs flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">warning</span>
                      El monto excede lo disponible en caja ({formatCLP(selectedLocal.saldo)}).
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">4. Motivo</h3>
                  <span className="text-[11px] text-[var(--text-secondary-color)]">{isGastoOp ? 'Obligatorio' : 'Opcional'}</span>
                </div>
                <input
                  className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={isGastoOp ? "Ej: Compra de insumos aseo" : "Retirada para gastos"}
                />
              </div>
            )}

            {step === 5 && isGastoOp && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">5. Soporte (Imagen)</h3>
                  <span className="text-[11px] text-[var(--text-secondary-color)]">Obligatorio</span>
                </div>
                <div className="p-4 border border-[var(--border-color)] border-dashed rounded-xl text-center space-y-3 hover:bg-white/5 transition-colors relative">
                  {imageUrl ? (
                    <div className="relative">
                      <img src={imageUrl} alt="Soporte" className="max-h-48 mx-auto rounded-lg" />
                      <button onClick={() => setImageUrl('')} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  ) : uploading ? (
                    <div className="py-8">
                      <span className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block mb-2"></span>
                      <p className="text-xs text-[var(--text-secondary-color)]">Subiendo imagen...</p>
                    </div>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]">cloud_upload</span>
                      <div className="text-sm">
                        <label htmlFor="file-upload" className="font-semibold text-[var(--primary-color)] cursor-pointer hover:underline">Sube un archivo</label>
                        <span className="text-[var(--text-secondary-color)]"> o arrastra aquí</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary-color)]">PNG, JPG hasta 10MB</p>
                      <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Step 5 or 6 (Confirm) */}
            {step === (isGastoOp ? 6 : 5) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{isGastoOp ? '6' : '5'}. Confirmación</h3>
                  <span className="text-[11px] text-[var(--text-secondary-color)]">Revisa antes de enviar</span>
                </div>
                <div className="space-y-1 text-sm bg-white/5 rounded-lg p-3">
                  <div className="flex justify-between gap-3"><span className="text-[var(--text-secondary-color)]">Tipo</span><span className="font-semibold">{retiroTipo.replace('_', ' ').toUpperCase()}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-[var(--text-secondary-color)]">Punto</span><span className="font-semibold">{posName || '—'}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-[var(--text-secondary-color)]">Monto</span><span className="font-semibold">{Number(amount) > 0 ? formatCLP(amount) : '—'}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-[var(--text-secondary-color)]">Motivo</span><span className="font-semibold text-right break-anywhere">{reason || '—'}</span></div>
                  {isGastoOp && (
                    <div className="flex justify-between gap-3 border-t border-white/10 pt-2 mt-2">
                      <span className="text-[var(--text-secondary-color)]">Soporte</span>
                      <span className="font-semibold text-[var(--success-color)] flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">image</span>
                        Adjunto
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={loading || !retiroTipo || !posName || !(Number(amount) > 0)}
                  className="w-full inline-flex justify-center items-center gap-2 px-4 py-3 rounded-lg bg-[#2563eb] text-white font-semibold disabled:opacity-60"
                  onClick={onSubmit}
                >
                  <span className="material-symbols-outlined !text-white">point_of_sale</span>
                  {loading ? 'Enviando…' : 'Solicitar retiro'}
                </button>
              </div>
            )}

            {/* Controles de navegación */}
            <div className="flex justify-between pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={prevStep}
                disabled={step === 1 || loading}
                className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={nextStep}
                disabled={
                  (step === 1 && !canStep2) ||
                  (step === 2 && !canStep3) ||
                  (step === 3 && !canStep4) ||
                  (step === 4 && !canStep5) ||
                  (step === 5 && isGastoOp && !canStep6) || // GastoOp needs Step 5 (Image) done to go to 6
                  step === (isGastoOp ? 6 : 5) || loading    // Max step check
                }
                className="px-3 py-2 rounded-lg bg-[var(--primary-color)]/20 border border-[var(--primary-color)]/60 text-sm font-semibold text-[var(--primary-color)] disabled:opacity-40"
              >
                {step < (isGastoOp ? 6 : 5) ? 'Continuar' : 'Continuar'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
