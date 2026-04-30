import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import Preloader from "../components/Preloader";
import useTitle from "../useTitle";
import { deleteAbono, listInvoiceAbonos } from "../carteraApi";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getCoverage(invoice) {
  const total = Number(invoice?.valor_total || 0);
  const paid = Number(invoice?.valor_abonado || 0);
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((paid / total) * 100)));
}

export default function InvoiceAbonos() {
  const navigate = useNavigate();
  const { clientId, invoiceId } = useParams();
  const location = useLocation();
  const [invoice, setInvoice] = useState(location.state?.invoice || null);
  const [abonos, setAbonos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  useTitle("Abonos de factura · ATM");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listInvoiceAbonos(invoiceId);
      setInvoice(data?.factura || null);
      setAbonos(Array.isArray(data?.abonos) ? data.abonos : []);
    } catch (err) {
      setError(err?.message || "No se pudieron cargar los abonos.");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(() => (
    abonos.reduce((acc, abono) => {
      acc.applied += Number(abono.valor_aplicado || abono.monto_total || 0);
      acc.total += Number(abono.monto_total || 0);
      if (abono.soporte?.url) acc.withSupport += 1;
      if (abono.origen_transaccion_id) acc.fromCash += 1;
      return acc;
    }, { applied: 0, total: 0, withSupport: 0, fromCash: 0 })
  ), [abonos]);

  const handleDelete = async (abono) => {
    const confirmed = window.confirm(`¿Eliminar el abono de ${formatCurrency(abono.monto_total)}?`);
    if (!confirmed) return;
    setDeletingId(abono.id);
    try {
      await deleteAbono(abono.id);
      await loadData();
    } catch (err) {
      window.alert(err?.message || "No se pudo eliminar el abono.");
    } finally {
      setDeletingId(null);
    }
  };

  const invoiceCoverage = getCoverage(invoice);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background-color)] text-[var(--text-color)]">
      <Header title="Abonos de factura" />
      <main className="flex-1 overflow-y-auto px-3 pt-4 pb-8 lg:px-5 lg:pt-6 xl:px-6 view-enter view-enter-active">
        <div className="flex w-full flex-col gap-5 pb-8">
          <section className="relative overflow-hidden rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-5 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)] lg:p-6">
            <div className="hidden pointer-events-none absolute inset-0">
              <div className="absolute -top-24 right-[-8%] h-64 w-64 rounded-full bg-[#0ea5e9]/14 blur-3xl" />
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

                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-200">
                      <span className="material-symbols-outlined text-sm" aria-hidden>payments</span>
                      Historial de abonos
                    </div>
                    <div>
                      <h2 className="break-words text-3xl font-semibold leading-tight text-white">OP {invoice?.op || invoiceId || "—"}</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                        Revisa todos los pagos aplicados a esta factura, sus soportes, referencias y el origen de cada movimiento.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <InfoChip icon="description" label={invoice?.concepto || "Sin concepto"} tone="neutral" />
                      <InfoChip icon="payments" label={`${abonos.length} abono(s)`} tone="info" />
                      {invoice?.valor_pendiente > 0 ? (
                        <InfoChip icon="warning" label={`${formatCurrency(invoice?.valor_pendiente)} pendientes`} tone="warning" />
                      ) : (
                        <InfoChip icon="task_alt" label="Factura al día" tone="success" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ActionPanelButton
                    icon="add_card"
                    title="Crear abono"
                    description="Aplica un nuevo pago a esta factura o a varias si corresponde."
                    tone="primary"
                    onClick={() => navigate(`/wallet/client/${clientId}/abonos/new`, { state: { client: invoice?.cliente } })}
                  />
                  <ActionPanelButton
                    icon="receipt_long"
                    title="Volver a cartera"
                    description="Regresa al listado de facturas del cliente para seguir gestionando."
                    tone="neutral"
                    onClick={() => navigate(`/wallet/client/${clientId}/invoices`)}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <HeroMetric title="Valor total" value={formatCurrency(invoice?.valor_total || 0)} icon="request_quote" tone="primary" />
                <HeroMetric title="Abonado" value={formatCurrency(invoice?.valor_abonado || 0)} icon="payments" tone="success" />
                <HeroMetric title="Pendiente" value={formatCurrency(invoice?.valor_pendiente || 0)} icon="warning" tone="danger" />
                <HeroMetric title="Cobertura" value={`${invoiceCoverage}%`} icon="monitoring" tone="neutral" />
              </div>

              <div className="rounded-[26px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Lectura rápida</p>
                    <p className="text-sm text-slate-200">
                      Esta factura ha recibido {formatCurrency(totals.applied)} distribuidos en {abonos.length} abono(s).
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <InfoChip icon="image" label={`${totals.withSupport} con soporte`} tone="info" />
                    <InfoChip icon="account_balance" label={`${totals.fromCash} desde caja`} tone="success" />
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#34d399)] transition-all"
                    style={{ width: `${invoiceCoverage}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
            <div className="flex flex-col gap-4 border-b border-white/5 px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary-color)]">Movimientos aplicados</p>
                <h3 className="text-xl font-semibold">Detalle de abonos</h3>
                <p className="text-sm text-[var(--text-secondary-color)]">
                  Desde aquí puedes revisar soportes, editar datos del pago o eliminarlo si fue registrado por error.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <InfoChip icon="payments" label={`${formatCurrency(totals.total)} total recibido`} tone="info" />
                <InfoChip icon="task_alt" label={`${abonos.length} registros`} tone="success" />
              </div>
            </div>

            {loading ? (
              <div className="p-6"><Preloader label="Cargando abonos..." /></div>
            ) : error ? (
              <div className="flex flex-col items-center gap-4 p-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--danger-color)]/10 text-[var(--danger-color)]">
                  <span className="material-symbols-outlined text-4xl" aria-hidden>error</span>
                </div>
                <p className="text-base font-medium">No pudimos cargar los abonos</p>
                <p className="max-w-md text-sm text-[var(--text-secondary-color)] break-anywhere">{error}</p>
                <button
                  type="button"
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/15"
                  onClick={loadData}
                >
                  Reintentar
                </button>
              </div>
            ) : abonos.length === 0 ? (
              <div className="flex flex-col items-center gap-4 p-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]" aria-hidden>payments</span>
                </div>
                <p className="text-base font-medium">Esta factura aún no tiene abonos</p>
                <p className="max-w-md text-sm text-[var(--text-secondary-color)]">
                  Cuando registres un pago aplicado a esta factura, aparecerá aquí con su fecha, método y soporte.
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                  onClick={() => navigate(`/wallet/client/${clientId}/abonos/new`, { state: { client: invoice?.cliente } })}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden>add_circle</span>
                  Crear primer abono
                </button>
              </div>
            ) : (
              <div className="grid gap-4 p-5 xl:grid-cols-2 lg:p-6">
                {abonos.map((abono) => {
                  const appliedValue = Number(abono.valor_aplicado || abono.monto_total || 0);
                  const totalValue = Number(abono.monto_total || 0);
                  return (
                    <article
                      key={abono.id}
                      className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-4 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.8)] transition hover:border-white/15"
                    >
                      <div className="hidden absolute inset-x-0 top-0 h-24 bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(34,197,94,0.05),transparent)]" />
                      <div className="relative flex flex-col gap-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-4">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white">
                              <span className="material-symbols-outlined text-2xl" aria-hidden>payments</span>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xl font-semibold">{formatCurrency(appliedValue)}</p>
                              <p className="text-sm text-[var(--text-secondary-color)]">
                                {abono.metodo_pago || "Sin método"} · {formatDate(abono.fecha_pago || abono.created_at)}
                              </p>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {abono.referencia ? <InfoChip icon="tag" label={abono.referencia} tone="neutral" /> : null}
                                {abono.origen_transaccion_id ? <InfoChip icon="account_balance" label={`Ingreso #${abono.origen_transaccion_id}`} tone="success" /> : null}
                                {abono.soporte?.url ? <InfoChip icon="image" label="Con soporte" tone="info" /> : null}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">Pago completo</p>
                            <p className="mt-1 text-base font-semibold text-white">{formatCurrency(totalValue)}</p>
                          </div>
                        </div>

                        {abono.observaciones ? (
                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                            <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                              <span className="material-symbols-outlined text-sm" aria-hidden>sticky_note_2</span>
                              Observaciones
                            </div>
                            <p className="leading-6 break-anywhere">{abono.observaciones}</p>
                          </div>
                        ) : null}

                        {Array.isArray(abono.distribucion) && abono.distribucion.length > 1 ? (
                          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                              <span className="material-symbols-outlined text-sm" aria-hidden>splitscreen</span>
                              Distribución del abono
                            </div>
                            <div className="space-y-2 text-sm">
                              {abono.distribucion.map((item) => (
                                <div key={`${abono.id}-${item.factura_id}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                                  <span className="text-white/70">OP {item.factura?.op || item.factura_id}</span>
                                  <span className="font-semibold">{formatCurrency(item.valor)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-2 sm:grid-cols-3">
                          {abono.soporte?.url ? (
                            <ActionButton
                              as="a"
                              href={abono.soporte.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              icon="image"
                              label="Ver soporte"
                              tone="info"
                            />
                          ) : (
                            <ActionButton icon="hide_image" label="Sin soporte" tone="muted" disabled />
                          )}
                          <ActionButton
                            icon="edit"
                            label="Editar"
                            tone="neutral"
                            onClick={() => navigate(`/wallet/client/${clientId}/abonos/${abono.id}/edit`, { state: { client: invoice?.cliente, abono } })}
                          />
                          <ActionButton
                            icon="delete"
                            label={deletingId === abono.id ? "Eliminando..." : "Eliminar"}
                            tone="danger"
                            disabled={deletingId === abono.id}
                            onClick={() => handleDelete(abono)}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function HeroMetric({ title, value, icon, tone = "neutral" }) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.03] text-white",
    primary: "border-white/10 bg-white/[0.03] text-white",
    success: "border-white/10 bg-white/[0.03] text-white",
    danger: "border-white/10 bg-white/[0.03] text-white",
  }[tone] || "border-white/10 bg-white/[0.03] text-white";

  return (
    <div className={`rounded-[24px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] opacity-70">{title}</p>
          <p className="mt-3 break-words text-lg font-semibold leading-tight">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04]">
          <span className="material-symbols-outlined text-xl opacity-80" aria-hidden>{icon}</span>
        </div>
      </div>
    </div>
  );
}

function InfoChip({ icon, label, tone = "neutral" }) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.03] text-slate-200",
    success: "border-white/10 bg-white/[0.03] text-slate-200",
    warning: "border-white/10 bg-white/[0.03] text-slate-200",
    info: "border-white/10 bg-white/[0.03] text-slate-200",
  }[tone] || "border-white/10 bg-white/[0.03] text-slate-200";

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 break-words ${toneClass}`}>
      <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function ActionPanelButton({ icon, title, description, tone = "primary", onClick }) {
  const toneClass = {
    primary: "border-[var(--primary-color)]/30 bg-[var(--primary-color)]/10 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/16",
    neutral: "border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.05]",
  }[tone] || "border-[var(--primary-color)]/30 bg-[var(--primary-color)]/10 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/16";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[96px] flex-col items-start justify-between rounded-[22px] border p-4 text-left transition ${toneClass}`}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/15">
        <span className="material-symbols-outlined text-2xl" aria-hidden>{icon}</span>
      </div>
      <div>
        <p className="break-words text-sm font-semibold">{title}</p>
        <p className="mt-1 break-words text-xs leading-5 opacity-80">{description}</p>
      </div>
    </button>
  );
}

function ActionButton({ as = "button", icon, label, tone = "neutral", disabled = false, ...props }) {
  const Component = as;
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.05]",
    info: "border-[var(--primary-color)]/30 bg-[var(--primary-color)]/10 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/16",
    danger: "border-[#ef4444]/30 bg-[#ef4444]/10 text-[#fca5a5] hover:bg-[#ef4444]/16",
    muted: "border-white/10 bg-white/[0.03] text-white/40",
  }[tone] || "border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.05]";

  return (
    <Component
      {...props}
      type={Component === "button" ? "button" : undefined}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}
    >
      <span className="material-symbols-outlined text-base" aria-hidden>{icon}</span>
      {label}
    </Component>
  );
}
