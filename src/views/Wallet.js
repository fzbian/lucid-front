import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import PdfPreviewSendModal from "../components/PdfPreviewSendModal";
import useTitle from "../useTitle";
import { createClient, deleteClient, listClientInvoices, listClients, notifyClientAccountStatement, updateClient } from "../carteraApi";
import { generateCarteraAccountStatementPdf } from "../utils/carteraAccountStatementPdf";

const moneyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatCurrency(value) {
  const amount = Number(value || 0);
  return moneyFormatter.format(Number.isFinite(amount) ? amount : 0);
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

function getCollectionRatio(client) {
  const total = Number(client?.total_facturado || 0);
  const paid = Number(client?.total_abonado || 0);
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((paid / total) * 100)));
}

const emptyForm = {
  nombre: "",
  celular: "",
  observaciones: "",
};

export default function Wallet() {
  const navigate = useNavigate();
  useTitle("Cartera · ATM Ricky Rich");

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [sendingPreview, setSendingPreview] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [notifyFeedback, setNotifyFeedback] = useState(null);

  const loadClients = useCallback(async (term = "") => {
    setLoading(true);
    setError("");
    try {
      const data = await listClients(term);
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || "No se pudo cargar la cartera.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadClients(search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadClients, search]);

  useEffect(() => () => {
    if (pdfPreview?.url?.startsWith("blob:")) {
      URL.revokeObjectURL(pdfPreview.url);
    }
  }, [pdfPreview]);

  const totals = useMemo(() => (
    clients.reduce((acc, client) => {
      acc.facturado += Number(client.total_facturado || 0);
      acc.abonado += Number(client.total_abonado || 0);
      acc.pendiente += Number(client.total_pendiente || 0);
      acc.facturasPendientes += Number(client.facturas_pendientes || 0);
      return acc;
    }, { facturado: 0, abonado: 0, pendiente: 0, facturasPendientes: 0 })
  ), [clients]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (client) => {
    setEditing(client);
    setForm({
      nombre: client?.nombre || "",
      celular: client?.celular || "",
      observaciones: client?.observaciones || "",
    });
    setModalOpen(true);
  };

  const closeModal = (force = false) => {
    if (saving && !force) return;
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (saving) return;
    const payload = {
      nombre: form.nombre.trim(),
      celular: form.celular.trim().slice(0, 20),
      observaciones: form.observaciones.trim().slice(0, 280),
    };
    if (!payload.nombre) {
      window.alert("El nombre del cliente es obligatorio.");
      return;
    }
    if (payload.nombre.length > 80) {
      window.alert("El nombre del cliente no puede superar los 80 caracteres.");
      return;
    }
    if (payload.celular) {
      const phoneDigits = payload.celular.replace(/\D/g, "");
      if (phoneDigits.length < 7) {
        window.alert("Ingresa un celular válido o deja el campo vacío.");
        return;
      }
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await updateClient(editing.id, payload);
      } else {
        await createClient(payload);
      }
      closeModal(true);
      await loadClients(search);
    } catch (err) {
      window.alert(err?.message || "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (client) => {
    const confirmed = window.confirm(`¿Eliminar a ${client.nombre}? Se borrarán sus facturas y abonos asociados.`);
    if (!confirmed) return;
    setDeletingId(client.id);
    try {
      await deleteClient(client.id);
      await loadClients(search);
    } catch (err) {
      window.alert(err?.message || "No se pudo eliminar el cliente.");
    } finally {
      setDeletingId(null);
    }
  };

  const closePdfPreview = (force = false) => {
    if (sendingPreview && !force) return;
    setPdfPreview((prev) => {
      if (prev?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  };

  const handleNotifyAccountStatement = async (client) => {
    if (!client?.id || previewLoadingId || sendingPreview) return;
    setNotifyFeedback(null);

    if (!client.celular?.trim()) {
      setNotifyFeedback({
        type: "error",
        message: `No puedes enviar el estado de cuenta de ${client.nombre} porque no tiene celular registrado.`,
      });
      return;
    }

    if (Number(client.facturas_count || 0) <= 0) {
      setNotifyFeedback({
        type: "error",
        message: `${client.nombre} no tiene facturas para incluir en el estado de cuenta.`,
      });
      return;
    }

    setPreviewLoadingId(client.id);
    try {
      const invoices = await listClientInvoices(client.id);
      if (!Array.isArray(invoices) || invoices.length === 0) {
        throw new Error("Este cliente no tiene facturas para incluir en el estado de cuenta.");
      }

      const { blob, base64, fileName } = await generateCarteraAccountStatementPdf(client, invoices);
      const url = URL.createObjectURL(blob);
      setPdfPreview((prev) => {
        if (prev?.url?.startsWith("blob:")) {
          URL.revokeObjectURL(prev.url);
        }
        return {
          client,
          invoicesCount: invoices.length,
          url,
          base64,
          fileName,
          title: "Previsualización del estado de cuenta",
          subtitle: `${client.nombre} · WhatsApp ${client.celular || "sin número"} · ${invoices.length} factura(s)`,
        };
      });
    } catch (err) {
      setNotifyFeedback({
        type: "error",
        message: err?.message || `No se pudo enviar el estado de cuenta de ${client.nombre}.`,
      });
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const confirmSendAccountStatement = async () => {
    if (!pdfPreview?.client?.id || sendingPreview) return;
    setSendingPreview(true);
    setNotifyFeedback(null);
    try {
      await notifyClientAccountStatement(pdfPreview.client.id, {
        pdf_base64: pdfPreview.base64,
        pdf_nombre: pdfPreview.fileName,
      });
      setNotifyFeedback({
        type: "success",
        message: `Estado de cuenta enviado correctamente a ${pdfPreview.client.nombre} por WhatsApp.`,
      });
      closePdfPreview(true);
    } catch (err) {
      setNotifyFeedback({
        type: "error",
        message: err?.message || `No se pudo enviar el estado de cuenta de ${pdfPreview.client.nombre}.`,
      });
    } finally {
      setSendingPreview(false);
    }
  };

  return (
    <Layout title="Cartera" fullWidth>
      <div className="space-y-6 view-enter view-enter-active w-full">
        <section className="relative overflow-hidden rounded-[28px] border border-[var(--border-color)] bg-[var(--card-color)] p-5 lg:p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)]">
          <div className="hidden pointer-events-none absolute inset-0">
            <div className="absolute -top-20 right-[-8%] h-64 w-64 rounded-full bg-[var(--primary-color)]/16 blur-3xl" />
            <div className="absolute bottom-[-6rem] left-[-4rem] h-56 w-56 rounded-full bg-[#22c55e]/10 blur-3xl" />
            <div className="absolute inset-y-0 right-[18%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent hidden lg:block" />
          </div>
          <div className="relative">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-sky-200">
                <span className="material-symbols-outlined text-sm" aria-hidden>shield_person</span>
                Ecosistema de cartera
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl font-semibold leading-tight text-white lg:text-4xl">
                  Controla clientes, facturas, abonos y seguimientos desde una sola vista.
                </h2>
                <p className="text-sm leading-6 text-slate-300">
                  Visualiza rápidamente quién está al día, quién necesita seguimiento y qué clientes tienen documentos listos para compartir por WhatsApp.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <HeroChip icon="mark_chat_unread" label={`${clients.filter((item) => Number(item.total_pendiente || 0) > 0).length} clientes con saldo`} />
                <HeroChip icon="warning" label={`${totals.facturasPendientes} facturas por cobrar`} tone="warning" />
                <HeroChip icon="sync_saved_locally" label={`${clients.filter((item) => Number(item.ingresos_pendientes_count || 0) > 0).length} alertas por asignar`} tone="info" />
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80">
                  <span className="material-symbols-outlined text-slate-300" aria-hidden>search</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nombre o celular"
                    className="w-full bg-transparent outline-none placeholder:text-white/25"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="rounded-full bg-white/10 p-1 text-white/70 transition hover:bg-white/15"
                      aria-label="Limpiar búsqueda"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden>close</span>
                    </button>
                  ) : null}
                </label>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--primary-color)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  onClick={openCreate}
                >
                  <span className="material-symbols-outlined" aria-hidden>person_add</span>
                  Nuevo cliente
                </button>
              </div>
            </div>
          </div>
        </section>

        {notifyFeedback ? (
          <section className={`rounded-2xl border px-4 py-3 text-sm ${
            notifyFeedback.type === "success"
              ? "border-[#22c55e]/30 bg-[#16a34a]/10 text-[#bbf7d0]"
              : "border-[#ef4444]/30 bg-[#ef4444]/10 text-[#fecaca]"
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  notifyFeedback.type === "success" ? "bg-[#16a34a]/20" : "bg-[#ef4444]/15"
                }`}>
                  <span className="material-symbols-outlined text-base" aria-hidden>
                    {notifyFeedback.type === "success" ? "check_circle" : "error"}
                  </span>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{notifyFeedback.type === "success" ? "Acción completada" : "Atención"}</p>
                  <p className="text-sm break-words">{notifyFeedback.message}</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full bg-black/10 p-1 hover:bg-black/20"
                onClick={() => setNotifyFeedback(null)}
                aria-label="Cerrar mensaje"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden>close</span>
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--card-color)] shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)]">
          <div className="flex flex-col gap-4 border-b border-white/5 px-5 py-5 lg:px-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                <span className="material-symbols-outlined text-sm" aria-hidden>stacked_email</span>
                Portafolio activo
              </div>
              <h3 className="text-xl font-semibold">Clientes en cartera</h3>
              <p className="text-sm text-[var(--text-secondary-color)]">Cada tarjeta resume saldos, progreso de pago y accesos rápidos de gestión.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <MiniStat title="Al día" value={String(clients.filter((item) => Number(item.total_pendiente || 0) <= 0).length)} icon="task_alt" tone="success" />
              <MiniStat title="Con saldo" value={String(clients.filter((item) => Number(item.total_pendiente || 0) > 0).length)} icon="schedule" tone="warning" />
              <MiniStat title="Con alertas" value={String(clients.filter((item) => Number(item.ingresos_pendientes_count || 0) > 0).length)} icon="notifications" tone="info" />
            </div>
          </div>

          {loading ? (
            <div className="space-y-4 p-5 lg:p-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-60 animate-pulse rounded-[28px] bg-white/5" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 p-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--danger-color)]/10 text-[var(--danger-color)]">
                <span className="material-symbols-outlined text-4xl" aria-hidden>error</span>
              </div>
              <p className="text-base font-medium">No pudimos cargar la cartera</p>
              <p className="text-sm text-[var(--text-secondary-color)]">{error}</p>
              <button
                type="button"
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/15"
                onClick={() => loadClients(search)}
              >
                Reintentar
              </button>
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center gap-4 p-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]" aria-hidden>account_balance_wallet</span>
              </div>
              <p className="text-base font-medium">Aún no hay clientes en cartera</p>
              <p className="text-sm text-[var(--text-secondary-color)]">Crea tu primer cliente y desde allí podrás registrar facturas y sus respectivos abonos.</p>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                onClick={openCreate}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>add_circle</span>
                Crear cliente
              </button>
            </div>
          ) : (
            <div className="grid gap-5 p-5 lg:p-6 xl:grid-cols-2 2xl:grid-cols-3">
              {clients.map((client) => (
                <article key={client.id} className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-4 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.8)] transition hover:border-white/15">
                  <div className="hidden absolute inset-x-0 top-0 h-24 bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(34,197,94,0.06),transparent)]" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-base font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                          {getInitials(client.nombre)}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="max-w-full break-words text-lg font-semibold leading-tight">{client.nombre}</h4>
                            {client.celular ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-slate-300">
                                <span className="material-symbols-outlined text-sm" aria-hidden>call</span>
                                {client.celular}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200">
                                <span className="material-symbols-outlined text-sm" aria-hidden>call_missed</span>
                                Sin celular
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-secondary-color)]">
                            {Number(client.facturas_count || 0)} factura(s) registradas · {Number(client.facturas_pendientes || 0)} con saldo pendiente
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${Number(client.total_pendiente || 0) > 0 ? "border-[#f59e0b]/40 bg-[#f59e0b]/15 text-[#fde68a]" : "border-[#22c55e]/40 bg-[#16a34a]/15 text-[#bbf7d0]"}`}>
                        <span className="material-symbols-outlined text-sm" aria-hidden>{Number(client.total_pendiente || 0) > 0 ? "warning" : "verified"}</span>
                        {Number(client.total_pendiente || 0) > 0 ? "Con saldo" : "Al día"}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <MetricBox label="Facturado" value={formatCurrency(client.total_facturado)} accent="neutral" icon="receipt_long" />
                      <MetricBox label="Abonado" value={formatCurrency(client.total_abonado)} accent="success" icon="payments" />
                      <MetricBox label="Pendiente" value={formatCurrency(client.total_pendiente)} accent="danger" icon="account_balance_wallet" />
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4">
                      <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-secondary-color)]">
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm" aria-hidden>pie_chart</span>
                          Progreso de recuperación
                        </span>
                        <span className="font-semibold text-white">{getCollectionRatio(client)}%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#34d399)] transition-all"
                          style={{ width: `${getCollectionRatio(client)}%` }}
                        />
                      </div>
                      {client.observaciones ? (
                        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                          <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary-color)]">
                            <span className="material-symbols-outlined text-sm" aria-hidden>sticky_note_2</span>
                            Observación
                          </div>
                          <p className="leading-5 break-words">{client.observaciones}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--text-secondary-color)]">
                      <ClientPill icon="receipt_long" label={`${client.facturas_count || 0} facturas`} />
                      <ClientPill icon="schedule" label={`${client.facturas_pendientes || 0} pendientes`} />
                      {Number(client.ingresos_pendientes_count || 0) > 0 ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/wallet/client/${client.id}/invoices`, { state: { client, highlightPendingIncome: true } })}
                          className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-sky-300 transition hover:bg-sky-500/15"
                        >
                          <span className="material-symbols-outlined text-sm" aria-hidden>notifications</span>
                          {client.ingresos_pendientes_count} ingreso(s) sin asignar · {formatCurrency(client.ingresos_pendientes_total)}
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--primary-color)]/35 bg-[var(--primary-color)]/15 px-4 py-3 text-sm font-semibold text-[var(--primary-color)] transition hover:bg-[var(--primary-color)]/25"
                        onClick={() => navigate(`/wallet/client/${client.id}/invoices`, { state: { client } })}
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden>arrow_forward</span>
                        Ver cartera
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#22c55e]/30 bg-[#16a34a]/10 px-4 py-3 text-sm font-medium text-[#bbf7d0] transition hover:bg-[#16a34a]/20 disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => handleNotifyAccountStatement(client)}
                        disabled={Boolean(previewLoadingId) || sendingPreview || !client.celular?.trim() || Number(client.facturas_count || 0) <= 0}
                        title={!client.celular?.trim() ? "Este cliente no tiene celular registrado" : Number(client.facturas_count || 0) <= 0 ? "Este cliente no tiene facturas" : "Enviar estado de cuenta por WhatsApp"}
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden>picture_as_pdf</span>
                        {previewLoadingId === client.id ? "Preparando..." : "Enviar estado"}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
                        onClick={() => openEdit(client)}
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden>edit</span>
                        Editar cliente
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-sm font-medium text-[#fca5a5] transition hover:bg-[#ef4444]/15 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => handleDelete(client)}
                        disabled={deletingId === client.id}
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden>delete</span>
                        {deletingId === client.id ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center" onClick={closeModal}>
          <div className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/10 bg-[var(--card-color)] shadow-[0_30px_80px_-35px_rgba(0,0,0,0.95)]" onClick={(event) => event.stopPropagation()}>
            <div className="grid gap-0 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="relative overflow-hidden border-b border-white/10 bg-white/[0.03] p-6 lg:border-b-0 lg:border-r">
                <div className="hidden absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_42%)]" />
                <div className="relative space-y-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white">
                    <span className="material-symbols-outlined text-3xl" aria-hidden>{editing ? "edit_square" : "person_add"}</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-300">{editing ? "Editar cliente" : "Nuevo cliente"}</p>
                    <h3 className="break-words text-2xl font-semibold text-white">{editing ? editing.nombre : "Registrar cliente en cartera"}</h3>
                    <p className="text-sm leading-6 text-slate-300">
                      Mantén el contacto principal y las notas clave siempre visibles para acelerar cobros, seguimiento y comunicación.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <ModalHint icon="phone_iphone" text="Guarda un celular válido para usar las notificaciones por WhatsApp." />
                    <ModalHint icon="sticky_note_2" text="Usa observaciones para acuerdos, promesas de pago o contexto importante." />
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary-color)]">Ficha del cliente</p>
                    <h4 className="text-xl font-semibold">{editing ? "Actualizar información" : "Datos principales"}</h4>
                  </div>
                  <button
                    type="button"
                    className="rounded-full bg-white/5 p-2 transition hover:bg-white/10"
                    onClick={closeModal}
                    aria-label="Cerrar"
                  >
                    <span className="material-symbols-outlined" aria-hidden>close</span>
                  </button>
                </div>

                <div className="mt-6 grid gap-4">
                  <InputField label="Nombre" value={form.nombre} onChange={(value) => setForm((prev) => ({ ...prev, nombre: value }))} required icon="badge" maxLength={80} />
                  <InputField label="Celular" value={form.celular} onChange={(value) => setForm((prev) => ({ ...prev, celular: value }))} icon="call" maxLength={20} />
                  <TextAreaField label="Observación" value={form.observaciones} onChange={(value) => setForm((prev) => ({ ...prev, observaciones: value }))} icon="description" maxLength={280} />
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden /> : null}
                    {editing ? "Guardar cambios" : "Crear cliente"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <PdfPreviewSendModal
        preview={pdfPreview}
        sending={sendingPreview}
        onClose={closePdfPreview}
        onConfirm={confirmSendAccountStatement}
        confirmLabel="Enviar por WhatsApp"
      />
    </Layout>
  );
}

function MetricBox({ label, value, accent = "neutral", icon = "insights" }) {
  const accentClass = {
    neutral: "text-white",
    success: "text-[#86efac]",
    danger: "text-[#fca5a5]",
  }[accent || "neutral"];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-[var(--text-secondary-color)]" aria-hidden>{icon}</span>
        <p className="text-xs text-[var(--text-secondary-color)]">{label}</p>
      </div>
      <p className={`mt-2 break-words text-base font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}

function HeroChip({ icon, label, tone = "neutral" }) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.03] text-slate-200",
    warning: "border-white/10 bg-white/[0.03] text-slate-200",
    info: "border-white/10 bg-white/[0.03] text-slate-200",
  }[tone] || "border-white/10 bg-white/[0.03] text-slate-200";
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs break-words ${toneClass}`}>
      <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function MiniStat({ title, value, icon, tone = "neutral" }) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.03] text-white",
    success: "border-white/10 bg-white/[0.03] text-white",
    warning: "border-white/10 bg-white/[0.03] text-white",
    info: "border-white/10 bg-white/[0.03] text-white",
  }[tone] || "border-white/10 bg-white/[0.03] text-white";
  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base" aria-hidden>{icon}</span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] opacity-70">{title}</p>
          <p className="text-base font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ClientPill({ icon, label }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 break-words">
      <span className="material-symbols-outlined text-sm text-[var(--text-secondary-color)]" aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function ModalHint({ icon, text }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
      <span className="material-symbols-outlined text-base text-sky-200" aria-hidden>{icon}</span>
      <p className="leading-5">{text}</p>
    </div>
  );
}

function InputField({ label, value, onChange, required = false, icon = "edit", ...inputProps }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary-color)]">
        <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        {...inputProps}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary-color)]/50 focus:bg-white/[0.05]"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, icon = "description", ...inputProps }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary-color)]">
        <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
        {label}
      </span>
      <textarea
        {...inputProps}
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary-color)]/50 focus:bg-white/[0.05]"
      />
    </label>
  );
}
