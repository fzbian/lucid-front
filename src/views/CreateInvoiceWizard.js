import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import useTitle from '../useTitle';

export default function CreateInvoiceWizard() {
  const navigate = useNavigate();
  const { id: clientId } = useParams();
  const location = useLocation();
  const client = location.state?.client || null;
  useTitle('Crear factura · ATM');

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background-color)] text-[var(--text-color)]">
      <Header title="Crear factura" />
      <main className="flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] view-enter view-enter-active">
        <div className="w-full max-w-3xl mx-auto">
          <section className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl shadow-[0_10px_40px_-24px_rgba(0,0,0,0.9)] p-6 flex flex-col gap-4">
            <div className="space-y-1">
              <p className="text-sm text-[var(--text-secondary-color)]">Cliente</p>
              <p className="text-base font-semibold">{client?.nombre || client?.displayName || `ID ${clientId || '—'}`}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--text-secondary-color)]">
              Esta pantalla aún no tiene el flujo de creación de facturas implementado en el cliente.
              Usa el backend o la herramienta administrativa correspondiente para crear la factura, o completa este flujo más adelante.
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
