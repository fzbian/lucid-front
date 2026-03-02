import React, { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
// import Preloader from "../components/Preloader";
import ServerDown from "../components/ServerDown";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch, pingServer, fetchCategorias } from "../api";
import { getUsers, getSessionUsername } from "../auth";
import { notifyMutation } from "../mutations";
import useTitle from "../useTitle";
import { formatDateTimeCOAbbr, getYMDKeyCO, getTodayYMDKeyCO, getYesterdayYMDKeyCO, formatDateFromYMDKeyCO } from "../dateFormat";
import useTimeout from "../useTimeout";
import { useNotifications } from "../components/Notifications";
import { formatCLP } from "../formatMoney";

export default function Movements() {
  useTitle("Movimientos · ATM Ricky Rich");
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useNotifications();

  // Estado de servidor
  const [serverOk, setServerOk] = useState(null);
  const [checking, setChecking] = useState(true);

  // Estado de UI/datos
  const [toast, setToast] = useState("");
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catMap, setCatMap] = useState({});
  const [logsMap, setLogsMap] = useState({});
  const [cats, setCats] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [userNames, setUserNames] = useState([]);

  // Filtros
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Límite por defecto 20
  const DEFAULT_LIMIT = 20;
  const [fLimit, setFLimit] = useState(String(DEFAULT_LIMIT));
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fCajaId, setFCajaId] = useState(""); // "" | "1" | "2"
  const [fUsuario, setFUsuario] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [filterError, setFilterError] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ limit: DEFAULT_LIMIT });
  // Filtro rápido por caja ('' | '1' | '2')
  const [quickCaja, setQuickCaja] = useState("");

  // Estados de edición/eliminación
  const [editTx, setEditTx] = useState(null);
  const [selDesc, setSelDesc] = useState(false);
  const [selMonto, setSelMonto] = useState(false);
  const [selCat, setSelCat] = useState(false);
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editMonto, setEditMonto] = useState("");
  const [editTipo, setEditTipo] = useState("INGRESO");
  const [editCategoriaId, setEditCategoriaId] = useState("");
  const [editError, setEditError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Timeouts de espera
  const timedOutChecking = useTimeout(checking, 10000);
  const timedOutTxs = useTimeout(loading && serverOk === true, 10000);

  const filteredEditCats = useMemo(
    () => cats.filter((c) => c.tipo === editTipo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [cats, editTipo]
  );

  const sections = useMemo(() => {
    // 1. Grouping Logic for "Retiro Banco" (Cat 30 + Cat 20)
    const processed = [];
    const usedIds = new Set();
    const sortedTxs = [...txs]; // Assumed sorted by date desc

    sortedTxs.forEach((t, index) => {
      if (usedIds.has(t.id)) return;

      // Check if it's a Bank Withdrawal part
      const catId = Number(t.categoria_id);

      // Case: Retiro de Banco (Transferencia)
      // We look for a pair: Cat 30 (Egreso from Caja 2) AND Cat 20 (Ingreso to Caja 1)
      // They should be adjacent or very close, same amount, same user.
      if (catId === 30 || catId === 20) {
        // Try to find partner
        const partnerCatId = catId === 30 ? 20 : 30;
        // Look ahead (since sorted desc, timestamps are close)
        // Usually created in same transaction, so index+1 or index is likely
        let partner = null;
        // Scan a small window of adjacent transactions (e.g., next 5)
        for (let i = index + 1; i < Math.min(index + 5, sortedTxs.length); i++) {
          const cand = sortedTxs[i];
          if (usedIds.has(cand.id)) continue;
          if (Number(cand.categoria_id) === partnerCatId &&
            Math.abs(cand.monto - t.monto) < 0.01 &&
            cand.usuario === t.usuario) {
            partner = cand;
            break;
          }
        }

        if (partner) {
          // Found a pair! Create a Merged Transaction
          usedIds.add(t.id);
          usedIds.add(partner.id);

          // Determine which is which
          const egreso = catId === 30 ? t : partner;
          const ingreso = catId === 20 ? t : partner;

          processed.push({
            ...ingreso, // Base on Ingreso (positive feeling) but allow override
            id: `merged-${egreso.id}-${ingreso.id}`,
            isMerged: true,
            realIds: [ingreso.id, egreso.id],
            descripcion: "Retiro de efectivo desde Banco",
            categoria_id: "TRANSFER_BANK", // Virtual ID
            monto: ingreso.monto,
            fecha: ingreso.fecha, // Use the latest (usually ingreso created 2nd or same time)
            caja_id: "MIXED",
            displayType: "TRANSFER",
            details: {
              egreso,
              ingreso
            }
          });
          return;
        }
      }

      // Default: Individual transaction
      usedIds.add(t.id);
      processed.push(t);
    });

    // 2. Sectioning by Day
    const byDay = {};
    processed.forEach((m) => {
      const key = m.fecha ? getYMDKeyCO(m.fecha) : "";
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(m);
    });
    return Object.entries(byDay)
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([day, items]) => ({ day, items }));
  }, [txs]);

  // Chequeo de servidor al montar
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



  // Helpers
  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatMoney = (v) => {
    if (typeof v === "string") v = parseFloat(v);
    return typeof v === "number" && !Number.isNaN(v) ? v.toLocaleString("es-CL") : String(v ?? "");
  };

  // Construir query from filtros
  const buildQuery = useCallback((f) => {
    const p = new URLSearchParams();
    if (f?.limit) p.set("limit", String(f.limit));
    if (f?.from) p.set("from", f.from);
    if (f?.to) p.set("to", f.to);
    if (f?.tipo) p.set("tipo", f.tipo);
    if (f?.descripcion) p.set("descripcion", f.descripcion);
    if (f?.usuario) p.set("usuario", f.usuario);
    if (f?.caja_id) p.set("caja_id", String(f.caja_id));
    const s = p.toString();
    return s ? `?${s}` : "";
  }, []);

  // Cargar cat/logs cuando servidor OK
  useEffect(() => {
    if (serverOk !== true) return;
    let aborted = false;
    fetchCategorias()
      .then((catsArr) => {
        if (aborted) return;
        const arr = Array.isArray(catsArr) ? catsArr : [];
        const map = arr.reduce((acc, c) => {
          acc[c.id] = { nombre: c.nombre, tipo: c.tipo };
          return acc;
        }, {});
        setCatMap(map);
        setCats(arr);
      })
      .catch(() => { });

    apiFetch("/api/logs")
      .then((r) => {
        if (!r.ok) throw new Error("Error al obtener logs");
        return r.json();
      })
      .then((logs) => {
        if (aborted) return;
        const grouped = (Array.isArray(logs) ? logs : []).reduce((acc, l) => {
          const key = l.transaccion_id;
          if (!acc[key]) acc[key] = [];
          acc[key].push(l);
          return acc;
        }, {});
        Object.keys(grouped).forEach((k) => {
          grouped[k].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        });
        setLogsMap(grouped);
      })
      .catch(() => { });

    // Cargar usuarios para filtro de usuario
    (async () => {
      try {
        const list = await getUsers();
        if (aborted) return;
        const arr = Array.isArray(list) ? list : [];
        const names = Array.from(new Set(arr.map(u => u.displayName).filter(Boolean)));
        setUserNames(names);
      } catch { }
    })();

    return () => { aborted = true; };
  }, [serverOk]);

  // Cargar transacciones
  const loadTxs = useCallback((f) => {
    setLoading(true);
    setError(null);
    const qs = buildQuery(f);
    let ignore = false;
    apiFetch(`/api/transacciones${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error("Error al obtener transacciones");
        return r.json();
      })
      .then((txsData) => {
        if (ignore) return;
        const arr = Array.isArray(txsData) ? txsData : [];
        const sorted = arr.filter((m) => m && m.fecha).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        setTxs(sorted);
        setLoading(false);
      })
      .catch((e) => {
        if (ignore) return;
        setError(e.message);
        setLoading(false);
      });
    return () => { ignore = true; };
  }, [buildQuery]);

  // Resolver displayName del usuario en sesión
  const resolveActorName = useCallback(async () => {
    try {
      const uname = getSessionUsername();
      if (!uname) return "";
      const list = await getUsers();
      const arr = Array.isArray(list) ? list : [];
      const me = arr.find((u) => u.username === uname);
      return me?.displayName || uname;
    } catch {
      return getSessionUsername() || "";
    }
  }, []);

  // Carga inicial con límite por defecto tras servidor OK
  useEffect(() => {
    if (serverOk !== true) return;
    const cancel = loadTxs({ limit: DEFAULT_LIMIT });
    return cancel;
  }, [loadTxs, serverOk]);

  // Toast y recarga al volver desde otras vistas (ej. creación)
  useEffect(() => {
    const st = location?.state || {};
    if (st.toast) setToast(String(st.toast));
    if (st.reload) loadTxs(appliedFilters);
    if (st.toast || st.reload) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, loadTxs, appliedFilters]);

  // Auto refresh on mutation broadcasts (e.g., new transaction from FAB)
  useEffect(() => {
    if (serverOk !== true) return;
    const handler = () => loadTxs(appliedFilters);
    window.addEventListener('atm:mutation', handler);
    return () => window.removeEventListener('atm:mutation', handler);
  }, [serverOk, loadTxs, appliedFilters]);

  // Autocerrar toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Aplicar/Limpiar filtros
  const applyFilters = () => {
    if (fFrom && fTo) {
      const a = new Date(fFrom);
      const b = new Date(fTo);
      if (a > b) {
        setFilterError("La fecha 'desde' no puede ser mayor a 'hasta'.");
        return;
      }
    }
    setFilterError("");
    const f = {
      limit: fLimit ? Number(fLimit) : undefined,
      from: fFrom || undefined,
      to: fTo || undefined,
      tipo: fTipo || undefined,
      descripcion: fDesc.trim() || undefined,
      usuario: fUsuario || undefined,
      caja_id: fCajaId ? Number(fCajaId) : undefined,
    };
    setAppliedFilters(f);
    loadTxs(f);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setFLimit(String(DEFAULT_LIMIT));
    setFFrom("");
    setFTo("");
    setFTipo("");
    setFDesc("");
    setFUsuario("");
    setFCajaId("");
    setFilterError("");
    const next = { limit: DEFAULT_LIMIT };
    setAppliedFilters(next);
    loadTxs(next);
    setQuickCaja("");
  };

  // Sincroniza quickCaja cuando cambian los filtros aplicados
  useEffect(() => {
    const c = appliedFilters?.caja_id;
    if (c === 1) setQuickCaja("1");
    else if (c === 2) setQuickCaja("2");
    else setQuickCaja("");
  }, [appliedFilters?.caja_id]);

  // Aplicación de filtro rápido por caja
  const applyQuickCaja = (k) => {
    setQuickCaja(k);
    setFCajaId(k);
    const next = {
      ...appliedFilters,
      caja_id: k ? Number(k) : undefined,
    };
    // Limpia propiedad si es undefined para evitar que quede en URL
    if (!k && 'caja_id' in next) delete next.caja_id;
    setAppliedFilters(next);
    loadTxs(next);
  };

  // Abrir edición
  const openEdit = (m) => {
    setEditTx(m);
    setSelDesc(false);
    setSelMonto(false);
    setSelCat(false);
    setEditDescripcion(m.descripcion || "");
    setEditMonto(m.monto ?? "");
    const currTipo = catMap[m.categoria_id]?.tipo || "INGRESO";
    setEditTipo(currTipo);
    setEditCategoriaId(String(m.categoria_id));
    setEditError("");
  };

  // Actualizar
  const performUpdate = async () => {
    if (!editTx) return;
    const body = {};
    if (selDesc) {
      const d = editDescripcion.trim();
      if (!d) return setEditError("La descripción no puede estar vacía.");
      body.descripcion = d;
    }
    if (selMonto) {
      const n = Number(editMonto);
      if (!(n > 0)) return setEditError("El monto debe ser mayor a 0.");
      body.monto = n;
    }
    if (selCat) {
      const id = Number(editCategoriaId);
      if (!id) return setEditError("Selecciona una categoría.");
      body.categoria_id = id;
    }
    if (Object.keys(body).length === 0) return setEditError("Selecciona al menos un campo a actualizar.");

    setUpdating(true);
    setProgressOpen(true);
    try {
      const actor = await resolveActorName();
      const q = new URLSearchParams();
      if (actor) q.set('usuario', actor);
      // API requiere caja_id en actualización; si no se edita, enviar la actual
      const caja = Number(editTx.caja_id) > 0 ? Number(editTx.caja_id) : undefined;
      if (caja) q.set('caja_id', String(caja));
      const qs = q.toString();
      const res = await apiFetch(`/api/transacciones/${editTx.id}${qs ? `?${qs}` : ''}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 409 || res.status === 400) {
          let data = null;
          try { data = await res.json(); } catch (_) { }
          const msg = (data && data.error) ? String(data.error) : (res.status === 409 ? 'Conflicto de saldo o validación' : 'Solicitud inválida');
          setEditError(msg);
          notify({ type: 'error', title: 'No se pudo actualizar', message: msg });
          return;
        }
        const txt = await res.text();
        const errMsg = txt || 'Error al actualizar';
        notify({ type: 'error', title: 'No se pudo actualizar', message: errMsg });
        throw new Error(errMsg);
      }
      // Re-fetch to asegurar que lo mostrado corresponde al servidor
      setEditTx(null);
      loadTxs(appliedFilters);
      // También recargar logs para reflejar cambios
      try {
        const r = await apiFetch("/api/logs");
        if (r.ok) {
          const logs = await r.json();
          const grouped = (Array.isArray(logs) ? logs : []).reduce((acc, l) => {
            const key = l.transaccion_id;
            if (!acc[key]) acc[key] = [];
            acc[key].push(l);
            return acc;
          }, {});
          Object.keys(grouped).forEach((k) => {
            grouped[k].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
          });
          setLogsMap(grouped);
        }
      } catch { }
      notifyMutation();
      setToast("Transacción actualizada");
      notify({ type: 'success', title: 'Actualización exitosa', message: 'La transacción fue actualizada.' });
    } catch (e) {
      setEditError(e.message || "Error al actualizar");
      notify({ type: 'error', title: 'No se pudo actualizar', message: e.message || 'Error al actualizar' });
    } finally {
      setProgressOpen(false);
      setUpdating(false);
    }
  };

  // Eliminar
  const performDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setProgressOpen(true);
    try {
      const actor = await resolveActorName();
      const qp = actor ? `?usuario=${encodeURIComponent(actor)}` : "";
      const res = await apiFetch(`/api/transacciones/${confirmDelete.id}${qp}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text();
        const errMsg = txt || 'Error al eliminar';
        notify({ type: 'error', title: 'No se pudo eliminar', message: errMsg });
        throw new Error(errMsg);
      }
      // Re-fetch para asegurar consistencia con servidor y logs
      setConfirmDelete(null);
      loadTxs(appliedFilters);
      try {
        const r = await apiFetch("/api/logs");
        if (r.ok) {
          const logs = await r.json();
          const grouped = (Array.isArray(logs) ? logs : []).reduce((acc, l) => {
            const key = l.transaccion_id;
            if (!acc[key]) acc[key] = [];
            acc[key].push(l);
            return acc;
          }, {});
          Object.keys(grouped).forEach((k) => {
            grouped[k].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
          });
          setLogsMap(grouped);
        }
      } catch { }
      notifyMutation();
      setToast("Transacción eliminada");
      notify({ type: 'success', title: 'Eliminada', message: `La transacción fue eliminada (${formatCLP(confirmDelete.monto)}).` });
    } catch (e) {
      setToast(e.message || "Error al eliminar");
      notify({ type: 'error', title: 'No se pudo eliminar', message: e.message || 'Error al eliminar' });
      setConfirmDelete(null);
    } finally {
      setProgressOpen(false);
      setDeleting(false);
    }
  };

  // Render
  if (timedOutChecking) {
    return (
      <Layout title="Movimientos">
        <ServerDown onRetry={async () => {
          setChecking(true);
          const ok = await pingServer();
          setServerOk(ok);
          setChecking(false);
        }} />
      </Layout>
    );
  }

  return (
    <Layout title="Movimientos">
      {toast && (
        <div className="fixed top-3 inset-x-0 z-40 flex justify-center px-4">
          <div className="max-w-md w-full bg-[var(--card-color)] border border-[var(--border-color)] text-[var(--text-color)] rounded-xl shadow-lg px-4 py-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--success-color)]">check_circle</span>
            <p className="text-sm flex-1">{toast}</p>
          </div>
        </div>
      )}
      <div className="space-y-6 view-enter view-enter-active">
        {/* Barra de filtros */}
        <section className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)]">
          <div className="p-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="px-3 py-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5 flex items-center gap-2"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <span className="material-symbols-outlined">filter_list</span>
                <span>Filtros</span>
              </button>
              {/* Chips de filtros activos */}
              {appliedFilters?.limit && (
                <span className="text-xs px-2 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-secondary-color)]">Límite: {appliedFilters.limit}</span>
              )}
              {appliedFilters?.from && (
                <span className="text-xs px-2 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-secondary-color)]">Desde: {appliedFilters.from}</span>
              )}
              {appliedFilters?.to && (
                <span className="text-xs px-2 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-secondary-color)]">Hasta: {appliedFilters.to}</span>
              )}
              {appliedFilters?.tipo && (
                <span className="text-xs px-2 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-secondary-color)]">Tipo: {appliedFilters.tipo}</span>
              )}
              {appliedFilters?.caja_id && (
                <span className="text-xs px-2 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-secondary-color)]">Caja: {appliedFilters.caja_id === 1 ? 'Efectivo' : appliedFilters.caja_id === 2 ? 'Cuenta bancaria' : appliedFilters.caja_id}</span>
              )}
              {appliedFilters?.usuario && (
                <span className="text-xs px-2 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-secondary-color)]">Usuario: {appliedFilters.usuario}</span>
              )}
              {appliedFilters?.descripcion && (
                <span className="text-xs px-2 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-secondary-color)]">Texto: “{appliedFilters.descripcion}”</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs text-[var(--text-secondary-color)] hover:text-white underline" onClick={clearFilters}>Limpiar</button>
            </div>
          </div>
          {filtersOpen && (
            <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Límite</label>
                <select value={fLimit} onChange={(e) => setFLimit(e.target.value)} className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin límite</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Usuario</label>
                <select value={fUsuario} onChange={(e) => setFUsuario(e.target.value)} className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm">
                  <option value="">Todos</option>
                  {userNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { k: "", label: "Todos", icon: "all_inclusive" },
                    { k: "INGRESO", label: "Ingreso", icon: "arrow_upward" },
                    { k: "EGRESO", label: "Egreso", icon: "arrow_downward" },
                  ].map((t) => (
                    <button key={t.k} type="button" onClick={() => setFTipo(t.k)} className={`p-2 rounded-lg border text-sm flex items-center justify-center gap-1 ${fTipo === t.k ? 'border-[var(--primary-color)] bg-white/5' : 'border-[var(--border-color)] hover:bg-white/5'}`}>
                      <span className="material-symbols-outlined !text-base">{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Caja</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ k: "", label: "Todas", icon: "all_inclusive" }, { k: "1", label: "Efectivo", icon: "account_balance_wallet" }, { k: "2", label: "Cuenta bancaria", icon: "account_balance" }].map(o => (
                    <button key={o.k + o.label} type="button" onClick={() => setFCajaId(o.k)} className={`p-2 rounded-lg border text-sm flex items-center justify-center gap-1 ${fCajaId === o.k ? 'border-[var(--primary-color)] bg-white/5' : 'border-[var(--border-color)] hover:bg-white/5'}`}>
                      <span className="material-symbols-outlined !text-base">{o.icon}</span>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Desde</label>
                <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Hasta</label>
                <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Texto en descripción</label>
                <div className="flex items-center gap-2 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3">
                  <span className="material-symbols-outlined text-[var(--text-secondary-color)]">search</span>
                  <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Ej. pago, venta, etc." className="flex-1 bg-transparent outline-none py-2 text-sm" />
                </div>
              </div>
              {filterError && <p className="sm:col-span-2 text-xs text-red-500">{filterError}</p>}
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <button
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary-color)] hover:bg-white/5 flex items-center gap-2"
                  onClick={clearFilters}
                  type="button"
                  disabled={loading}
                >
                  {loading && <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" aria-hidden />}
                  Limpiar
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-[var(--primary-color)] text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                  onClick={applyFilters}
                  type="button"
                  disabled={loading}
                >
                  {loading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Vista rápida por caja (mobile-first) */}
        <section className="grid grid-cols-3 gap-2">
          <button
            type="button"
            aria-pressed={quickCaja === ""}
            onClick={() => applyQuickCaja("")}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs sm:text-sm ${quickCaja === "" ? 'border-[var(--primary-color)] bg-white/5' : 'border-[var(--border-color)] hover:bg-white/5'}`}
          >
            <span className="material-symbols-outlined">all_inclusive</span>
            <span>Todos</span>
          </button>
          <button
            type="button"
            aria-pressed={quickCaja === "1"}
            onClick={() => applyQuickCaja("1")}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs sm:text-sm ${quickCaja === "1" ? 'border-green-500/50 bg-green-900/10' : 'border-[var(--border-color)] hover:bg-white/5'}`}
          >
            <span className="material-symbols-outlined text-[var(--success-color)]">account_balance_wallet</span>
            <span>Efectivo</span>
          </button>
          <button
            type="button"
            aria-pressed={quickCaja === "2"}
            onClick={() => applyQuickCaja("2")}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs sm:text-sm ${quickCaja === "2" ? 'border-sky-500/50 bg-sky-900/10' : 'border-[var(--border-color)] hover:bg-white/5'}`}
          >
            <span className="material-symbols-outlined text-sky-300">account_balance</span>
            <span>Cuenta</span>
          </button>
        </section>
        {loading ? (
          timedOutTxs ? (
            <ServerDown onRetry={() => loadTxs(appliedFilters)} />
          ) : (
            <div className="space-y-6 animate-pulse">
              {Array.from({ length: 3 }).map((_, sIdx) => (
                <section key={sIdx}>
                  <div className="h-4 w-40 bg-white/10 rounded mb-2" />
                  <ul className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] divide-y divide-[var(--border-color)]">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <li key={i} className="px-4 py-3 flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-white/10" />
                        <div className="flex-1 min-w-0">
                          <div className="h-4 w-2/3 bg-white/10 rounded mb-2" />
                          <div className="h-3 w-40 bg-white/10 rounded" />
                        </div>
                        <div className="h-4 w-16 bg-white/10 rounded" />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : txs.length === 0 ? (
          <p className="text-[var(--text-secondary-color)]">Sin movimientos</p>
        ) : (
          <div className="space-y-6">
            {sections.map(({ day, items }) => (
              <section key={day} className="">
                <h3 className="text-sm font-semibold text-[var(--text-secondary-color)] mb-2">
                  {day === getTodayYMDKeyCO() ? `hoy, ${formatDateFromYMDKeyCO(day)}` : day === getYesterdayYMDKeyCO() ? `ayer, ${formatDateFromYMDKeyCO(day)}` : formatDateFromYMDKeyCO(day)}
                </h3>
                <ul className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] divide-y divide-[var(--border-color)]">
                  {items.map((m) => {
                    const catId = m.isMerged ? m.categoria_id : Number(m.categoria_id);
                    let cat = catMap[catId] || catMap[Number(m.categoria_id)];

                    // Logic for Merged/Virtual items
                    let isIngreso, tipo, tipoColor, iconName, bubbleBg;

                    if (m.isMerged && catId === "TRANSFER_BANK") {
                      // Merged Card Style
                      tipo = "TRANSFER";
                      isIngreso = true; // For positive visual alignment (User got cash)
                      tipoColor = "text-blue-400"; // Distinctive Blue for Transfer
                      iconName = "currency_exchange"; // Or 'sync_alt'
                      bubbleBg = "bg-blue-900/30 border border-blue-500/30";
                      cat = { nombre: "Retiro de efectivo", tipo: "TRANSFER" };
                    } else {
                      // Standard Items
                      cat = catMap[catId];
                      tipo = cat?.tipo;
                      isIngreso = tipo === "INGRESO";

                      // Default Colors (Green/Red as requested)
                      tipoColor = isIngreso
                        ? "text-[var(--success-color)]"
                        : tipo === "EGRESO"
                          ? "text-[var(--danger-color)]"
                          : "text-[var(--text-secondary-color)]";

                      bubbleBg = isIngreso ? "bg-green-900/30" : tipo === "EGRESO" ? "bg-red-900/30" : "bg-slate-700/30";
                      iconName = isIngreso ? "arrow_upward" : tipo === "EGRESO" ? "arrow_downward" : "swap_vert";

                      // Custom Icons (Colors stay standard)
                      if (catId === 16) {
                        // POS Cashout -> Ingreso (Green) but Store Icon
                        iconName = "storefront";
                        // Optional: subtle variation in bg?
                        // bubbleBg = "bg-emerald-900/40"; 
                      }
                    }

                    const logs = logsMap[m.id] || [];
                    const open = expanded.has(m.id);
                    const lastLog = logs[0];
                    const actionColor = lastLog?.accion === 'INSERT' ? 'text-[var(--success-color)]' : lastLog?.accion === 'DELETE' ? 'text-[var(--danger-color)]' : 'text-amber-400';
                    const actionIcon = lastLog?.accion === 'INSERT' ? 'add_circle' : lastLog?.accion === 'DELETE' ? 'cancel' : 'edit';

                    return (
                      <li key={m.id} className="">
                        <button
                          className="w-full px-4 py-3 flex items-start gap-3"
                          onClick={() => toggle(m.id)}
                          aria-expanded={open}
                        >
                          <span className={`flex h-10 w-10 items-center justify-center rounded-full ${bubbleBg} ${tipoColor}`} aria-hidden>
                            <span className="material-symbols-outlined !text-2xl">{iconName}</span>
                          </span>
                          <div className="flex-1 text-left min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <p className="font-medium line-clamp-2 break-anywhere pr-2">{m.descripcion}</p>
                              <div className="text-right whitespace-nowrap flex-shrink-0">
                                <p className={`font-semibold ${tipoColor}`}>
                                  {tipo === "EGRESO" ? `-${formatMoney(m.monto)}` : formatMoney(m.monto)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-3 mt-1">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-color)] bg-[var(--dark-color)] ${tipoColor}`}>
                                {cat?.nombre || `Cat #${m.categoria_id}`}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--text-secondary-color)] px-2 py-0.5 rounded-full border border-[var(--border-color)] bg-[var(--dark-color)]">
                                  {m.isMerged ? 'Banco → Efectivo' : (Number(m.caja_id) === 1 ? 'Efectivo' : Number(m.caja_id) === 2 ? 'Cuenta bancaria' : `Caja #${m.caja_id}`)}
                                </span>
                                {tipo && <p className={`text-[10px] ${tipoColor}`}>{tipo}</p>}
                              </div>
                            </div>
                            <div className="mt-1">
                              <p className="text-xs text-[var(--text-secondary-color)] line-clamp-1 break-anywhere">
                                {m.fecha ? formatDateTimeCOAbbr(m.fecha) : ""}
                              </p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-[var(--text-secondary-color)] ml-2 mt-1">{open ? "expand_less" : "expand_more"}</span>
                        </button>

                        {open && (
                          <div className="px-4 pb-3 space-y-3">
                            {/* Panel de Detalles */}
                            <div className="rounded-lg bg-[var(--card-color)] border border-[var(--border-color)]">
                              <ul className="divide-y divide-[var(--border-color)]">
                                <li className="p-3 flex items-start gap-3">
                                  <span className="material-symbols-outlined text-[var(--text-secondary-color)]">subject</span>
                                  <div>
                                    <p className="text-xs text-[var(--text-secondary-color)]">Descripción</p>
                                    <p className="text-sm font-medium">{m.descripcion}</p>
                                  </div>
                                </li>
                                <li className="p-3 flex items-start gap-3">
                                  <span className="material-symbols-outlined text-[var(--text-secondary-color)]">calendar_today</span>
                                  <div>
                                    <p className="text-xs text-[var(--text-secondary-color)]">Fecha</p>
                                    <p className="text-sm font-medium">{m.fecha ? formatDateTimeCOAbbr(m.fecha) : ""}</p>
                                  </div>
                                </li>
                                <li className="p-3 flex items-start gap-3">
                                  <span className="material-symbols-outlined text-[var(--text-secondary-color)]">person</span>
                                  <div>
                                    <p className="text-xs text-[var(--text-secondary-color)]">Usuario</p>
                                    <p className="text-sm font-medium">{m.usuario || (logs[0]?.usuario) || '-'}</p>
                                  </div>
                                </li>
                                <li className="p-3 flex items-start gap-3">
                                  <span className="material-symbols-outlined text-[var(--text-secondary-color)]">category</span>
                                  <div className="flex-1">
                                    <p className="text-xs text-[var(--text-secondary-color)]">Categoría</p>
                                    <div className="mt-1 flex items-center gap-2">
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-color)] bg-[var(--dark-color)] ${tipoColor}`}>
                                        {cat?.nombre || `Cat #${m.categoria_id}`}
                                      </span>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-color)] bg-[var(--dark-color)] text-[var(--text-secondary-color)]">
                                        {m.isMerged ? 'Banco → Efectivo' : (Number(m.caja_id) === 1 ? 'Efectivo' : Number(m.caja_id) === 2 ? 'Cuenta bancaria' : `Caja #${m.caja_id}`)}
                                      </span>
                                      {tipo && (
                                        <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-color)] bg-[var(--dark-color)] ${tipoColor}`}>
                                          <span className="material-symbols-outlined !text-sm">{iconName}</span>
                                          {tipo}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </li>
                                <li className="p-3 flex items-start gap-3">
                                  <span className={`material-symbols-outlined ${tipoColor}`}>attach_money</span>
                                  <div>
                                    <p className="text-xs text-[var(--text-secondary-color)]">Monto</p>
                                    <p className={`text-sm font-semibold ${tipoColor}`}>
                                      {tipo === "EGRESO" ? `-${formatMoney(m.monto)}` : formatMoney(m.monto)}
                                    </p>
                                  </div>
                                </li>
                                <li className="p-3 flex items-start gap-3">
                                  <span className="material-symbols-outlined text-[var(--text-secondary-color)]">confirmation_number</span>
                                  <div>
                                    <p className="text-xs text-[var(--text-secondary-color)]">ID Transacción</p>
                                    <p className="text-sm font-medium">{m.id}</p>
                                  </div>
                                </li>
                                {logs.length > 0 && (
                                  <li className="p-3 flex items-start gap-3">
                                    <span className="material-symbols-outlined text-[var(--text-secondary-color)]">account_balance_wallet</span>
                                    <div className="flex-1">
                                      <p className="text-xs text-[var(--text-secondary-color)]">Último saldo registrado</p>
                                      <div className="mt-1 rounded-md border border-[var(--border-color)] bg-[var(--dark-color)]/40 p-2">
                                        <div className="flex items-center justify-between text-sm">
                                          <div>
                                            <p className="text-[11px] text-[var(--text-secondary-color)]">Antes</p>
                                            <p className="font-medium">${formatMoney(lastLog.saldo_antes)}</p>
                                          </div>
                                          <span className="material-symbols-outlined text-[var(--text-secondary-color)] mx-2">arrow_forward</span>
                                          <div className="text-right">
                                            <p className="text-[11px] text-[var(--text-secondary-color)]">Después</p>
                                            <p className="font-medium">${formatMoney(lastLog.saldo_despues)}</p>
                                          </div>
                                        </div>
                                        <p className="mt-2 text-[12px] leading-tight text-[var(--text-secondary-color)]">
                                          Pasó de tener un saldo en caja fuerte de ${formatMoney(lastLog.saldo_antes)} a un saldo en caja fuerte de ${formatMoney(lastLog.saldo_despues)}.
                                        </p>
                                        <div className="mt-2 pt-2 border-t border-[var(--border-color)] grid grid-cols-1 sm:grid-cols-3 gap-2">
                                          <span className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-[var(--border-color)] bg-[var(--dark-color)] ${actionColor}`}>
                                            <span className="material-symbols-outlined !text-sm">{actionIcon}</span>
                                            {lastLog.accion}
                                          </span>
                                          <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-[var(--border-color)] bg-[var(--dark-color)] text-[var(--text-secondary-color)]">
                                            <span className="material-symbols-outlined !text-sm">calendar_today</span>
                                            {formatDateTimeCOAbbr(lastLog.fecha)}
                                          </span>
                                          {lastLog.usuario && (
                                            <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-[var(--border-color)] bg-[var(--dark-color)] text-[var(--text-secondary-color)]">
                                              <span className="material-symbols-outlined !text-sm">person</span>
                                              {lastLog.usuario}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </li>
                                )}
                              </ul>
                            </div>
                            {/* Acciones */}
                            <div className="flex gap-2">
                              <button
                                className="flex-1 py-2 rounded-lg border border-[var(--border-color)] hover:bg-white/5 flex items-center justify-center gap-2"
                                onClick={() => openEdit(m)}
                              >
                                <span className="material-symbols-outlined">edit</span>
                                Editar
                              </button>
                              <button
                                className="flex-1 py-2 rounded-lg border border-[var(--danger-color)] text-[var(--danger-color)] hover:bg-red-900/10 flex items-center justify-center gap-2"
                                onClick={() => setConfirmDelete(m)}
                              >
                                <span className="material-symbols-outlined">delete</span>
                                Eliminar
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {/* Ajuste rápido de límite al final */}
            <section className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)]">
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--text-secondary-color)]">list_alt</span>
                  <h4 className="font-medium">Ajustar límite de movimientos</h4>
                </div>
                <div className="flex items-center gap-2">
                  <select value={fLimit} onChange={(e) => setFLimit(e.target.value)} className="bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm">
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="">Sin límite</option>
                  </select>
                  <button
                    className="px-3 py-2 rounded-lg bg-[var(--primary-color)] text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                    onClick={() => {
                      const next = {
                        ...(appliedFilters || {}),
                        limit: fLimit ? Number(fLimit) : undefined,
                      };
                      setAppliedFilters(next);
                      loadTxs(next);
                    }}
                    disabled={loading}
                  >
                    {loading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                    Aplicar
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
      {/* Overlay de edición */}
      {editTx && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setEditTx(null)}>
          <div className="w-full max-w-md bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><span className="material-symbols-outlined">edit</span>Editar transacción</h3>
            <p className="text-xs text-[var(--text-secondary-color)] mb-3">Selecciona qué campos deseas actualizar.</p>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={selDesc} onChange={(e) => setSelDesc(e.target.checked)} />
                <span className="text-sm">Descripción</span>
              </label>
              {selDesc && (
                <div className="flex items-center gap-2 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3">
                  <span className="material-symbols-outlined text-[var(--text-secondary-color)]">subject</span>
                  <input className="flex-1 bg-transparent outline-none py-2 text-sm" value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} />
                </div>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={selMonto} onChange={(e) => setSelMonto(e.target.checked)} />
                <span className="text-sm">Monto</span>
              </label>
              {selMonto && (
                <div className="flex items-center gap-2 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3">
                  <span className="material-symbols-outlined text-[var(--text-secondary-color)]">attach_money</span>
                  <input type="number" min="0" step="1" className="flex-1 bg-transparent outline-none py-2 text-sm" value={editMonto} onChange={(e) => setEditMonto(e.target.value)} />
                </div>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={selCat} onChange={(e) => setSelCat(e.target.checked)} />
                <span className="text-sm">Categoría / Tipo</span>
              </label>
              {selCat && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {['INGRESO', 'EGRESO'].map(t => (
                      <button key={t} type="button" className={`flex items-center justify-center gap-2 p-2 rounded-lg border ${editTipo === t ? (t === 'EGRESO' ? 'border-[var(--danger-color)] bg-red-900/20 text-[var(--danger-color)]' : 'border-[var(--success-color)] bg-green-900/20 text-[var(--success-color)]') : 'border-[var(--border-color)] text-[var(--text-secondary-color)] hover:bg-white/5'}`} onClick={() => setEditTipo(t)}>
                        <span className="material-symbols-outlined">{t === 'EGRESO' ? 'arrow_downward' : 'arrow_upward'}</span>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto">
                    {filteredEditCats.map(c => (
                      <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${Number(editCategoriaId) === c.id ? 'border-[var(--primary-color)] bg-white/5' : 'border-[var(--border-color)] hover:bg-white/5'}`}>
                        <input type="radio" name="editCat" className="sr-only" checked={Number(editCategoriaId) === c.id} onChange={() => setEditCategoriaId(String(c.id))} />
                        <span className={`material-symbols-outlined ${c.tipo === 'INGRESO' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}`}>{c.tipo === 'INGRESO' ? 'trending_up' : 'trending_down'}</span>
                        <span className="text-sm">{c.nombre}</span>
                      </label>
                    ))}
                  </div>
                  {catMap[editTx.categoria_id]?.tipo !== editTipo && (
                    <div className="text-xs text-amber-400 flex items-center gap-1"><span className="material-symbols-outlined !text-sm">warning</span>Al cambiar el tipo de movimiento (ingreso/egreso) se modificará el saldo de caja.</div>
                  )}
                </div>
              )}
              {editError && <p className="text-xs text-red-500">{editError}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary-color)] hover:bg-white/5" onClick={() => setEditTx(null)} disabled={updating}>Cancelar</button>
              <button className="flex-1 py-2 rounded-lg bg-[var(--primary-color)] text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2" onClick={performUpdate} disabled={updating}>
                {updating && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Overlay de confirmación de eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-md bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><span className="material-symbols-outlined">delete</span>Eliminar transacción</h3>
            <p className="text-sm mb-3">¿Seguro que deseas eliminar "{confirmDelete.descripcion}" por ${formatMoney(confirmDelete.monto)}?</p>
            <div className="text-xs text-amber-400 flex items-center gap-1 mb-4"><span className="material-symbols-outlined !text-sm">warning</span>Eliminar esta transacción modificará el saldo de caja.</div>
            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary-color)] hover:bg-white/5" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancelar</button>
              <button className="flex-1 py-2 rounded-lg bg-[var(--danger-color)] text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2" onClick={performDelete} disabled={deleting}>
                {deleting && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Overlay de progreso compartido */}
      {progressOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-xs bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-5 flex flex-col items-center">
            <div className="h-10 w-10 rounded-full border-4 border-white/20 border-t-white animate-spin mb-3" aria-hidden />
            <p className="text-sm">Procesando...</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
