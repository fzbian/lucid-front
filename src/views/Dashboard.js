import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import ServerDown from "../components/ServerDown";
import { apiFetch, pingServer, fetchCategorias } from "../api";
import { formatCLP } from "../formatMoney";
import { getSession, getUsers, getSessionUsername } from "../auth";
import useTitle from "../useTitle";
import { formatDateTimeCO } from "../dateFormat";
import useTimeout from "../useTimeout";

// Helper para agrupar movimientos por fecha (Hoy, Ayer, fecha completa)
function groupTransactionsByDate(movs) {
  const groups = {};
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const isSameDay = (d1, d2) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

  movs.forEach(m => {
    const d = new Date(m.fecha);
    let key;
    if (isSameDay(d, today)) key = 'Hoy';
    else if (isSameDay(d, yesterday)) key = 'Ayer';
    else {
      // Formato "Jueves 12 Ene"
      const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic'];
      key = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });
  return groups;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [caja, setCaja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [movs, setMovs] = useState([]);
  const [loadingMovs, setLoadingMovs] = useState(true);
  const [errorMovs, setErrorMovs] = useState(null);
  const [catMap, setCatMap] = useState({});
  const [displayName, setDisplayName] = useState("");
  const [showSaldoTotal, setShowSaldoTotal] = useState(true);
  const [showLocales, setShowLocales] = useState(true);
  const [serverOk, setServerOk] = useState(null);
  const [checking, setChecking] = useState(true);
  const [nowCo] = useState(new Date());
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Buenas noches' : hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  useTitle("Dashboard · ATM Ricky Rich");

  // Derivados de caja para locales (se recalculan en render)
  const localesList = caja?.locales ? Object.entries(caja.locales) : [];
  const totalLocalesSaldo = typeof caja?.total_locales === 'number'
    ? caja.total_locales
    : localesList.reduce((acc, [, l]) => acc + (Number(l?.saldo_en_caja) || 0), 0);
  const totalLocalesVendido = localesList.reduce((acc, [, l]) => acc + (Number(l?.vendido) || 0), 0);

  const timedOutChecking = useTimeout(checking, 10000);
  const timedOutCaja = useTimeout(loading && serverOk === true, 10000);
  const timedOutMovs = useTimeout(loadingMovs && serverOk === true, 10000);

  const reloadCaja = async () => {
    setLoading(true);
    setError(null);
    try {
      const resCaja = await apiFetch("/api/caja");
      if (!resCaja.ok) throw new Error("Error al obtener saldo");
      const dataCaja = await resCaja.json();
      console.log('[api/caja] reload', dataCaja);
      setCaja(dataCaja);
      sessionStorage.setItem('atm_caja_cache', JSON.stringify(dataCaja));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reloadMovs = async () => {
    setLoadingMovs(true);
    setErrorMovs(null);
    try {
      const resMovs = await apiFetch("/api/transacciones?limit=10");
      if (!resMovs.ok) throw new Error("Error al obtener movimientos");
      const dataMovs = await resMovs.json();
      const arr = Array.isArray(dataMovs) ? dataMovs : [];
      const sorted = arr.filter((m) => m && m.fecha).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      setMovs(sorted);
      sessionStorage.setItem('atm_movs_cache', JSON.stringify(sorted));
    } catch (err) {
      setErrorMovs(err.message);
    } finally {
      setLoadingMovs(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Cargar displayName del usuario autenticado
        try {
          const s = getSession();
          if (s?.displayName) {
            setDisplayName(s.displayName);
          } else {
            const username = getSessionUsername();
            if (username) {
              const users = await getUsers();
              if (cancelled) return;
              const u = users.find((x) => x.username === username);
              setDisplayName(u?.name || u?.displayName || username || "");
            }
          }
        } catch { }

        // Health check primero
        const ok = await pingServer();
        if (cancelled) return;
        setServerOk(ok);
        if (!ok) return;

        // Intentar carga desde caché para mostrar datos instantáneamente
        const cachedCaja = sessionStorage.getItem('atm_caja_cache');
        const cachedMovs = sessionStorage.getItem('atm_movs_cache');

        if (cachedCaja) {
          try {
            setCaja(JSON.parse(cachedCaja));
            setLoading(false);
          } catch { }
        }

        if (cachedMovs) {
          try {
            setMovs(JSON.parse(cachedMovs));
            setLoadingMovs(false);
          } catch { }
        }

        // Cargar caja, movimientos y categorías en PARALELO
        const [cajaResult, movsResult, catsResult] = await Promise.allSettled([
          apiFetch("/api/caja").then(async (r) => {
            if (!r.ok) throw new Error("Error al obtener saldo");
            return r.json();
          }),
          apiFetch("/api/transacciones?limit=10").then(async (r) => {
            if (!r.ok) throw new Error("Error al obtener movimientos");
            return r.json();
          }),
          fetchCategorias(),
        ]);

        if (cancelled) return;

        // Procesar caja
        if (cajaResult.status === 'fulfilled') {
          setCaja(cajaResult.value);
          sessionStorage.setItem('atm_caja_cache', JSON.stringify(cajaResult.value));
        } else {
          setError(cajaResult.reason?.message || 'Error caja');
        }
        setLoading(false);

        // Procesar movimientos
        if (movsResult.status === 'fulfilled') {
          const arr = Array.isArray(movsResult.value) ? movsResult.value : [];
          const sorted = arr.filter((m) => m && m.fecha).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
          setMovs(sorted);
          sessionStorage.setItem('atm_movs_cache', JSON.stringify(sorted));
        } else {
          setErrorMovs(movsResult.reason?.message || 'Error movimientos');
        }
        setLoadingMovs(false);

        // Procesar categorías
        if (catsResult.status === 'fulfilled') {
          const arr = Array.isArray(catsResult.value) ? catsResult.value : [];
          const map = arr.reduce((acc, c) => {
            acc[c.id] = { nombre: c.nombre, tipo: c.tipo };
            return acc;
          }, {});
          setCatMap(map);
        }

      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  // Render
  if (timedOutChecking) {
    return (
      <Layout>
        <ServerDown onRetry={async () => {
          setChecking(true);
          const ok = await pingServer();
          setServerOk(ok);
          setChecking(false);
          reloadCaja();
          reloadMovs();
        }} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 view-enter view-enter-active">

        {/* Saludo y Update */}
        <section className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight">{displayName ? `${greeting}, ${displayName}` : greeting}</h2>
            <p className="text-sm text-[var(--text-secondary-color)]">
              {nowCo.toLocaleString("es-CO", {
                timeZone: "America/Bogota",
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <button
            onClick={() => {
              reloadCaja();
              reloadMovs();
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--card-color)] border border-[var(--border-color)] text-[var(--text-secondary-color)] hover:text-[var(--primary-color)] hover:border-[var(--primary-color)] active:scale-95 transition-all text-xs font-medium shadow-sm"
          >
            <span className={`material-symbols-outlined text-lg ${(loading || loadingMovs) ? 'animate-spin' : ''}`}>sync</span>
            Actualizar
          </button>
        </section>

        {/* Tarjeta principal: Saldo Total */}
        <section className="bg-gradient-to-br from-[var(--primary-color)] to-[var(--primary-color)]/80 text-white rounded-2xl p-4 sm:p-5 border border-white/10 shadow relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined !text-3xl" aria-hidden>savings</span>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/70">Saldo total</p>
                <p className="text-3xl font-extrabold leading-tight">
                  {showSaldoTotal ? (
                    <span
                      onClick={() => {
                        if (caja?.saldo_total) {
                          navigator.clipboard.writeText(Math.round(caja.saldo_total).toString());
                        }
                      }}
                      className="cursor-pointer hover:opacity-80 active:scale-95 transition-all inline-block"
                      title="Clic para copiar"
                    >
                      {formatCLP(caja?.saldo_total)}
                    </span>
                  ) : '••••••'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSaldoTotal(v => !v)}
              className="p-2 rounded-lg hover:bg-white/10"
            >
              <span className="material-symbols-outlined">{showSaldoTotal ? 'visibility' : 'visibility_off'}</span>
            </button>
          </div>

          {loading || checking ? (
            timedOutCaja ? (
              <ServerDown onRetry={reloadCaja} />
            ) : (
              <div className="animate-pulse space-y-3 mt-3">
                <div className="h-8 w-40 bg-white/20 rounded" />
                <div className="h-4 w-32 bg-white/15 rounded" />
              </div>
            )
          ) : error ? (
            <p className="mt-3 text-red-100">{error}</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-white/10 border border-white/20 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/80">
                  <span className="material-symbols-outlined text-lg" aria-hidden>payments</span>
                  <span>Efectivo</span>
                </div>
                <span className="font-semibold">{showSaldoTotal ? formatCLP(caja?.saldo_caja) : '••••••'}</span>
              </div>
              <div className="rounded-xl bg-white/10 border border-white/20 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/80">
                  <span className="material-symbols-outlined text-lg" aria-hidden>account_balance</span>
                  <span>Cuenta</span>
                </div>
                <span className="font-semibold">{showSaldoTotal ? formatCLP(caja?.saldo_caja2) : '••••••'}</span>
              </div>
            </div>
          )}

          {caja?.ultima_actualizacion && (
            <p className="mt-3 text-[11px] text-white/80 flex items-center gap-1">
              <span className="material-symbols-outlined text-base" aria-hidden>schedule</span>
              Actualizado: {formatDateTimeCO(caja.ultima_actualizacion)}
            </p>
          )}
        </section>

        {/* Acciones Rápidas */}
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-xl" aria-hidden>bolt</span>
            Acciones rápidas
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/new?tipo=INGRESO')}
              className="bg-[var(--card-color)] p-3 rounded-xl border border-[var(--border-color)] flex items-center justify-center gap-3 hover:bg-[var(--border-color)] transition-colors shadow-sm"
            >
              <div className="p-1.5 rounded-full bg-[var(--success-color)]/20 text-[var(--success-color)]">
                <span className="material-symbols-outlined text-lg">arrow_upward</span>
              </div>
              <span className="font-semibold text-sm">Ingreso</span>
            </button>
            <button
              onClick={() => navigate('/new?tipo=EGRESO')}
              className="bg-[var(--card-color)] p-3 rounded-xl border border-[var(--border-color)] flex items-center justify-center gap-3 hover:bg-[var(--border-color)] transition-colors shadow-sm"
            >
              <div className="p-1.5 rounded-full bg-[var(--danger-color)]/20 text-[var(--danger-color)]">
                <span className="material-symbols-outlined text-lg">arrow_downward</span>
              </div>
              <span className="font-semibold text-sm">Egreso</span>
            </button>
            <button
              onClick={() => navigate('/cashout-bank')}
              className="col-span-2 bg-[var(--card-color)] p-3 rounded-xl border border-[var(--border-color)] flex items-center justify-center gap-3 hover:bg-[var(--border-color)] transition-colors shadow-sm"
            >
              <div className="p-1.5 rounded-full bg-blue-500/20 text-blue-400">
                <span className="material-symbols-outlined text-lg">account_balance</span>
              </div>
              <span className="font-semibold text-sm">Retirar dinero de banco</span>
            </button>
          </div>
        </section>

        {/* Locales */}
        <section className="bg-[var(--card-color)] rounded-2xl p-4 border border-[var(--border-color)] shadow">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="material-symbols-outlined" aria-hidden>storefront</span>
              Locales
            </h2>
            <button
              type="button"
              onClick={() => setShowLocales(v => !v)}
              className="p-2 rounded-lg hover:bg-white/5"
            >
              <span className="material-symbols-outlined">{showLocales ? 'visibility' : 'visibility_off'}</span>
            </button>
          </div>

          {loading || checking ? (
            timedOutCaja ? <ServerDown onRetry={reloadCaja} /> : (
              <div className="grid grid-cols-2 gap-2 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-[var(--dark-color)] rounded-xl p-3 border border-[var(--border-color)]">
                    <div className="h-4 w-24 bg-white/10 rounded mb-2" />
                    <div className="h-3 w-20 bg-white/10 rounded" />
                  </div>
                ))}
              </div>
            )
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : (
            <div className="space-y-3">
              <ul className="flex flex-col gap-2">
                {localesList.map(([nombre, info]) => {
                  const nombreFormateado = nombre.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                  const saldo = Number(info?.saldo_en_caja) || 0;
                  const vendido = Number(info?.vendido) || 0;
                  const estado = (info?.estado_sesion || '').toLowerCase();
                  const estadoBadge = estado === 'abierta' ? 'border-green-500/40 bg-green-500/10 text-green-200' : 'border-white/15 bg-white/5 text-white/70';

                  return (
                    <li key={nombre} className="bg-[var(--dark-color)] rounded-xl p-3 border border-[var(--border-color)] text-sm flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined !text-base">store</span>
                          {nombreFormateado}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${estadoBadge}`}>
                          {estado ? estado.charAt(0).toUpperCase() + estado.slice(1) : '—'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[13px] text-[var(--text-secondary-color)]">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 flex flex-col gap-1">
                          <span>En caja</span>
                          <span className="font-semibold text-white/90 text-sm">{showLocales ? formatCLP(saldo) : '••••••'}</span>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 flex flex-col gap-1">
                          <span>Vendido</span>
                          <span className={`font-semibold text-sm ${estado === 'cerrada' ? 'text-white/60' : 'text-white/90'}`}>
                            {estado === 'cerrada' ? 'No disponible' : (showLocales ? formatCLP(vendido) : '••••••')}
                          </span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/5">
                        <button
                          onClick={() => estado === 'abierta' && navigate(`/cashout?pos=${encodeURIComponent(nombreFormateado)}`)}
                          disabled={estado !== 'abierta'}
                          className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors ${estado === 'abierta'
                            ? 'bg-white/5 hover:bg-white/10 border border-white/5 text-[var(--primary-color)]'
                            : 'bg-white/5 border border-white/5 text-white/30 cursor-not-allowed opacity-50'
                            }`}
                        >
                          <span className="material-symbols-outlined text-base">point_of_sale</span>
                          Hacer retirada
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
                  <span className="text-[var(--text-secondary-color)]">Total en cajas</span>
                  <span className="font-semibold">{showLocales ? formatCLP(totalLocalesSaldo) : '••••••'}</span>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
                  <span className="text-[var(--text-secondary-color)]">Total vendido</span>
                  <span className="font-semibold">{showLocales ? formatCLP(totalLocalesVendido) : '••••••'}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Movimientos */}
        <section className="bg-[var(--card-color)] rounded-lg p-4 border border-[var(--border-color)] shadow">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined">receipt_long</span>
            Movimientos
          </h2>
          {loadingMovs || checking ? (
            timedOutMovs ? <ServerDown onRetry={reloadMovs} /> : (
              <ul className="space-y-4 animate-pulse">
                {[1, 2, 3].map(i => <li key={i} className="flex gap-3"><div className="h-10 w-10 bg-white/10 rounded-full" /><div className="h-4 w-3/4 bg-white/10 rounded" /></li>)}
              </ul>
            )
          ) : errorMovs ? (
            <p className="text-red-600">{errorMovs}</p>
          ) : movs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[var(--text-secondary-color)] mb-4">No hay movimientos recientes</p>
              <button onClick={() => navigate('/new')} className="px-4 py-2 bg-[var(--primary-color)] text-white rounded-lg">Registrar</button>
            </div>
          ) : (
            <div className="space-y-1">
              {Object.entries(groupTransactionsByDate(movs)).map(([label, groupMovs]) => (
                <div key={label} className="pb-2">
                  <h3 className="text-xs font-bold text-[var(--text-secondary-color)] uppercase tracking-wider mb-2 mt-2 px-1">{label}</h3>
                  <ul className="divide-y divide-[var(--border-color)]">
                    {groupMovs.map(m => {
                      const tipo = catMap[m.categoria_id]?.tipo;
                      const isIngreso = tipo === 'INGRESO';
                      const colorClass = isIngreso ? 'text-[var(--success-color)]' : tipo === 'EGRESO' ? 'text-[var(--danger-color)]' : 'text-[var(--text-secondary-color)]';
                      const amt = typeof m.monto === 'number' ? m.monto.toLocaleString('es-CL') : m.monto;

                      return (
                        <li key={m.id} className="py-3 px-1 flex items-center justify-between hover:bg-white/[0.02] rounded-lg -mx-1">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className={`p-2 rounded-full flex-shrink-0 ${isIngreso ? 'bg-[var(--success-color)]/10' : 'bg-[var(--danger-color)]/10'}`}>
                              <span className={`material-symbols-outlined text-xl ${colorClass}`}>
                                {isIngreso ? 'arrow_downward' : 'arrow_upward'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate text-sm">{m.descripcion}</p>
                              <p className="text-xs text-[var(--text-secondary-color)] truncate">
                                {catMap[m.categoria_id]?.nombre || 'Sin categoría'} • {new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right whitespace-nowrap pl-3">
                            <p className={`font-bold ${colorClass}`}>
                              {isIngreso ? '+' : '-'}{amt}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </Layout>
  );
}
