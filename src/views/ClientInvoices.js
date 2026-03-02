import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import BottomNav from "../components/BottomNav";
import Preloader from "../components/Preloader";
import useTitle from "../useTitle";
import { listClientInvoices, deleteInvoice } from "../carteraApi";

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

function EstadoBadge({ estado }) {
  const cls = useMemo(() => {
    const e = String(estado || "").toUpperCase();
    if (e.includes("PAG")) return "bg-[#16a34a]/20 text-[#86efac] border-[#16a34a]/40"; // pagada
    if (e.includes("PEND")) return "bg-[#f59e0b]/20 text-[#fde68a] border-[#f59e0b]/40"; // pendiente
    if (e.includes("ANUL") || e.includes("CANC")) return "bg-[#ef4444]/20 text-[#fca5a5] border-[#ef4444]/40"; // anulada/cancelada
    return "bg-white/10 text-white/80 border-white/15";
  }, [estado]);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border ${cls}`}>
      <span className="material-symbols-outlined text-sm" aria-hidden>
        flag
      </span>
      {estado || "—"}
    </span>
  );
}

export default function ClientInvoices() {
  const navigate = useNavigate();
  const { id: clientId } = useParams();
  useTitle("Facturas · ATM Ricky Rich");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [deletingInvoice, setDeletingInvoice] = useState(null); // objeto factura en proceso de eliminación
  const [deleteStep, setDeleteStep] = useState(0); // 0 ninguno, 1 advertencia, 2 confirmación final
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(null); // factura eliminada

  const clientName = invoices[0]?.cliente?.nombre || "Cliente";
  const clientPhone = invoices[0]?.cliente?.celular || "";

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listClientInvoices(clientId);
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || "No se pudieron cargar las facturas.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId) fetchInvoices();
  }, [clientId, fetchInvoices]);

  return (
    <div className="min-h-screen bg-[var(--background-color)] text-[var(--text-color)] flex flex-col">
      <Header title={`Facturas · ${clientName}`} />
      <main className="flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] view-enter view-enter-active overflow-y-auto">
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-4 pb-6">
          <section className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl shadow-[0_10px_40px_-24px_rgba(0,0,0,0.9)] overflow-hidden">
            <header className="px-4 sm:px-6 py-4 border-b border-white/5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold leading-tight">Facturas de {clientName}</h2>
                {clientPhone ? (
                  <p className="text-sm text-[var(--text-secondary-color)]">WhatsApp: {clientPhone}</p>
                ) : (
                  <p className="text-sm text-[var(--text-secondary-color)]">Consulta y gestiona las facturas de este cliente.</p>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-white/80 px-4 py-2 sm:px-5 sm:py-3 text-sm sm:text-base font-medium transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  aria-label="Volver a clientes"
                  onClick={() => navigate('/wallet')}
                >
                  <span className="material-symbols-outlined text-base sm:text-lg" aria-hidden>
                    arrow_back
                  </span>
                  Volver a clientes
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--primary-color)]/60 bg-[var(--primary-color)]/15 text-[var(--primary-color)] px-4 py-2 sm:px-5 sm:py-3 text-sm sm:text-base font-semibold transition hover:bg-[var(--primary-color)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]/40"
                  aria-label="Crear nueva factura"
                  onClick={() => navigate(`/wallet/client/${clientId}/invoices/new`, { state: { client: invoices[0]?.cliente } })}
                >
                  <span className="material-symbols-outlined text-base sm:text-lg" aria-hidden>
                    receipt_long
                  </span>
                  Crear factura
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#0ea5e9]/60 bg-[#0ea5e9]/15 text-[#7dd3fc] px-4 py-2 sm:px-5 sm:py-3 text-sm sm:text-base font-semibold transition hover:bg-[#0ea5e9]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7dd3fc]/40"
                  aria-label="Crear abono"
                  onClick={() => navigate(`/wallet/client/${clientId}/abonos/new`, { state: { client: invoices[0]?.cliente } })}
                >
                  <span className="material-symbols-outlined text-base sm:text-lg" aria-hidden>
                    payments
                  </span>
                  Crear abono
                </button>
              </div>
            </header>

            {loading ? (
              <Preloader label="Cargando facturas…" />
            ) : error ? (
              <div className="p-6 sm:p-8 text-center flex flex-col items-center gap-4">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-[var(--danger-color)]/10 text-[var(--danger-color)]">
                  <span className="material-symbols-outlined text-3xl" aria-hidden>
                    error
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-base font-medium">No pudimos cargar las facturas</p>
                  <p className="text-sm text-[var(--text-secondary-color)] break-anywhere">{error}</p>
                </div>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-white/10 text-sm font-medium transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  onClick={fetchInvoices}
                >
                  Reintentar
                </button>
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-6 sm:p-8 text-center flex flex-col items-center gap-3">
                <div className="flex items-center justify-center h-14 w-14 rounded-full bg-white/5">
                  <span className="material-symbols-outlined text-3xl text-[var(--text-secondary-color)]" aria-hidden>
                    receipt_long
                  </span>
                </div>
                <p className="text-base font-medium">Este cliente no tiene facturas</p>
                <p className="text-sm text-[var(--text-secondary-color)]">Cuando crees facturas, aparecerán aquí automáticamente.</p>
              </div>
            ) : (
              <div className="px-4 sm:px-6 pt-4 pb-6">
                <div className="flex flex-col gap-3 sm:gap-4">
                  {invoices.map((inv) => (
                    <article
                      key={inv.id}
                      className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4 sm:px-6 sm:py-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.8)] backdrop-blur-[2px]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-3xl text-white/80 bg-white/5 rounded-2xl p-3" aria-hidden>
                            receipt_long
                          </span>
                          <div className="flex flex-col">
                            <h3 className="text-lg font-semibold leading-tight">OP {inv.op || "—"}</h3>
                            <div className="mt-1"><EstadoBadge estado={inv.estado} /></div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <p className="text-xs text-[var(--text-secondary-color)]">Valor total</p>
                          <p className="text-base font-semibold">{formatCurrency(inv.valor_total)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <p className="text-xs text-[var(--text-secondary-color)]">Valor abonado</p>
                          <p className="text-base font-semibold text-[#86efac]">{formatCurrency(inv.valor_abonado)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <p className="text-xs text-[var(--text-secondary-color)]">Valor pendiente</p>
                          <p className="text-base font-semibold text-[#fca5a5]">{formatCurrency(inv.valor_pendiente)}</p>
                        </div>
                      </div>

                      {inv.observaciones ? (
                        <div className="mt-3">
                          <p className="text-xs text-[var(--text-secondary-color)]">Observaciones</p>
                          <p className="text-sm leading-snug break-anywhere">{inv.observaciones}</p>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#22c55e]/50 bg-[#16a34a]/15 text-[#bbf7d0] px-3 py-2 text-xs font-semibold transition hover:bg-[#16a34a]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/40"
                          aria-label="Ver abonos de la factura"
                          onClick={() => navigate(`/wallet/client/${clientId}/invoices/${inv.id}/abonos`, { state: { invoice: inv } })}
                        >
                          <span className="material-symbols-outlined text-sm" aria-hidden>
                            receipt_long
                          </span>
                          Ver abonos
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 text-[#fca5a5] px-3 py-2 text-xs font-semibold transition hover:bg-[#ef4444]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Eliminar factura"
                          onClick={() => { setDeletingInvoice(inv); setDeleteStep(1); setDeleteError(""); setDeleteSuccess(null); }}
                          disabled={!!deletingInvoice}
                        >
                          <span className="material-symbols-outlined text-sm" aria-hidden>
                            delete
                          </span>
                          Eliminar factura
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      {/* Overlays eliminación */}
      {deletingInvoice && deleteStep === 1 && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-10 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--card-color)] p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[#ef4444]/15 text-[#fca5a5]">
                <span className="material-symbols-outlined text-2xl" aria-hidden>warning</span>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <h3 className="text-base font-semibold leading-tight">Eliminar factura OP {deletingInvoice.op}</h3>
                <p className="text-sm text-[var(--text-secondary-color)] leading-snug">
                  Al eliminar esta factura se eliminarán también TODOS los abonos directamente asociados a ella.
                  <br />
                  Además, si algún abono fue distribuido entre varias facturas (abono multi-factura), ese abono se eliminará por completo y dejará de existir también para las otras facturas donde estaba aplicado.
                  <br />
                  Esta acción es irreversible.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#fca5a5] break-anywhere">{deleteError}</div>
            )}
            <div className="flex justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setDeletingInvoice(null); setDeleteStep(0); setDeleteError(""); }}
                className="px-4 py-2 rounded-lg bg-white/5 text-xs font-medium hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >Cancelar</button>
              <button
                type="button"
                onClick={() => setDeleteStep(2)}
                className="px-4 py-2 rounded-lg bg-[#ef4444]/20 border border-[#ef4444]/40 text-xs font-semibold text-[#fca5a5] hover:bg-[#ef4444]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444]/40"
              >Entiendo el impacto, continuar</button>
            </div>
          </div>
        </div>
      )}
      {deletingInvoice && deleteStep === 2 && (
        <DeleteFinalConfirm
          invoice={deletingInvoice}
          onCancel={() => { setDeleteStep(1); setDeleteError(""); }}
          onCloseAll={() => { setDeletingInvoice(null); setDeleteStep(0); setDeleteError(""); setDeleteSuccess(null); }}
          onDeleted={(factura) => { setDeleteSuccess(factura); setDeletingInvoice(null); setDeleteStep(0); fetchInvoices(); }}
        />
      )}
      {deleteSuccess && (
        <div className="fixed inset-0 z-[92] flex items-center justify-center px-4 py-10 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--card-color)] p-6 flex flex-col gap-4 items-center text-center shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
            <span className="material-symbols-outlined text-5xl text-[#86efac]" aria-hidden>task_alt</span>
            <p className="text-base font-semibold">Factura eliminada</p>
            <p className="text-xs text-[var(--text-secondary-color)] break-anywhere">La factura y sus abonos asociados fueron eliminados correctamente.</p>
            <button
              type="button"
              onClick={() => setDeleteSuccess(null)}
              className="mt-2 px-4 py-2 rounded-lg bg-white/10 text-xs font-medium hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >Cerrar</button>
          </div>
        </div>
      )}
      <BottomNav
        onHome={() => navigate("/dashboard")}
        onMovements={() => navigate("/movements")}
        onWallet={() => navigate("/wallet")}
        onReports={() => navigate("/reports")}
        onCreateMovement={() => navigate("/new")}
        onCashout={() => navigate("/cashout")}
        onCashoutBank={() => navigate("/cashout-bank")}
      />
    </div>
  );
}

function DeleteFinalConfirm({ invoice, onCancel, onCloseAll, onDeleted }) {
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const required = `OP ${invoice.op}`;
  const matches = input.trim().toLowerCase() === required.toLowerCase() || input.trim() === 'ELIMINAR';

  const handleDelete = async () => {
    if (!matches || loading) return;
    setLoading(true); setError("");
    try {
      const deleted = await deleteInvoice(invoice.id);
      onDeleted(deleted);
    } catch (err) {
      setError(err?.message || 'No se pudo eliminar la factura');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[91] flex items-center justify-center px-4 py-10 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--card-color)] p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[#ef4444]/15 text-[#fca5a5]">
            <span className="material-symbols-outlined text-2xl" aria-hidden>delete_forever</span>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <h3 className="text-base font-semibold leading-tight">Confirmación definitiva</h3>
            <p className="text-sm text-[var(--text-secondary-color)] leading-snug">
              Escribe <span className="font-semibold text-[#fca5a5]">ELIMINAR</span> o <span className="font-semibold text-[#fca5a5]">{required}</span> para proceder.
              Esta acción eliminará la factura, todos sus abonos y cualquier abono multi-factura involucrado.
              No se puede deshacer.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe ELIMINAR o OP ..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 placeholder:text-white/30"
          />
          <p className="text-[10px] text-white/40">Requerido: ELIMINAR o {required}</p>
        </div>
        {error && <div className="rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#fca5a5] break-anywhere">{error}</div>}
        <div className="flex justify-between flex-wrap gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-white/5 text-xs font-medium hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            disabled={loading}
          >Atrás</button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCloseAll}
              className="px-4 py-2 rounded-lg bg-white/5 text-xs font-medium hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              disabled={loading}
            >Cancelar todo</button>
            <button
              type="button"
              disabled={!matches || loading}
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg bg-[#ef4444]/25 border border-[#ef4444]/50 text-xs font-semibold text-[#fca5a5] hover:bg-[#ef4444]/35 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444]/40 inline-flex items-center gap-2"
            >
              {loading ? 'Eliminando…' : 'Eliminar definitivamente'}
              <span className="material-symbols-outlined text-sm" aria-hidden>warning</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
