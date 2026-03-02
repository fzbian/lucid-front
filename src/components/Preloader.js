import React from 'react';

export default function Preloader({ label = 'Cargando…' }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-[var(--text-secondary-color)]">
        <span className="h-10 w-10 rounded-full border-4 border-white/20 border-t-white animate-spin" aria-hidden />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}
