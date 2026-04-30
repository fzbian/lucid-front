import React, { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
// import Preloader from "../components/Preloader";
import ServerDown from "../components/ServerDown";
import { apiFetch, pingServer } from "../api";
import useTitle from "../useTitle";
import useTimeout from "../useTimeout";

function formatMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("es-CL") : String(n ?? "");
}

function monthStartEnd(yyyyMM) {
  const [y, m] = yyyyMM.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const toISO = (d) => d.toISOString().slice(0, 10);
  return { from: toISO(first), to: toISO(last) };
}

// Componente para mostrar montos con decimales más pequeños
function MoneySmallDecimals({ value, className }) {
  const v = Number(value);
  if (!Number.isFinite(v)) return <span className={className}>${String(value ?? '')}</span>;
  const fmt = new Intl.NumberFormat('es-CL', { useGrouping: true, minimumFractionDigits: 0, maximumFractionDigits: 3 });
  const parts = fmt.formatToParts(v);
  let sign = '';
  let intPart = '';
  let frac = '';
  for (const p of parts) {
    if (p.type === 'minusSign') sign = '-';
    if (p.type === 'integer' || p.type === 'group') intPart += p.value;
    if (p.type === 'fraction') frac = p.value;
  }
  return (
    <span className={`whitespace-nowrap leading-none ${className || ''}`}>
      ${sign}{intPart}{frac ? <span className="text-[0.6em] align-bottom">,{frac}</span> : null}
    </span>
  );
}

export default function Reports() {
  useTitle("Reportes · ATM Ricky Rich");
  const [serverOk, setServerOk] = useState(null);
  const [checking, setChecking] = useState(true);
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [mode, setMode] = useState("month");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [txs, setTxs] = useState([]);
  const [catMap, setCatMap] = useState({});
  const timedOutChecking = useTimeout(checking, 10000);
  const timedOutLoading = useTimeout(loading && serverOk === true, 10000);

  // Server health check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await pingServer();
      if (cancelled) return;
      setServerOk(ok);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load categories
  useEffect(() => {
    if (serverOk !== true) return;
    let ignore = false;
    apiFetch("/api/categorias")
      .then((r) => {
        if (!r.ok) throw new Error("Error al obtener categorías");
        return r.json();
      })
      .then((data) => {
        if (ignore) return;
        const arr = Array.isArray(data) ? data : [];
        const map = arr.reduce((acc, c) => {
          acc[c.id] = { nombre: c.nombre, tipo: c.tipo };
          return acc;
        }, {});
        setCatMap(map);
      })
      .catch(() => { });
    return () => { ignore = true; };
  }, [serverOk]);

  // Load transactions for selected period
  useEffect(() => {
    if (serverOk !== true) return;
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError("");
    let ignore = false;
    apiFetch(`/api/transacciones?from=${fromDate}&to=${toDate}`)
      .then((r) => {
        if (!r.ok) throw new Error("Error al obtener transacciones");
        return r.json();
      })
      .then((data) => {
        if (ignore) return;
        const arr = Array.isArray(data) ? data : [];
        const withTipo = arr.map((t) => ({
          ...t,
          tipo: catMap[t.categoria_id]?.tipo || null,
        }));
        setTxs(withTipo);
        setLoading(false);
      })
      .catch((e) => {
        if (ignore) return;
        setError(e.message || "Error");
        setLoading(false);
      });
    return () => { ignore = true; };
  }, [fromDate, toDate, catMap, serverOk]);

  // Sync month -> from/to
  useEffect(() => {
    if (mode !== "month") return;
    const { from, to } = monthStartEnd(month);
    setFromDate(from);
    setToDate(to);
  }, [month, mode]);

  // Ensure defaults in range mode
  useEffect(() => {
    if (mode !== "range") return;
    if (!fromDate || !toDate) {
      const now = new Date();
      const to = now.toISOString().slice(0, 10);
      const past = new Date(now);
      past.setDate(now.getDate() - 29);
      const from = past.toISOString().slice(0, 10);
      setFromDate(from);
      setToDate(to);
    }
  }, [mode, fromDate, toDate]);

  // Helpers: month label and change month
  const monthLabel = useMemo(() => {
    try {
      const [y, m] = month.split("-").map(Number);
      const d = new Date(y, (m || 1) - 1, 1);
      return d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    } catch {
      return month;
    }
  }, [month]);

  const changeMonth = (delta) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    d.setMonth(d.getMonth() + delta);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMonth(next);
  };

  const applyPreset = (preset) => {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    if (preset === "7d") {
      const past = new Date(now);
      past.setDate(now.getDate() - 6);
      setMode("range");
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(to);
    } else if (preset === "30d") {
      const past = new Date(now);
      past.setDate(now.getDate() - 29);
      setMode("range");
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(to);
    } else if (preset === "ytd") {
      const jan1 = new Date(now.getFullYear(), 0, 1);
      setMode("range");
      setFromDate(jan1.toISOString().slice(0, 10));
      setToDate(to);
    } else if (preset === "thisMonth") {
      const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      setMode("month");
      setMonth(m);
    }
  };

  const { ingresos, egresos, neto, count } = useMemo(() => {
    let inc = 0, out = 0, c = 0;
    for (const t of txs) {
      if (!t) continue;
      c++;
      if (t.tipo === "INGRESO") inc += Number(t.monto) || 0;
      else if (t.tipo === "EGRESO") out += Number(t.monto) || 0;
    }
    return { ingresos: inc, egresos: out, neto: inc - out, count: c };
  }, [txs]);

  const daily = useMemo(() => {
    const map = {};
    for (const t of txs) {
      const day = t?.fecha ? new Date(t.fecha).toISOString().slice(0, 10) : "";
      if (!day) continue;
      if (!map[day]) map[day] = { ingresos: 0, egresos: 0 };
      if (t.tipo === "INGRESO") map[day].ingresos += Number(t.monto) || 0;
      else if (t.tipo === "EGRESO") map[day].egresos += Number(t.monto) || 0;
    }
    const arr = Object.entries(map)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .map(([day, v]) => ({ day, ...v, neto: v.ingresos - v.egresos }));
    const max = arr.reduce((m, d) => Math.max(m, d.ingresos, d.egresos, Math.abs(d.neto)), 0) || 1;
    return { rows: arr, max };
  }, [txs]);

  // Desglose por categoría (ingresos/egresos) con totales y porcentajes
  const byCat = useMemo(() => {
    const incMap = {}, outMap = {}, incCount = {}, outCount = {};
    for (const t of txs) {
      const cid = t.categoria_id;
      const amt = Number(t.monto) || 0;
      if (t.tipo === "INGRESO") {
        incMap[cid] = (incMap[cid] || 0) + amt;
        incCount[cid] = (incCount[cid] || 0) + 1;
      } else if (t.tipo === "EGRESO") {
        outMap[cid] = (outMap[cid] || 0) + amt;
        outCount[cid] = (outCount[cid] || 0) + 1;
      }
    }
    const toArr = (m, c) => Object.entries(m)
      .map(([cid, total]) => ({
        categoria_id: Number(cid),
        nombre: catMap[cid]?.nombre || `Cat #${cid}`,
        total,
        count: c[Number(cid)] || 0,
      }))
      .sort((a, b) => b.total - a.total);
    const ingresosArr = toArr(incMap, incCount);
    const egresosArr = toArr(outMap, outCount);
    const sumInc = ingresosArr.reduce((s, x) => s + x.total, 0) || 1;
    const sumOut = egresosArr.reduce((s, x) => s + x.total, 0) || 1;
    return {
      ingresos: ingresosArr.map((x) => ({ ...x, pct: (x.total / sumInc) * 100 })),
      egresos: egresosArr.map((x) => ({ ...x, pct: (x.total / sumOut) * 100 })),
      sumInc,
      sumOut,
    };
  }, [txs, catMap]);

  // KPIs adicionales calculados a partir del rango seleccionado
  const extra = useMemo(() => {
    const parse = (s) => (s ? new Date(s) : null);
    const A = parse(fromDate);
    const B = parse(toDate);
    const days = A && B ? Math.max(1, Math.round((B - A) / (1000 * 60 * 60 * 24)) + 1) : 1;
    const avgIncDay = ingresos / days;
    const avgOutDay = egresos / days;
    const ratioOutInc = ingresos > 0 ? (egresos / ingresos) * 100 : 0;
    const ticketProm = count > 0 ? (ingresos + egresos) / count : 0;
    // Día pico de ingresos/egresos
    let peakInc = { day: null, value: 0 };
    let peakOut = { day: null, value: 0 };
    for (const d of daily.rows) {
      if (d.ingresos > peakInc.value) peakInc = { day: d.day, value: d.ingresos };
      if (d.egresos > peakOut.value) peakOut = { day: d.day, value: d.egresos };
    }
    return { days, avgIncDay, avgOutDay, ratioOutInc, ticketProm, peakInc, peakOut };
  }, [fromDate, toDate, ingresos, egresos, count, daily.rows]);

  return (
    <Layout title="Reportes">
      {timedOutChecking ? (
        <ServerDown onRetry={async () => {
          setChecking(true);
          const ok = await pingServer();
          setServerOk(ok);
          setChecking(false);
        }} />
      ) : checking ? (
        <div className="space-y-6 view-enter view-enter-active">
          <section className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4 animate-pulse">
            <div className="h-4 w-32 bg-white/10 rounded mb-3" />
            <div className="h-24 w-full bg-white/10 rounded" />
          </section>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4 animate-pulse">
                <div className="h-3 w-20 bg-white/10 rounded mb-2" />
                <div className="h-6 w-24 bg-white/10 rounded" />
              </div>
            ))}
          </section>
        </div>
      ) : serverOk === false ? (
        <ServerDown onRetry={async () => {
          setChecking(true);
          const ok = await pingServer();
          setServerOk(ok);
          setChecking(false);
        }} />
      ) : (
        <div className="space-y-6 view-enter view-enter-active">
          {/* Selector de periodo */}
          <section className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--text-secondary-color)]">calendar_month</span>
                <h3 className="font-semibold">Periodo</h3>
              </div>
              <div className="inline-flex items-center rounded-full border border-[var(--border-color)] bg-[var(--dark-color)] p-1">
                <button
                  className={`px-4 py-1.5 rounded-full text-sm transition ${mode === 'month' ? 'bg-[var(--primary-color)] text-white' : 'text-[var(--text-secondary-color)] hover:text-white'}`}
                  aria-pressed={mode === 'month'}
                  onClick={() => setMode('month')}
                >
                  Mes
                </button>
                <button
                  className={`px-4 py-1.5 rounded-full text-sm transition ${mode === 'range' ? 'bg-[var(--primary-color)] text-white' : 'text-[var(--text-secondary-color)] hover:text-white'}`}
                  aria-pressed={mode === 'range'}
                  onClick={() => setMode('range')}
                >
                  Rango
                </button>
              </div>

              {mode === 'month' ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center justify-center gap-2">
                    <button className="px-3 py-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5" onClick={() => changeMonth(-1)} aria-label="Mes anterior">
                      <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <div className="text-center text-sm">
                      <p className="font-semibold capitalize">{monthLabel}</p>
                      <p className="text-[var(--text-secondary-color)]">Reporte mensual</p>
                    </div>
                    <button className="px-3 py-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5" onClick={() => changeMonth(1)} aria-label="Mes siguiente">
                      <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <input
                      type="month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      className="bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                      aria-label="Seleccionar mes"
                    />
                    <button className="px-3 py-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5 text-sm" onClick={() => setMonth(defaultMonth)}>Este mes</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--text-secondary-color)]" htmlFor="fromDate">Desde</label>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--text-secondary-color)]">event</span>
                        <input
                          id="fromDate"
                          type="date"
                          value={fromDate}
                          max={toDate || undefined}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFromDate(v);
                            if (toDate && v > toDate) setToDate(v);
                          }}
                          className="flex-1 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--text-secondary-color)]" htmlFor="toDate">Hasta</label>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--text-secondary-color)]">event_available</span>
                        <input
                          id="toDate"
                          type="date"
                          value={toDate}
                          min={fromDate || undefined}
                          onChange={(e) => {
                            const v = e.target.value;
                            setToDate(v);
                            if (fromDate && v < fromDate) setFromDate(v);
                          }}
                          className="flex-1 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button onClick={() => applyPreset('7d')} className="px-3 py-1.5 rounded-full border border-[var(--border-color)] text-xs hover:bg-white/5">Últimos 7 días</button>
                    <button onClick={() => applyPreset('30d')} className="px-3 py-1.5 rounded-full border border-[var(--border-color)] text-xs hover:bg-white/5">Últimos 30 días</button>
                    <button onClick={() => applyPreset('ytd')} className="px-3 py-1.5 rounded-full border border-[var(--border-color)] text-xs hover:bg-white/5">YTD</button>
                    <button onClick={() => applyPreset('thisMonth')} className="px-3 py-1.5 rounded-full border border-[var(--border-color)] text-xs hover:bg-white/5">Este mes</button>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary-color)]">Los reportes se actualizan automáticamente al cambiar el periodo.</p>
                </div>
              )}
            </div>
          </section>

          {/* KPIs */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {loading ? (
              timedOutLoading ? (
                <ul className="space-y-2">
                  <li><ServerDown onRetry={() => {
                    // retrigger current load
                    setLoading(true);
                    setError("");
                    const { from, to } = mode === 'month' ? monthStartEnd(month) : { from: fromDate, to: toDate };
                    setFromDate(from);
                    setToDate(to);
                  }} /></li>
                </ul>
              ) : (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4 animate-pulse">
                    <div className="h-3 w-20 bg-white/10 rounded mb-2" />
                    <div className="h-6 w-24 bg-white/10 rounded" />
                  </div>
                ))
              )
            ) : (
              <>
                <div className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
                  <p className="text-xs text-[var(--text-secondary-color)]">Ingresos</p>
                  <p className="mt-1 text-xl font-bold text-[var(--success-color)]">${formatMoney(ingresos)}</p>
                </div>
                <div className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
                  <p className="text-xs text-[var(--text-secondary-color)]">Egresos</p>
                  <p className="mt-1 text-xl font-bold text-[var(--danger-color)]">${formatMoney(egresos)}</p>
                </div>
                <div className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
                  <p className="text-xs text-[var(--text-secondary-color)]">Neto</p>
                  <p className="mt-1 text-xl font-bold">${formatMoney(neto)}</p>
                </div>
                <div className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
                  <p className="text-xs text-[var(--text-secondary-color)]">Movimientos</p>
                  <p className="mt-1 text-xl font-bold">{count}</p>
                </div>
              </>
            )}
          </section>

          {/* Evolución diaria */}
          <section className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined">calendar_month</span> Evolución diaria
            </h3>
            {loading ? (
              timedOutLoading ? (
                <ServerDown onRetry={() => {
                  setLoading(true);
                  setError("");
                  const { from, to } = mode === 'month' ? monthStartEnd(month) : { from: fromDate, to: toDate };
                  setFromDate(from);
                  setToDate(to);
                }} />
              ) : (
                <ul className="space-y-2 animate-pulse">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i}>
                      <div className="flex items-center justify-between text-xs">
                        <div className="h-3 w-16 bg-white/10 rounded" />
                        <div className="h-3 w-24 bg-white/10 rounded" />
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <div className="h-2 rounded bg-white/10" />
                        <div className="h-2 rounded bg-white/10" />
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : error ? (
              <p className="text-red-500">{error}</p>
            ) : daily.rows.length === 0 ? (
              <p className="text-[var(--text-secondary-color)]">Sin datos para este mes.</p>
            ) : (
              <ul className="space-y-2">
                {daily.rows.map((d) => {
                  const dayLabel = new Date(d.day).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short" });
                  const incPct = Math.min(100, Math.round((d.ingresos / daily.max) * 100));
                  const outPct = Math.min(100, Math.round((d.egresos / daily.max) * 100));
                  return (
                    <li key={d.day} className="">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary-color)]">{dayLabel}</span>
                        <span className="text-[var(--text-secondary-color)]">Neto: ${formatMoney(d.neto)}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-2 items-center">
                        <div className="h-2 rounded bg-green-900/30 overflow-hidden" title={`Ingresos $${formatMoney(d.ingresos)}`}>
                          <div className="h-full bg-[var(--success-color)]" style={{ width: `${incPct}%` }} />
                        </div>
                        <div className="h-2 rounded bg-red-900/30 overflow-hidden" title={`Egresos $${formatMoney(d.egresos)}`}>
                          <div className="h-full bg-[var(--danger-color)]" style={{ width: `${outPct}%` }} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* KPIs avanzados */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {loading ? (
              timedOutLoading ? (
                <ul className="space-y-2">
                  <li><ServerDown onRetry={() => {
                    setLoading(true);
                    setError("");
                    const { from, to } = mode === 'month' ? monthStartEnd(month) : { from: fromDate, to: toDate };
                    setFromDate(from);
                    setToDate(to);
                  }} /></li>
                </ul>
              ) : (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4 animate-pulse">
                    <div className="h-3 w-24 bg-white/10 rounded mb-2" />
                    <div className="h-6 w-20 bg-white/10 rounded" />
                  </div>
                ))
              )
            ) : (
              <>
                <div className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
                  <p className="text-xs text-[var(--text-secondary-color)]">Promedio diario ingresos</p>
                  <MoneySmallDecimals value={extra.avgIncDay} className="mt-1 text-lg font-semibold text-[var(--success-color)] inline-block" />
                </div>
                <div className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
                  <p className="text-xs text-[var(--text-secondary-color)]">Promedio diario egresos</p>
                  <MoneySmallDecimals value={extra.avgOutDay} className="mt-1 text-lg font-semibold text-[var(--danger-color)] inline-block" />
                </div>
                <div className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
                  <p className="text-xs text-[var(--text-secondary-color)]">Ratio egresos/ingresos</p>
                  <p className="mt-1 text-lg font-semibold">{extra.ratioOutInc.toFixed(1)}%</p>
                </div>
                <div className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
                  <p className="text-xs text-[var(--text-secondary-color)]">Ticket promedio</p>
                  <MoneySmallDecimals value={extra.ticketProm} className="mt-1 text-lg font-semibold inline-block" />
                </div>
              </>
            )}
          </section>

          {/* Desglose por categoría */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[{ key: 'ingresos', title: 'Ingresos por categoría', color: 'var(--success-color)' }, { key: 'egresos', title: 'Egresos por categoría', color: 'var(--danger-color)' }].map(({ key, title, color }) => {
              const list = byCat[key] || [];
              return (
                <div key={key} className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined">pie_chart</span> {title}
                  </h3>
                  {loading ? (
                    timedOutLoading ? (
                      <ul className="space-y-2"><li><ServerDown onRetry={() => {
                        setLoading(true);
                        setError("");
                        const { from, to } = mode === 'month' ? monthStartEnd(month) : { from: fromDate, to: toDate };
                        setFromDate(from);
                        setToDate(to);
                      }} /></li></ul>
                    ) : (
                      <ul className="space-y-2 animate-pulse">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <li key={i}>
                            <div className="h-3 w-24 bg-white/10 rounded mb-1" />
                            <div className="h-2 w-full bg-white/10 rounded" />
                          </li>
                        ))}
                      </ul>
                    )
                  ) : list.length === 0 ? (
                    <p className="text-[var(--text-secondary-color)]">Sin datos para este periodo.</p>
                  ) : (
                    <ul className="space-y-3">
                      {list.slice(0, 6).map((c) => (
                        <li key={c.categoria_id}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="truncate pr-2">{c.nombre}</span>
                            <span className="text-[var(--text-secondary-color)]">{c.pct.toFixed(1)}% · {c.count} mov</span>
                          </div>
                          <div className="h-2 rounded bg-white/10 overflow-hidden" title={`$${formatMoney(c.total)}`}>
                            <div className="h-full" style={{ width: `${Math.min(100, c.pct)}%`, background: color }} />
                          </div>
                          <div className="mt-1 text-[10px] text-[var(--text-secondary-color)]">${formatMoney(c.total)}</div>
                        </li>
                      ))}
                      {list.length > 6 && (
                        <li className="text-[10px] text-[var(--text-secondary-color)]">+ {list.length - 6} categorías más</li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      )}
    </Layout>
  );
}
