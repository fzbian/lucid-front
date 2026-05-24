import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import Preloader from "../components/Preloader";
import useTitle from "../useTitle";
import { createInvoice, getClient, getInvoice, listBodegaOdooOrders, updateInvoice } from "../carteraApi";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
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

function createEmptyLine() {
  return { concepto: "", cantidad: "1", valor: "" };
}

function getLineCantidad(line) {
  const cantidad = Number(line?.cantidad || 0);
  return Number.isFinite(cantidad) ? cantidad : 0;
}

function getLineUnitValue(line) {
  const value = Number(line?.valor || 0);
  return Number.isFinite(value) ? value : 0;
}

function getLineTotal(line) {
  return getLineCantidad(line) * getLineUnitValue(line);
}

function toLineFormValue(line) {
  const cantidad = Number(line?.cantidad || 1);
  const total = Number(line?.valor || 0);
  const unitValue = Number(line?.valor_unitario || 0);
  const derivedUnitValue = cantidad > 0 ? total / cantidad : total;
  return {
    concepto: line?.concepto || "",
    cantidad: String(cantidad || 1),
    valor: String(unitValue > 0 ? unitValue : derivedUnitValue),
  };
}

function buildInvoiceLines(invoiceData) {
  const savedLines = Array.isArray(invoiceData?.lineas) ? invoiceData.lineas : [];
  if (savedLines.length > 0) {
    return savedLines.map(toLineFormValue);
  }
  if (Number(invoiceData?.valor_total || 0) > 0 || invoiceData?.concepto) {
    return [{
      concepto: invoiceData?.concepto || "",
      cantidad: "1",
      valor: String(Number(invoiceData?.valor_total || 0)),
    }];
  }
  return [createEmptyLine()];
}

function formatQty(value) {
  const qty = Number(value || 0);
  return qty.toLocaleString("es-CO", {
    minimumFractionDigits: Number.isInteger(qty) ? 0 : 2,
    maximumFractionDigits: 3,
  });
}

function extractOdooClientName(note) {
  const raw = String(note || "");
  const match = raw.match(/cliente\s*:\s*([^\n\r]+)/i);
  if (!match) return "";
  return match[1].trim().replace(/^\((.*)\)$/, "$1").trim();
}

function getOdooOrderRef(order) {
  return String(order?.pos_reference || order?.name || order?.id || "").trim();
}

function buildLinesFromOdooOrder(order) {
  const sourceLines = Array.isArray(order?.lines_detail) ? order.lines_detail : [];
  const lines = sourceLines
    .map((line) => {
      const qty = Number(line?.qty || 0);
      const unitPrice = Number(line?.price_unit || 0);
      const subtotal = Number(line?.subtotal_incl || line?.subtotal || 0);
      const value = unitPrice > 0 ? unitPrice : (qty > 0 ? subtotal / qty : subtotal);
      return {
        concepto: String(line?.product_name || line?.name || "Producto").trim(),
        cantidad: String(qty || 1),
        valor: String(Math.round(value || 0)),
      };
    })
    .filter((line) => line.concepto && Number(line.valor || 0) > 0);

  if (lines.length > 0) return lines;

  const fallbackValue = Number(order?.amount_total || order?.amount_paid || 0);
  return [{
    concepto: `Pedido Bodega ${getOdooOrderRef(order) || order?.id || ""}`.trim(),
    cantidad: "1",
    valor: String(Math.round(fallbackValue || 0)),
  }];
}

export default function CreateInvoiceWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: clientId, invoiceId } = useParams();
  const editing = Boolean(invoiceId);

  useTitle(editing ? "Editar factura · ATM" : "Crear factura · ATM");

  const [client, setClient] = useState(location.state?.client || null);
  const [invoice, setInvoice] = useState(location.state?.invoice || null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [concepto, setConcepto] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [mode, setMode] = useState("manual");
  const [lineas, setLineas] = useState([createEmptyLine()]);
  const [odooSearch, setOdooSearch] = useState("");
  const [odooOrders, setOdooOrders] = useState([]);
  const [odooTotal, setOdooTotal] = useState(0);
  const [odooLoading, setOdooLoading] = useState(false);
  const [odooError, setOdooError] = useState("");
  const [selectedOdooOrder, setSelectedOdooOrder] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const stateClient = location.state?.client || null;
    const stateInvoice = location.state?.invoice || null;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const tasks = [stateClient ? Promise.resolve(stateClient) : getClient(clientId)];
        if (editing) {
          tasks.push(stateInvoice ? Promise.resolve(stateInvoice) : getInvoice(invoiceId));
        }
        const [clientData, invoiceData] = await Promise.all(tasks);
        if (cancelled) return;
        setClient(clientData || null);
        if (invoiceData) {
          setInvoice(invoiceData);
          setConcepto(invoiceData.concepto || "");
          setValorTotal(String(Number(invoiceData.valor_total || 0)));
          setObservaciones(invoiceData.observaciones || "");
          setMode(invoiceData.origen === "odoo_bodega" ? "odoo" : "manual");
          setLineas(buildInvoiceLines(invoiceData));
          setOdooSearch(invoiceData.odoo_pos_reference || "");
          setSelectedOdooOrder(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "No se pudieron cargar los datos de la factura.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clientId, editing, invoiceId, location.state]);

  const lineasTotal = useMemo(() => (
    lineas.reduce((acc, line) => acc + getLineTotal(line), 0)
  ), [lineas]);
  const valorNumber = useMemo(() => Number(lineasTotal || valorTotal || 0), [lineasTotal, valorTotal]);
  const paidAmount = Number(invoice?.valor_abonado || 0);
  const pendingAmount = Number(invoice?.valor_pendiente || Math.max(valorNumber - paidAmount, 0));

  const loadOdooOrders = async () => {
    if (odooLoading) return;
    setOdooLoading(true);
    setOdooError("");
    try {
      const result = await listBodegaOdooOrders({ search: odooSearch, limit: 20 });
      setOdooOrders(result.data);
      setOdooTotal(result.total);
    } catch (err) {
      setOdooError(err?.message || "No se pudieron cargar los pedidos de Bodega.");
    } finally {
      setOdooLoading(false);
    }
  };

  const handleSelectOdooOrder = (order) => {
    const orderRef = getOdooOrderRef(order);
    const clientName = extractOdooClientName(order?.note);
    const nextLines = buildLinesFromOdooOrder(order);
    const nextTotal = nextLines.reduce((acc, line) => acc + getLineTotal(line), 0);

    setSelectedOdooOrder(order);
    setLineas(nextLines);
    setValorTotal(String(nextTotal));
    setConcepto(`Pedido Bodega ${orderRef || order?.id || ""}`.trim());
    if (clientName && !observaciones.trim()) {
      setObservaciones(`Cliente Odoo: ${clientName}`);
    }
  };

  const updateLine = (index, field, value) => {
    setLineas((current) => current.map((line, lineIndex) => (
      lineIndex === index ? { ...line, [field]: value } : line
    )));
  };

  const addLine = () => {
    setLineas((current) => [...current, createEmptyLine()]);
  };

  const removeLine = (index) => {
    setLineas((current) => {
      const next = current.filter((_, lineIndex) => lineIndex !== index);
      return next.length > 0 ? next : [createEmptyLine()];
    });
  };

  const buildSubmitLines = () => {
    return lineas
      .map((line) => ({
        concepto: String(line?.concepto || "").trim(),
        cantidad: Number(line?.cantidad || 0),
        valor_unitario: Number(line?.valor || 0),
        valor: Number(line?.cantidad || 0) * Number(line?.valor || 0),
      }))
      .filter((line) => line.concepto || line.cantidad || line.valor);
  };

  const handleSubmit = async () => {
    if (saving) return;
    const conceptoLimpio = concepto.trim();
    const observacionesLimpias = observaciones.trim();
    if (!conceptoLimpio) {
      window.alert("El concepto es obligatorio.");
      return;
    }
    if (conceptoLimpio.length > 120) {
      window.alert("El concepto no puede superar los 120 caracteres.");
      return;
    }
    if (!(valorNumber > 0)) {
      window.alert("El valor de la factura debe ser mayor a 0.");
      return;
    }
    if (observacionesLimpias.length > 300) {
      window.alert("Las observaciones no pueden superar los 300 caracteres.");
      return;
    }
    const submitLines = buildSubmitLines();
    if (submitLines.length === 0) {
      window.alert("Agrega al menos una línea con concepto, cantidad y valor.");
      return;
    }
    for (let index = 0; index < submitLines.length; index += 1) {
      const line = submitLines[index];
      if (!line.concepto) {
        window.alert(`El concepto de la línea ${index + 1} es obligatorio.`);
        return;
      }
      if (!(line.cantidad > 0)) {
        window.alert(`La cantidad de la línea ${index + 1} debe ser mayor a 0.`);
        return;
      }
      if (!(line.valor > 0)) {
        window.alert(`El valor de la línea ${index + 1} debe ser mayor a 0.`);
        return;
      }
    }
    const submitTotal = submitLines.reduce((acc, line) => acc + (Number(line.cantidad || 0) * Number(line.valor || 0)), 0);
    if (!(submitTotal > 0)) {
      window.alert("El valor de la factura debe ser mayor a 0.");
      return;
    }

    setSaving(true);
    try {
      const odooOrder = selectedOdooOrder || (mode === "odoo" ? invoice : null);
      const odooRef = selectedOdooOrder ? getOdooOrderRef(selectedOdooOrder) : invoice?.odoo_pos_reference;
      const odooClientName = selectedOdooOrder
        ? extractOdooClientName(selectedOdooOrder?.note)
        : invoice?.odoo_cliente_nombre;
      const payload = {
        concepto: conceptoLimpio,
        valor_total: submitTotal,
        observaciones: observacionesLimpias,
        lineas: submitLines,
        origen: mode === "odoo" && odooRef ? "odoo_bodega" : "manual",
        odoo_pos_order_id: mode === "odoo" ? Number(odooOrder?.id || odooOrder?.odoo_pos_order_id || 0) || null : null,
        odoo_pos_reference: mode === "odoo" ? String(odooRef || "") : "",
        odoo_pos_name: mode === "odoo" ? String(odooOrder?.local_name || odooOrder?.odoo_pos_name || "Bodega") : "",
        odoo_cliente_nombre: mode === "odoo" ? String(odooClientName || "") : "",
      };
      if (editing) {
        await updateInvoice(invoiceId, payload);
      } else {
        await createInvoice(clientId, payload);
      }
      navigate(`/wallet/client/${clientId}/invoices`, { replace: true });
    } catch (err) {
      window.alert(err?.message || "No se pudo guardar la factura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background-color)] text-[var(--text-color)]">
      <Header title={editing ? "Editar factura" : "Crear factura"} />
      <main className="flex-1 overflow-y-auto px-3 pt-4 pb-8 lg:px-5 lg:pt-6 xl:px-6 view-enter view-enter-active">
        <div className="flex w-full flex-col gap-5 pb-8">
          {loading ? (
            <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-8 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
              <Preloader label="Cargando información..." />
            </section>
          ) : error ? (
            <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-8 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--danger-color)]/10 text-[var(--danger-color)]">
                  <span className="material-symbols-outlined text-4xl" aria-hidden>error</span>
                </div>
                <div className="space-y-1">
                  <p className="text-base font-medium">No pudimos abrir el formulario</p>
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
            <>
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
                            <span className="material-symbols-outlined text-sm" aria-hidden>receipt_long</span>
                            {editing ? "Edición de factura" : "Nueva factura"}
                          </div>
                          <div>
                            <h2 className="break-words text-3xl font-semibold leading-tight text-white">
                              {editing ? `Actualizar ${invoice?.op || "factura"}` : "Registrar nueva factura"}
                            </h2>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                              Define claramente el concepto, el monto y las notas relevantes para que el seguimiento de cartera sea mucho más claro desde el primer momento.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <Pill icon="person" label={client?.nombre || `Cliente ${clientId}`} tone="neutral" />
                            {editing && invoice?.op ? <Pill icon="tag" label={`Factura ${invoice.op}`} tone="info" /> : null}
                            <Pill icon="schedule" label={editing ? "Modo edición" : "Modo creación"} tone={editing ? "warning" : "success"} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[440px]">
                      <HeroMetric title="Valor total" value={formatCurrency(valorNumber)} icon="request_quote" tone="primary" />
                      <HeroMetric title="Abonado" value={formatCurrency(paidAmount)} icon="payments" tone="success" />
                      <HeroMetric title="Pendiente" value={formatCurrency(Math.max(pendingAmount, 0))} icon="warning" tone="danger" />
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-5 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)] lg:p-6">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary-color)]">Datos principales</p>
                    <h3 className="text-xl font-semibold">Completa la factura</h3>
                    <p className="text-sm text-[var(--text-secondary-color)]">
                      Todo lo que registres aquí quedará visible en la cartera del cliente y en sus estados de cuenta.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4">
                    <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMode("manual");
                          setSelectedOdooOrder(null);
                        }}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${mode === "manual" ? "bg-white/10 text-white" : "text-[var(--text-secondary-color)] hover:bg-white/5 hover:text-white"}`}
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden>edit_note</span>
                        Líneas arbitrarias
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("odoo")}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${mode === "odoo" ? "bg-white/10 text-white" : "text-[var(--text-secondary-color)] hover:bg-white/5 hover:text-white"}`}
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden>storefront</span>
                        Pedido Odoo Bodega
                      </button>
                    </div>

                    {mode === "odoo" ? (
                      <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <label className="flex flex-1 flex-col gap-1.5 text-sm">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary-color)]">
                              <span className="material-symbols-outlined text-sm" aria-hidden>search</span>
                              Buscar pedido
                            </span>
                            <input
                              value={odooSearch}
                              placeholder="Referencia POS o nombre en nota"
                              onChange={(event) => setOdooSearch(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  loadOdooOrders();
                                }
                              }}
                              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary-color)]/50 focus:bg-white/[0.05]"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={loadOdooOrders}
                            disabled={odooLoading}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-400/35 bg-sky-400/12 px-4 py-3 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/18 disabled:opacity-40 sm:self-end"
                          >
                            {odooLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden /> : <span className="material-symbols-outlined text-base" aria-hidden>travel_explore</span>}
                            Buscar
                          </button>
                        </div>

                        {odooError ? (
                          <div className="mt-3 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#fca5a5] break-anywhere">
                            {odooError}
                          </div>
                        ) : null}

                        {selectedOdooOrder || invoice?.odoo_pos_reference ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <Pill icon="tag" label={`Pedido ${selectedOdooOrder ? getOdooOrderRef(selectedOdooOrder) : invoice?.odoo_pos_reference}`} tone="info" />
                            {(selectedOdooOrder?.note || invoice?.odoo_cliente_nombre) ? (
                              <Pill icon="person" label={extractOdooClientName(selectedOdooOrder?.note) || invoice?.odoo_cliente_nombre || "Cliente en nota"} tone="neutral" />
                            ) : null}
                          </div>
                        ) : null}

                        {odooOrders.length > 0 ? (
                          <div className="mt-4 grid gap-3">
                            {odooOrders.map((order) => {
                              const ref = getOdooOrderRef(order);
                              const clientFromNote = extractOdooClientName(order?.note);
                              const selected = selectedOdooOrder?.id === order.id;
                              return (
                                <button
                                  key={order.id}
                                  type="button"
                                  onClick={() => handleSelectOdooOrder(order)}
                                  className={`rounded-2xl border p-4 text-left transition ${selected ? "border-sky-300/60 bg-sky-400/12" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"}`}
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="break-words text-sm font-semibold text-white">Pedido {ref || order.id}</p>
                                      <p className="mt-1 text-xs text-[var(--text-secondary-color)] break-words">
                                        {clientFromNote || order?.customer_name || "Cliente sin identificar"}
                                      </p>
                                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary-color)]">
                                        <span>{order?.local_name || "Bodega"}</span>
                                        <span>{Number(order?.items_count || 0)} línea(s)</span>
                                      </div>
                                    </div>
                                    <div className="text-sm font-semibold text-sky-100 sm:text-right">
                                      {formatCurrency(order?.amount_total || 0)}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                            {odooTotal > odooOrders.length ? (
                              <p className="text-xs text-[var(--text-secondary-color)]">{odooOrders.length} de {odooTotal} pedidos encontrados</p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <FormField
                      label="Concepto general"
                      icon="description"
                      value={concepto}
                      placeholder={mode === "odoo" ? "Ej. Pedido Bodega 0001-001-0001" : "Ej. Suministros enero"}
                      helpText="Resumen corto de la factura."
                      maxLength={120}
                      onChange={(event) => setConcepto(event.target.value)}
                    />

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-medium text-[var(--text-secondary-color)]">Detalle de conceptos</p>
                          <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(valorNumber)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={addLine}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold transition hover:bg-white/10"
                        >
                          <span className="material-symbols-outlined text-sm" aria-hidden>add</span>
                          Agregar línea
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3">
                        {lineas.map((line, index) => (
                          <div key={index} className="grid gap-3 rounded-2xl border border-white/8 bg-black/10 p-3 lg:grid-cols-[1fr_120px_160px_42px]">
                            <label className="flex flex-col gap-1.5 text-sm">
                              <span className="text-[11px] font-medium text-[var(--text-secondary-color)]">Concepto</span>
                              <input
                                value={line.concepto}
                                placeholder="Producto o concepto"
                                maxLength={255}
                                onChange={(event) => updateLine(index, "concepto", event.target.value)}
                                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary-color)]/50"
                              />
                            </label>
                            <label className="flex flex-col gap-1.5 text-sm">
                              <span className="text-[11px] font-medium text-[var(--text-secondary-color)]">Cantidad</span>
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={line.cantidad}
                                onChange={(event) => updateLine(index, "cantidad", event.target.value)}
                                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary-color)]/50"
                              />
                            </label>
                            <label className="flex flex-col gap-1.5 text-sm">
                              <span className="text-[11px] font-medium text-[var(--text-secondary-color)]">Valor unitario</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={line.valor}
                                onChange={(event) => {
                                  updateLine(index, "valor", event.target.value);
                                  setValorTotal("");
                                }}
                                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary-color)]/50"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => removeLine(index)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[var(--text-secondary-color)] transition hover:bg-[#ef4444]/10 hover:text-[#fca5a5] lg:self-end"
                              title="Eliminar línea"
                            >
                              <span className="material-symbols-outlined text-base" aria-hidden>delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <TextAreaField
                      label="Observaciones"
                      icon="sticky_note_2"
                      value={observaciones}
                      placeholder="Notas adicionales de la factura"
                      helpText="Úsalo para acuerdos, aclaraciones o contexto del cobro."
                      maxLength={300}
                      onChange={(event) => setObservaciones(event.target.value)}
                    />
                  </div>

                  <div className="mt-6 flex flex-wrap justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/wallet/client/${clientId}/invoices`)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden>arrow_back</span>
                      Volver a facturas
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[var(--primary-color)]/45 bg-[var(--primary-color)]/18 px-5 py-3 text-sm font-semibold text-[var(--primary-color)] transition hover:bg-[var(--primary-color)]/25 disabled:opacity-40"
                    >
                      {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden /> : null}
                      {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear factura"}
                    </button>
                  </div>
                </section>

                <aside className="flex flex-col gap-5">
                  <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-5 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary-color)]">Vista previa</p>
                      <h3 className="text-lg font-semibold">Así se verá en cartera</h3>
                    </div>

                    <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                            {editing && invoice?.op ? invoice.op : "Nueva factura"}
                          </p>
                          <p className="mt-2 break-words text-lg font-semibold">{concepto.trim() || "Sin concepto aún"}</p>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/15">
                          <span className="material-symbols-outlined text-2xl text-white" aria-hidden>receipt_long</span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <MiniMetric label="Total" value={formatCurrency(valorNumber)} tone="primary" />
                        <MiniMetric label="Pendiente" value={formatCurrency(Math.max(pendingAmount, 0))} tone="danger" />
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-slate-300">
                        <div className="mb-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                          <span className="material-symbols-outlined text-sm" aria-hidden>list_alt</span>
                          Líneas
                        </div>
                        <div className="grid gap-2">
                          {lineas.filter((line) => line.concepto || line.valor).slice(0, 5).map((line, index) => (
                            <div key={`${line.concepto}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-black/10 px-3 py-2">
                              <div className="min-w-0">
                                <p className="break-words font-medium text-white/90">{line.concepto || "Sin concepto"}</p>
                                <p className="text-xs text-[var(--text-secondary-color)]">Cantidad {formatQty(line.cantidad)}</p>
                              </div>
                              <p className="shrink-0 text-right font-semibold text-sky-100">{formatCurrency(getLineTotal(line))}</p>
                            </div>
                          ))}
                          {lineas.filter((line) => line.concepto || line.valor).length === 0 ? (
                            <p className="text-sm text-[var(--text-secondary-color)]">Sin líneas aún</p>
                          ) : null}
                        </div>
                      </div>

                      {observaciones.trim() ? (
                        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-slate-300">
                          <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                            <span className="material-symbols-outlined text-sm" aria-hidden>sticky_note_2</span>
                            Observaciones
                          </div>
                          <p className="leading-6 break-anywhere">{observaciones}</p>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-5 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary-color)]">Buenas prácticas</p>
                      <HintRow icon="inventory_2" text="Usa un concepto específico para que el cliente y tu equipo entiendan el origen del cobro." />
                      <HintRow icon="rule" text="Mantén el valor real de la obligación para que los abonos y estados de cuenta sean confiables." />
                      <HintRow icon="chat" text="Si existe un acuerdo con el cliente, déjalo en observaciones para facilitar el seguimiento." />
                    </div>
                  </section>
                </aside>
              </div>
            </>
          )}
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

function Pill({ icon, label, tone = "neutral" }) {
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

function FormField({ label, icon, helpText, ...props }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary-color)]">
        <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
        {label}
      </span>
      <input
        {...props}
        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary-color)]/50 focus:bg-white/[0.05]"
      />
      {helpText ? <span className="text-[11px] text-[var(--text-secondary-color)]">{helpText}</span> : null}
    </label>
  );
}

function TextAreaField({ label, icon, helpText, ...props }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary-color)]">
        <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
        {label}
      </span>
      <textarea
        rows={4}
        {...props}
        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary-color)]/50 focus:bg-white/[0.05]"
      />
      {helpText ? <span className="text-[11px] text-[var(--text-secondary-color)]">{helpText}</span> : null}
    </label>
  );
}

function MiniMetric({ label, value, tone = "neutral" }) {
  const valueClass = {
    neutral: "text-white",
    primary: "text-sky-200",
    danger: "text-[#fca5a5]",
  }[tone] || "text-white";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs text-[var(--text-secondary-color)]">{label}</p>
      <p className={`mt-2 break-words text-base font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function HintRow({ icon, text }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
      <span className="material-symbols-outlined text-base text-sky-200" aria-hidden>{icon}</span>
      <p className="leading-6 break-words">{text}</p>
    </div>
  );
}
