import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PdfPreviewSendModal from "../components/PdfPreviewSendModal";
import Header from "../components/Header";
import Preloader from "../components/Preloader";
import useTitle from "../useTitle";
import {
  deleteInvoice,
  getClient,
  listClientInvoices,
  listInvoiceAbonos,
  listPendingClientIncomes,
  notifyInvoiceAbonos,
} from "../carteraApi";
import { generateCarteraInvoiceAbonosPdf } from "../utils/carteraInvoiceAbonosPdf";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatDate(value, withTime = false) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  });
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "CL";
}

function getInvoiceCoverage(invoice) {
  const total = Number(invoice?.valor_total || 0);
  const paid = Number(invoice?.valor_abonado || 0);
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((paid / total) * 100)));
}

function EstadoBadge({ estado }) {
  const safeState = String(estado || "").toUpperCase();
  let className = "border-white/15 bg-white/10 text-white/80";
  let icon = "flag";

  if (safeState.includes("PAG")) {
    className = "border-[#22c55e]/35 bg-[#16a34a]/15 text-[#bbf7d0]";
    icon = "task_alt";
  } else if (safeState.includes("PEND")) {
    className = "border-[#f59e0b]/35 bg-[#f59e0b]/15 text-[#fde68a]";
    icon = "schedule";
  } else if (safeState.includes("ANUL") || safeState.includes("CANC")) {
    className = "border-[#ef4444]/35 bg-[#ef4444]/15 text-[#fecaca]";
    icon = "cancel";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${className}`}>
      <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
      {estado || "—"}
    </span>
  );
}

export default function ClientInvoices() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: clientId } = useParams();
  useTitle("Facturas · ATM Ricky Rich");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [client, setClient] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [pendingIncomes, setPendingIncomes] = useState([]);
  const [deletingInvoice, setDeletingInvoice] = useState(null);
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [sendingPreview, setSendingPreview] = useState(false);
  const [notifyFeedback, setNotifyFeedback] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);

  const clientName = client?.nombre || invoices[0]?.cliente?.nombre || "Cliente";
  const clientPhone = client?.celular || invoices[0]?.cliente?.celular || "";
  const shouldHighlightPendingIncome = location.state?.highlightPendingIncome === true;

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [clientData, data, pendingData] = await Promise.all([
        getClient(clientId),
        listClientInvoices(clientId),
        listPendingClientIncomes(clientId),
      ]);
      setClient(clientData || null);
      setInvoices(Array.isArray(data) ? data : []);
      setPendingIncomes(Array.isArray(pendingData) ? pendingData : []);
    } catch (err) {
      setError(err?.message || "No se pudieron cargar las facturas.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId) fetchInvoices();
  }, [clientId, fetchInvoices]);

  useEffect(() => () => {
    if (pdfPreview?.url?.startsWith("blob:")) {
      URL.revokeObjectURL(pdfPreview.url);
    }
  }, [pdfPreview]);

  const invoiceTotals = useMemo(() => (
    invoices.reduce((acc, invoice) => {
      const total = Number(invoice.valor_total || 0);
      const paid = Number(invoice.valor_abonado || 0);
      const pending = Number(invoice.valor_pendiente || 0);
      acc.total += total;
      acc.paid += paid;
      acc.pending += pending;
      if (pending > 0) acc.pendingCount += 1;
      else acc.clearedCount += 1;
      return acc;
    }, { total: 0, paid: 0, pending: 0, pendingCount: 0, clearedCount: 0 })
  ), [invoices]);

  const pendingIncomeTotal = useMemo(
    () => pendingIncomes.reduce((sum, income) => sum + Number(income.monto || 0), 0),
    [pendingIncomes]
  );

  const clientCoverage = invoiceTotals.total > 0
    ? Math.max(0, Math.min(100, Math.round((invoiceTotals.paid / invoiceTotals.total) * 100)))
    : 0;

  const closePdfPreview = (force = false) => {
    if (sendingPreview && !force) return;
    setPdfPreview((prev) => {
      if (prev?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  };

  const handlePreviewInvoiceAbonos = async (invoiceData) => {
    if (!invoiceData?.id || previewLoadingId || sendingPreview) return;
    setNotifyFeedback(null);

    if (!clientPhone?.trim()) {
      setNotifyFeedback({
        type: "error",
        message: `No puedes enviar el detalle de abonos de la factura ${invoiceData.op || invoiceData.id} porque el cliente no tiene celular registrado.`,
      });
      return;
    }

    if (Number(invoiceData.valor_abonado || 0) <= 0) {
      setNotifyFeedback({
        type: "error",
        message: `La factura ${invoiceData.op || invoiceData.id} todavía no tiene abonos para enviar.`,
      });
      return;
    }

    setPreviewLoadingId(invoiceData.id);
    try {
      const data = await listInvoiceAbonos(invoiceData.id);
      const factura = data?.factura || invoiceData;
      const abonosData = Array.isArray(data?.abonos) ? data.abonos : [];
      if (abonosData.length === 0) {
        throw new Error(`La factura ${factura.op || factura.id} todavía no tiene abonos para enviar.`);
      }

      const facturaConCliente = {
        ...factura,
        cliente: factura?.cliente || client || invoiceData?.cliente || null,
      };
      const { blob, base64, fileName } = await generateCarteraInvoiceAbonosPdf(facturaConCliente, abonosData);
      const url = URL.createObjectURL(blob);

      setPdfPreview((prev) => {
        if (prev?.url?.startsWith("blob:")) {
          URL.revokeObjectURL(prev.url);
        }
        return {
          invoiceId: facturaConCliente.id,
          invoiceOp: facturaConCliente.op || facturaConCliente.id,
          url,
          base64,
          fileName,
          title: `Previsualización de abonos · ${facturaConCliente.op || facturaConCliente.id}`,
          subtitle: `${facturaConCliente.cliente?.nombre || clientName} · ${abonosData.length} abono(s) · WhatsApp ${facturaConCliente.cliente?.celular || clientPhone}`,
        };
      });
    } catch (err) {
      setNotifyFeedback({
        type: "error",
        message: err?.message || `No se pudo preparar el PDF de abonos de la factura ${invoiceData.op || invoiceData.id}.`,
      });
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const confirmSendInvoiceAbonos = async () => {
    if (!pdfPreview?.invoiceId || sendingPreview) return;
    setSendingPreview(true);
    setNotifyFeedback(null);
    try {
      await notifyInvoiceAbonos(pdfPreview.invoiceId, {
        pdf_base64: pdfPreview.base64,
        pdf_nombre: pdfPreview.fileName,
      });
      setNotifyFeedback({
        type: "success",
        message: `Detalle de abonos enviado correctamente por WhatsApp para la factura ${pdfPreview.invoiceOp}.`,
      });
      closePdfPreview(true);
    } catch (err) {
      setNotifyFeedback({
        type: "error",
        message: err?.message || `No se pudo enviar el detalle de abonos de la factura ${pdfPreview.invoiceOp}.`,
      });
    } finally {
      setSendingPreview(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background-color)] text-[var(--text-color)] flex flex-col">
      <Header title={`Facturas · ${clientName}`} />
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
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10"
                    onClick={() => navigate("/wallet")}
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden>arrow_back</span>
                    Volver a clientes
                  </button>

                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-white/10 bg-black/20 text-lg font-bold text-white">
                      {getInitials(clientName)}
                    </div>
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-200">
                        <span className="material-symbols-outlined text-sm" aria-hidden>receipt_long</span>
                        Cartera del cliente
                      </div>
                      <div>
                        <h2 className="break-words text-3xl font-semibold leading-tight text-white">{clientName}</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                          Gestiona facturas, crea abonos y mantén visible el avance de recuperación con accesos rápidos y alertas de caja pendientes.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {clientPhone ? (
                          <InfoChip icon="call" label={clientPhone} tone="neutral" />
                        ) : (
                          <InfoChip icon="call_missed" label="Sin celular registrado" tone="warning" />
                        )}
                        <InfoChip icon="receipt" label={`${invoices.length} factura(s)`} tone="info" />
                        {pendingIncomes.length > 0 ? (
                          <InfoChip icon="notifications_active" label={`${pendingIncomes.length} ingreso(s) por asignar`} tone="warning" />
                        ) : (
                          <InfoChip icon="task_alt" label="Sin alertas pendientes" tone="success" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ActionPanelButton
                    icon="note_add"
                    title="Crear factura"
                    description="Registra una nueva cuenta por cobrar para este cliente."
                    tone="primary"
                    onClick={() => navigate(`/wallet/client/${clientId}/invoices/new`, { state: { client } })}
                  />
                  <ActionPanelButton
                    icon="payments"
                    title="Crear abono"
                    description="Aplica un pago manual o desde un ingreso ya registrado."
                    tone="success"
                    onClick={() => navigate(`/wallet/client/${clientId}/abonos/new`, { state: { client } })}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <OverviewCard title="Facturado" value={formatCurrency(invoiceTotals.total)} icon="request_quote" tone="primary" />
                <OverviewCard title="Abonado" value={formatCurrency(invoiceTotals.paid)} icon="payments" tone="success" />
                <OverviewCard title="Pendiente" value={formatCurrency(invoiceTotals.pending)} icon="warning" tone="danger" />
                <OverviewCard
                  title="Cobertura"
                  value={`${clientCoverage}%`}
                  helper={`${invoiceTotals.clearedCount} factura(s) al día`}
                  icon="monitoring"
                  tone="neutral"
                />
              </div>

              <div className="rounded-[26px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Avance de recuperación</p>
                    <p className="text-sm text-slate-200">
                      Se ha recuperado {formatCurrency(invoiceTotals.paid)} de {formatCurrency(invoiceTotals.total)} en esta cartera.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-300">Saldo pendiente</p>
                    <p className="text-lg font-semibold text-white">{formatCurrency(invoiceTotals.pending)}</p>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#34d399)] transition-all"
                    style={{ width: `${clientCoverage}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          {notifyFeedback ? (
          <section className={`rounded-[24px] border px-4 py-3 text-sm ${
              notifyFeedback.type === "success"
                ? "border-[#22c55e]/30 bg-[#16a34a]/10 text-[#bbf7d0]"
                : "border-[#ef4444]/30 bg-[#ef4444]/10 text-[#fecaca]"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    notifyFeedback.type === "success" ? "bg-[#16a34a]/20" : "bg-[#ef4444]/15"
                  }`}>
                    <span className="material-symbols-outlined text-base" aria-hidden>
                      {notifyFeedback.type === "success" ? "check_circle" : "error"}
                    </span>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{notifyFeedback.type === "success" ? "Todo salió bien" : "Revisa este punto"}</p>
                    <p className="break-words">{notifyFeedback.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-black/10 p-1 transition hover:bg-black/20"
                  onClick={() => setNotifyFeedback(null)}
                  aria-label="Cerrar mensaje"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden>close</span>
                </button>
              </div>
            </section>
          ) : null}

          {!loading && pendingIncomes.length > 0 ? (
            <section className={`rounded-[28px] border p-5 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)] ${
              shouldHighlightPendingIncome
                ? "border-sky-400/35 bg-sky-500/10"
                : "border-sky-400/20 bg-sky-500/[0.06]"
            }`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-400/12 text-sky-200">
                    <span className="material-symbols-outlined text-2xl" aria-hidden>notifications_active</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-sky-100">Ingresos de cartera pendientes por asignar</p>
                    <p className="max-w-2xl text-sm leading-6 text-sky-50/85">
                      Estos ingresos ya impactaron la caja, pero aún no se han convertido en abonos dentro de la cartera. Desde aquí puedes asignarlos sin perder consistencia financiera.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-sky-300/20 bg-black/10 px-4 py-3 text-right">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-sky-100/70">Pendiente por vincular</p>
                  <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(pendingIncomeTotal)}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {pendingIncomes.map((income) => (
                    <article key={income.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-white">{formatCurrency(income.monto)}</p>
                        <p className="text-sm text-sky-50/85 break-anywhere">{income.descripcion || `Ingreso #${income.id}`}</p>
                        <p className="text-xs text-sky-100/65">#{income.id} · {formatDate(income.fecha, true)}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-100">
                        <span className="material-symbols-outlined text-sm" aria-hidden>account_balance</span>
                        Caja
                      </span>
                    </div>

                    <div className="mt-4">
                      {invoices.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/wallet/client/${clientId}/abonos/new?sourceTransactionId=${income.id}`, { state: { client, sourceTransaction: income } })}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-400/15 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/22"
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden>payments</span>
                          Crear abono desde este ingreso
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/wallet/client/${clientId}/invoices/new`, { state: { client } })}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-white/90 transition hover:bg-white/15"
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden>receipt_long</span>
                          Crear factura primero
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
            <div className="flex flex-col gap-4 border-b border-white/5 px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                  <span className="material-symbols-outlined text-sm" aria-hidden>inventory_2</span>
                  Facturación activa
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Resumen de facturas</h3>
                  <p className="text-sm text-[var(--text-secondary-color)]">
                    Consulta el estado, el avance de pago y comparte el detalle de abonos desde cada tarjeta.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary-color)]">
                <InfoChip icon="task_alt" label={`${invoiceTotals.clearedCount} al día`} tone="success" />
                <InfoChip icon="warning" label={`${invoiceTotals.pendingCount} con saldo`} tone="warning" />
                <InfoChip icon="payments" label={`${formatCurrency(invoiceTotals.paid)} recuperado`} tone="info" />
              </div>
            </div>

            {loading ? (
              <div className="p-6"><Preloader label="Cargando facturas..." /></div>
            ) : error ? (
              <div className="flex flex-col items-center gap-4 p-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--danger-color)]/10 text-[var(--danger-color)]">
                  <span className="material-symbols-outlined text-4xl" aria-hidden>error</span>
                </div>
                <p className="text-base font-medium">No pudimos cargar las facturas</p>
                <p className="max-w-md text-sm text-[var(--text-secondary-color)] break-anywhere">{error}</p>
                <button
                  type="button"
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/15"
                  onClick={fetchInvoices}
                >
                  Reintentar
                </button>
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center gap-4 p-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]" aria-hidden>receipt_long</span>
                </div>
                <p className="text-base font-medium">Este cliente aún no tiene facturas</p>
                <p className="max-w-md text-sm text-[var(--text-secondary-color)]">
                  Crea la primera factura para empezar a controlar saldos, abonos y estados de cuenta desde esta misma vista.
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                  onClick={() => navigate(`/wallet/client/${clientId}/invoices/new`, { state: { client } })}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden>add_circle</span>
                  Crear primera factura
                </button>
              </div>
            ) : (
              <div className="grid gap-4 p-5 xl:grid-cols-2 lg:p-6">
                {invoices.map((invoice) => {
                  const coverage = getInvoiceCoverage(invoice);
                  const createdDate = invoice.fecha || invoice.created_at;
                  const invoiceLines = Array.isArray(invoice.lineas) ? invoice.lineas : [];
                  return (
                    <article
                      key={invoice.id}
                      className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-4 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.8)] transition hover:border-white/15"
                    >
                      <div className="hidden absolute inset-x-0 top-0 h-24 bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(34,197,94,0.05),transparent)]" />
                      <div className="relative flex flex-col gap-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-4">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white">
                              <span className="material-symbols-outlined text-2xl" aria-hidden>receipt_long</span>
                            </div>
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="max-w-full break-words text-lg font-semibold">OP {invoice.op || "—"}</h4>
                                <EstadoBadge estado={invoice.estado} />
                              </div>
                              <p className="text-sm text-[var(--text-secondary-color)] break-anywhere">
                                {invoice.concepto || "Sin concepto"}
                              </p>
                              <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary-color)]">
                                <InfoChip icon="calendar_month" label={formatDate(createdDate)} tone="neutral" />
                                <InfoChip icon="payments" label={`${coverage}% recuperado`} tone="info" />
                                {invoice.odoo_pos_reference ? <InfoChip icon="storefront" label={`Pedido ${invoice.odoo_pos_reference}`} tone="info" /> : null}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <InvoiceMetric label="Valor total" value={formatCurrency(invoice.valor_total)} icon="request_quote" />
                          <InvoiceMetric label="Abonado" value={formatCurrency(invoice.valor_abonado)} icon="payments" tone="success" />
                          <InvoiceMetric label="Pendiente" value={formatCurrency(invoice.valor_pendiente)} icon="warning" tone="danger" />
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                          <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-secondary-color)]">
                            <span className="inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm" aria-hidden>monitoring</span>
                              Avance de esta factura
                            </span>
                            <span className="font-semibold text-white">{coverage}%</span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#34d399)] transition-all"
                              style={{ width: `${coverage}%` }}
                            />
                          </div>
                        </div>

                        {invoice.observaciones ? (
                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                            <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                              <span className="material-symbols-outlined text-sm" aria-hidden>sticky_note_2</span>
                              Observaciones
                            </div>
                            <p className="leading-6 break-anywhere">{invoice.observaciones}</p>
                          </div>
                        ) : null}

                        {invoiceLines.length > 0 ? (
                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                            <div className="mb-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                              <span className="material-symbols-outlined text-sm" aria-hidden>list_alt</span>
                              Detalle de conceptos
                            </div>
                            <div className="grid gap-2">
                              {invoiceLines.map((line) => (
                                <div key={line.id || `${invoice.id}-${line.concepto}`} className="grid gap-2 rounded-xl bg-black/10 px-3 py-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                                  <p className="break-words font-medium text-white/90">{line.concepto}</p>
                                  <p className="text-xs text-[var(--text-secondary-color)]">Cant. {Number(line.cantidad || 0).toLocaleString("es-CO", { maximumFractionDigits: 3 })}</p>
                                  <p className="font-semibold text-sky-100 sm:text-right">{formatCurrency(line.valor)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <InvoiceActionButton
                            icon="edit"
                            label="Editar"
                            tone="neutral"
                            onClick={() => navigate(`/wallet/client/${clientId}/invoices/${invoice.id}/edit`, { state: { client, invoice } })}
                          />
                          <InvoiceActionButton
                            icon="receipt_long"
                            label="Ver abonos"
                            tone="success"
                            onClick={() => navigate(`/wallet/client/${clientId}/invoices/${invoice.id}/abonos`, { state: { invoice } })}
                          />
                          <InvoiceActionButton
                            icon="send"
                            label={previewLoadingId === invoice.id ? "Preparando..." : "Enviar abonos"}
                            tone="info"
                            disabled={Boolean(previewLoadingId) || sendingPreview || !clientPhone?.trim() || Number(invoice.valor_abonado || 0) <= 0}
                            onClick={() => handlePreviewInvoiceAbonos(invoice)}
                          />
                          <InvoiceActionButton
                            icon="delete"
                            label="Eliminar"
                            tone="danger"
                            disabled={Boolean(deletingInvoice)}
                            onClick={() => {
                              setDeletingInvoice(invoice);
                              setDeleteStep(1);
                              setDeleteError("");
                              setDeleteSuccess(null);
                            }}
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

      {deletingInvoice && deleteStep === 1 && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-sm">
          <div className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-white/10 bg-[var(--card-color)] p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ef4444]/15 text-[#fca5a5]">
                <span className="material-symbols-outlined text-2xl" aria-hidden>warning</span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <h3 className="text-base font-semibold leading-tight">Eliminar factura OP {deletingInvoice.op}</h3>
                <p className="text-sm leading-snug text-[var(--text-secondary-color)]">
                  Al eliminar esta factura se retirarán los abonos aplicados sobre ella.
                  <br />
                  Si algún abono estaba repartido entre varias facturas, se conservarán solo los valores aplicados a las demás.
                  <br />
                  Esta acción es irreversible y puede cambiar los saldos visibles del cliente.
                </p>
              </div>
            </div>

            {deleteError ? (
              <div className="rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#fca5a5] break-anywhere">
                {deleteError}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeletingInvoice(null);
                  setDeleteStep(0);
                  setDeleteError("");
                }}
                className="rounded-lg bg-white/5 px-4 py-2 text-xs font-medium transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setDeleteStep(2)}
                className="rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/20 px-4 py-2 text-xs font-semibold text-[#fca5a5] transition hover:bg-[#ef4444]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444]/40"
              >
                Entiendo el impacto, continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingInvoice && deleteStep === 2 ? (
        <DeleteFinalConfirm
          invoice={deletingInvoice}
          onCancel={() => {
            setDeleteStep(1);
            setDeleteError("");
          }}
          onCloseAll={() => {
            setDeletingInvoice(null);
            setDeleteStep(0);
            setDeleteError("");
            setDeleteSuccess(null);
          }}
          onDeleted={(invoiceData) => {
            setDeleteSuccess(invoiceData);
            setDeletingInvoice(null);
            setDeleteStep(0);
            fetchInvoices();
          }}
        />
      ) : null}

      {deleteSuccess ? (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-sm">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[var(--card-color)] p-6 text-center shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
            <span className="material-symbols-outlined text-5xl text-[#86efac]" aria-hidden>task_alt</span>
            <p className="text-base font-semibold">Factura eliminada</p>
            <p className="text-xs text-[var(--text-secondary-color)] break-anywhere">
              La factura fue eliminada y los saldos asociados quedaron recalculados correctamente.
            </p>
            <button
              type="button"
              onClick={() => setDeleteSuccess(null)}
              className="mt-2 rounded-lg bg-white/10 px-4 py-2 text-xs font-medium transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      <PdfPreviewSendModal
        preview={pdfPreview}
        sending={sendingPreview}
        onClose={closePdfPreview}
        onConfirm={confirmSendInvoiceAbonos}
        confirmLabel="Enviar abonos por WhatsApp"
        helperText="Revisa este PDF con los abonos de la factura antes de enviarlo. Al confirmar, este mismo documento será el que reciba el cliente por WhatsApp."
      />
    </div>
  );
}

function OverviewCard({ title, value, helper, icon, tone = "neutral" }) {
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
          <p className="text-xs uppercase tracking-[0.18em] opacity-70">{title}</p>
          <p className="mt-3 break-words text-2xl font-semibold leading-tight">{value}</p>
          {helper ? <p className="mt-2 break-words text-xs opacity-75">{helper}</p> : null}
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
    success: "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.05]",
  }[tone] || "border-[var(--primary-color)]/30 bg-[var(--primary-color)]/10 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/16";

  return (
    <button
      type="button"
      className={`flex min-h-[96px] flex-col items-start justify-between rounded-[22px] border p-4 text-left transition ${toneClass}`}
      onClick={onClick}
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

function InvoiceMetric({ label, value, icon, tone = "neutral" }) {
  const valueClass = {
    neutral: "text-white",
    success: "text-[#86efac]",
    danger: "text-[#fca5a5]",
  }[tone] || "text-white";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-[var(--text-secondary-color)]" aria-hidden>{icon}</span>
        <p className="text-xs text-[var(--text-secondary-color)]">{label}</p>
      </div>
      <p className={`mt-2 break-words text-base font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function InvoiceActionButton({ icon, label, tone = "neutral", disabled = false, onClick }) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.05]",
    success: "border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.05]",
    info: "border-[var(--primary-color)]/30 bg-[var(--primary-color)]/10 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/16",
    danger: "border-[#ef4444]/30 bg-[#ef4444]/10 text-[#fca5a5] hover:bg-[#ef4444]/16",
  }[tone] || "border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.05]";

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="material-symbols-outlined text-base" aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function DeleteFinalConfirm({ invoice, onCancel, onCloseAll, onDeleted }) {
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const required = `OP ${invoice.op}`;
  const matches = input.trim().toLowerCase() === required.toLowerCase() || input.trim() === "ELIMINAR";

  const handleDelete = async () => {
    if (!matches || loading) return;
    setLoading(true);
    setError("");
    try {
      const deleted = await deleteInvoice(invoice.id);
      onDeleted(deleted);
    } catch (err) {
      setError(err?.message || "No se pudo eliminar la factura");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[91] flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-white/10 bg-[var(--card-color)] p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ef4444]/15 text-[#fca5a5]">
            <span className="material-symbols-outlined text-2xl" aria-hidden>delete_forever</span>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <h3 className="text-base font-semibold leading-tight">Confirmación definitiva</h3>
            <p className="text-sm leading-snug text-[var(--text-secondary-color)]">
              Escribe <span className="font-semibold text-[#fca5a5]">ELIMINAR</span> o <span className="font-semibold text-[#fca5a5]">{required}</span> para proceder.
              Esta acción eliminará la factura y retirará los abonos aplicados sobre ella.
              No se puede deshacer.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Escribe ELIMINAR o OP ..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          />
          <p className="text-[10px] text-white/40">Requerido: ELIMINAR o {required}</p>
        </div>

        {error ? (
          <div className="rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#fca5a5] break-anywhere">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-between gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-white/5 px-4 py-2 text-xs font-medium transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            disabled={loading}
          >
            Atrás
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCloseAll}
              className="rounded-lg bg-white/5 px-4 py-2 text-xs font-medium transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              disabled={loading}
            >
              Cancelar todo
            </button>
            <button
              type="button"
              disabled={!matches || loading}
              onClick={handleDelete}
              className="inline-flex items-center gap-2 rounded-lg border border-[#ef4444]/50 bg-[#ef4444]/25 px-4 py-2 text-xs font-semibold text-[#fca5a5] transition hover:bg-[#ef4444]/35 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444]/40"
            >
              {loading ? "Eliminando…" : "Eliminar definitivamente"}
              <span className="material-symbols-outlined text-sm" aria-hidden>warning</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
