import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const NotificationsContext = createContext(null);

let idSeq = 1;

export function NotificationsProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter(t => t.id !== id));
  }, []);

  const notify = useCallback((opts) => {
    const id = idSeq++;
    const toast = {
      id,
      title: opts?.title || '',
      message: opts?.message || '',
      type: opts?.type || 'info', // 'success' | 'error' | 'warning' | 'info'
      timeout: typeof opts?.timeout === 'number' ? opts.timeout : 3000,
    };
    setToasts((prev) => [...prev, toast]);
    if (toast.timeout > 0) {
      setTimeout(() => remove(id), toast.timeout);
    }
    return id;
  }, [remove]);

  const value = useMemo(() => ({ notify, remove }), [notify, remove]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {/* Container */}
      <div className="pointer-events-none fixed z-[100] inset-x-0 top-3 flex flex-col items-center gap-2 px-4">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-md w-full rounded-xl border shadow-lg px-4 py-3 flex items-start gap-3 transition-all duration-200 bg-[var(--card-color)] border-[var(--border-color)]`}
            role="status"
            aria-live="polite"
          >
            <span className={`material-symbols-outlined mt-0.5 ${
              t.type === 'success' ? 'text-[var(--success-color)]' :
              t.type === 'error' ? 'text-[var(--danger-color)]' :
              t.type === 'warning' ? 'text-amber-400' : 'text-[var(--text-secondary-color)]'
            }`}>
              {t.type === 'success' ? 'check_circle' : t.type === 'error' ? 'error' : t.type === 'warning' ? 'warning' : 'info'}
            </span>
            <div className="flex-1 min-w-0">
              {t.title && <p className="font-semibold truncate">{t.title}</p>}
              {t.message && <p className="text-sm text-[var(--text-secondary-color)] break-words whitespace-pre-line">{t.message}</p>}
            </div>
            <button
              className="shrink-0 text-[var(--text-secondary-color)] hover:text-white"
              onClick={() => remove(t.id)}
              aria-label="Cerrar"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications() debe usarse dentro de <NotificationsProvider />');
  return ctx;
}
