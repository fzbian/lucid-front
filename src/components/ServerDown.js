import React from 'react';

export default function ServerDown({ onRetry, compact = false }) {
  return (
    <div className={`flex-1 ${compact ? '' : 'p-6'} flex items-center justify-center`}>
      <div className="text-center max-w-sm w-full bg-[var(--card-color)] border border-[var(--border-color)] rounded-xl p-6">
        <span className="material-symbols-outlined !text-5xl text-[var(--danger-color)]" aria-hidden>error</span>
        <h2 className="mt-3 text-lg font-semibold">Sin conexión con el servidor</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary-color)]">
          No fue posible comunicarse con el servidor. Por favor comuníquese con el analista de sistemas para solucionarlo lo más pronto posible.
        </p>
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary-color)] text-white hover:opacity-90"
        >
          <span className="material-symbols-outlined">refresh</span>
          Reintentar
        </button>
      </div>
    </div>
  );
}
