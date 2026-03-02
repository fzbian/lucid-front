import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import useTitle from '../useTitle';

function formatCurrency(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

export default function InvoiceAbonos() {
  const navigate = useNavigate();
  const { clientId, invoiceId } = useParams();
  const location = useLocation();
  const invoice = location.state?.invoice || null;
  useTitle('Abonos de factura · ATM');

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background-color)] text-[var(--text-color)]">
      <Header title="Abonos de factura" />
      <main className="flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] view-enter view-enter-active">
        <div className="w-full max-w-3xl mx-auto">
          <section className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl shadow-[0_10px_40px_-24px_rgba(0,0,0,0.9)] p-6 flex flex-col gap-4">
            <div className="space-y-1">
              <p className="text-sm text-[var(--text-secondary-color)]">Factura</p>
              <p className="text-base font-semibold">OP {invoice?.op || invoiceId || '—'}</p>
              <p className="text-xs text-[var(--text-secondary-color)]">Cliente ID: {clientId || '—'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--text-secondary-color)]">
              El detalle de abonos aún no está implementado en este frontend. Consulta el backend o agrega el listado de abonos aquí más adelante.
              {invoice?.valor_total != null && (
                <div className="mt-2 text-xs text-white/70">
                  <div>Total: {formatCurrency(invoice.valor_total)}</div>
                  <div>Abonado: {formatCurrency(invoice.valor_abonado)}</div>
                  <div>Pendiente: {formatCurrency(invoice.valor_pendiente)}</div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-between">
              <button
                type="button"
                onClick={() => navigate(`/wallet/client/${clientId}/invoices`)}
                className="px-4 py-2 rounded-lg bg-white/5 text-sm font-medium hover:bg-white/10 inline-flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden>arrow_back</span>
                Volver a facturas
              </button>
              <button
                type="button"
                onClick={() => navigate(`/wallet/client/${clientId}/abonos/new`, { state: { client: invoice?.cliente } })}
                className="px-4 py-2 rounded-lg bg-[var(--primary-color)]/20 border border-[var(--primary-color)]/50 text-sm font-semibold text-[var(--primary-color)] hover:bg-[var(--primary-color)]/30 inline-flex items-center gap-2"
              >
                Crear abono
                <span className="material-symbols-outlined text-sm" aria-hidden>payments</span>
              </button>
            </div>
          </section>
        </div>
      </main>
      <BottomNav
        onHome={() => navigate('/dashboard')}
        onMovements={() => navigate('/movements')}
        onWallet={() => navigate('/wallet')}
        onReports={() => navigate('/reports')}
        onCreateMovement={() => navigate('/new')}
        onCashout={() => navigate('/cashout')}
        onCashoutBank={() => navigate('/cashout-bank')}
      />
    </div>
  );
}
