import React from "react";

export default function Header({ title, titleImage, titleImageClass, onMenuClick }) {
  return (
    <header className="grid grid-cols-3 items-center p-4 sticky top-0 bg-[var(--background-color)]/90 backdrop-blur-sm z-30 border-b border-[var(--border-color)]">
      <div className="flex items-center justify-start min-w-0">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="lg:hidden h-10 w-10 -ml-2 rounded-full hover:bg-white/5 flex items-center justify-center text-[var(--text-color)]"
            aria-label="Abrir menú"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        )}
      </div>
      <div className="flex items-center justify-center min-w-0">
        {titleImage ? (
          <img src={titleImage} alt={title || 'Logo'} className={`${titleImageClass || 'h-6'} object-contain`} />
        ) : (
          <h1 className="text-xl font-bold leading-tight text-center truncate">{title}</h1>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        {/* Espacio derecho vacío como solicitado */}
      </div>
    </header>
  );
}

