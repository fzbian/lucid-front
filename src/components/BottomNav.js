import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';

export default function BottomNav({
  onCreateMovement,
  onAddIncome,
  onAddExpense,
  onCashout,
  onCashoutBank,
  onHome,
  onReports,
  onMovements,
  onWallet,
  onGastos,
  onPedidos,
  active = 'home',
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { hasAccess } = useRole();

  const canCreateMovement = hasAccess('new');
  const canCashout = hasAccess('cashout');
  const canCashoutBank = hasAccess('cashout-bank');
  const hasAnyAction = canCreateMovement || canCashout || canCashoutBank;

  const navButtons = useMemo(() => ([
    { key: 'home', icon: 'home', path: '/dashboard', allowed: hasAccess('dashboard'), handler: onHome },
    { key: 'movs', icon: 'receipt_long', path: '/movements', allowed: hasAccess('movements'), handler: onMovements },
    { key: 'gastos', icon: 'receipt', path: '/gastos', allowed: hasAccess('gastos'), handler: onGastos },
    { key: 'pedidos', icon: 'shopping_cart', path: '/pedidos', allowed: hasAccess('pedidos'), handler: onPedidos },
    { key: 'wallet', icon: 'account_balance_wallet', path: '/wallet', allowed: hasAccess('wallet'), handler: onWallet },
    { key: 'reports', icon: 'bar_chart', path: '/reports', allowed: hasAccess('reports'), handler: onReports },
  ]), [hasAccess, onHome, onMovements, onGastos, onPedidos, onWallet, onReports]);

  const navTo = (handler, path) => () => {
    if (handler) handler();
    else navigate(path);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      <div className={`pointer-events-none fixed inset-0 z-40 ${open ? 'pointer-events-auto' : ''}`} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-safe:duration-300 ease-out ${open ? 'opacity-100' : 'opacity-0'}`}
        />

        <div className="absolute inset-x-0 bottom-24 flex justify-center px-4">
          <div
            id="fab-sheet"
            className={`w-[min(480px,100%)] transform-gpu will-change-transform border border-[var(--border-color)] rounded-2xl shadow-2xl backdrop-blur-md bg-[var(--card-color)]/90 transition-all duration-200 motion-safe:duration-300 ease-out ${open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            role="dialog"
            aria-modal="true"
          >
            <div className="px-5 py-5 flex flex-col gap-3 items-center text-center">
              {canCreateMovement && (
                <button
                  className="w-full max-w-sm flex items-center justify-center gap-3 p-4 rounded-xl border border-[var(--border-color)] bg-[var(--background-color)] transition-colors duration-150 hover:bg-white/5 active:scale-[0.98]"
                  onClick={() => {
                    if (onCreateMovement) {
                      onCreateMovement();
                    } else if (onAddIncome) {
                      onAddIncome();
                    } else if (onAddExpense) {
                      onAddExpense();
                    } else {
                      navigate('/new');
                    }
                    setOpen(false);
                  }}
                >
                  <span className="material-symbols-outlined text-[var(--primary-color)]">add_notes</span>
                  <span className="text-base font-medium text-[var(--text-color)]">Realizar movimiento</span>
                </button>
              )}

              {canCashout && (
                <button
                  className="w-full max-w-sm flex items-center justify-center gap-3 p-4 rounded-xl border border-transparent bg-[#2563eb] text-white transition-colors duration-150 hover:brightness-110 active:scale-[0.98]"
                  onClick={() => {
                    if (onCashout) onCashout();
                    else navigate('/cashout');
                    setOpen(false);
                  }}
                >
                  <span className="material-symbols-outlined !text-white">point_of_sale</span>
                  <span className="text-base font-semibold">Retirar efectivo en punto</span>
                </button>
              )}

              {canCashoutBank && (
                <button
                  className="w-full max-w-sm flex items-center justify-center gap-3 p-4 rounded-xl border border-[var(--border-color)] bg-[var(--background-color)] transition-colors duration-150 hover:bg-white/5 active:scale-[0.98]"
                  onClick={() => {
                    if (onCashoutBank) onCashoutBank();
                    else navigate('/cashout-bank');
                    setOpen(false);
                  }}
                >
                  <span className="material-symbols-outlined">account_balance</span>
                  <span className="text-base font-medium">Retirar dinero de banco</span>
                </button>
              )}

              {!hasAnyAction && (
                <div className="w-full max-w-sm p-3 rounded-xl border border-amber-300/30 bg-amber-500/10 text-amber-200 text-sm">
                  Este rol no tiene acciones rapidas habilitadas.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <nav className="relative overflow-visible border-t border-[var(--border-color)] bg-[var(--card-color)]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="h-16 grid grid-cols-7 items-center max-w-2xl mx-auto">
          {navButtons.slice(0, 3).map((item) => (
            item.allowed ? (
              <button
                key={item.key}
                className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${active === item.key ? 'text-[var(--primary-color)]' : 'text-[var(--text-secondary-color)] hover:text-[var(--primary-color)]'}`}
                onClick={navTo(item.handler, item.path)}
              >
                <span className="material-symbols-outlined text-2xl">{item.icon}</span>
              </button>
            ) : (
              <div key={item.key} aria-hidden="true" />
            )
          ))}

          <div className="relative flex items-center justify-center -mt-6">
            <button
              disabled={!hasAnyAction}
              className={`h-14 w-14 rounded-full text-white shadow-lg ring-4 ring-[var(--card-color)] border border-white/10 flex items-center justify-center transform-gpu transition-all duration-200 z-10 ${open ? 'scale-100 rotate-45 bg-red-500' : hasAnyAction ? 'bg-[var(--primary-color)] hover:scale-105 active:scale-95' : 'bg-gray-500 cursor-not-allowed opacity-70'}`}
              onClick={() => hasAnyAction && setOpen(!open)}
            >
              <span className="material-symbols-outlined !text-3xl">add</span>
            </button>
          </div>

          {navButtons.slice(3).map((item) => (
            item.allowed ? (
              <button
                key={item.key}
                className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${active === item.key ? 'text-[var(--primary-color)]' : 'text-[var(--text-secondary-color)] hover:text-[var(--primary-color)]'}`}
                onClick={navTo(item.handler, item.path)}
              >
                <span className="material-symbols-outlined text-2xl">{item.icon}</span>
              </button>
            ) : (
              <div key={item.key} aria-hidden="true" />
            )
          ))}
        </div>
      </nav>
    </div>
  );
}
