import React from 'react';

export default function PdfPreviewSendModal({
  preview,
  sending = false,
  onClose,
  onConfirm,
  confirmLabel = 'Enviar por WhatsApp',
  helperText = 'Revisa el PDF antes de enviarlo. Cuando confirmes, este mismo documento será el que se mande al cliente por WhatsApp.',
}) {
  if (!preview?.url) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm p-3 flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-6xl h-[92vh] bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden flex flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[var(--border-color)] bg-black/20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{preview.title || 'Previsualización PDF'}</p>
            {preview.subtitle ? (
              <p className="text-xs text-[var(--text-secondary-color)] truncate">{preview.subtitle}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={preview.url}
              download={preview.fileName || 'documento.pdf'}
              className="h-9 px-3 rounded-lg bg-white/10 border border-[var(--border-color)] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              Descargar
            </a>
            <button
              type="button"
              onClick={onConfirm}
              disabled={sending}
              className="h-9 px-3 rounded-lg bg-[#16a34a]/20 border border-[#22c55e]/40 text-xs font-bold text-[#bbf7d0] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">send</span>
              {sending ? 'Enviando...' : confirmLabel}
            </button>
            <button onClick={onClose} disabled={sending} className="h-9 w-9 rounded-lg bg-white/10 border border-[var(--border-color)] inline-flex items-center justify-center disabled:opacity-50">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </div>
        {helperText ? (
          <div className="px-4 py-2 border-b border-[var(--border-color)] text-xs text-[var(--text-secondary-color)] bg-white/[0.02]">
            {helperText}
          </div>
        ) : null}
        <iframe title={preview.title || 'Previsualización PDF'} src={preview.url} className="w-full flex-1 bg-[#1f2937]" />
      </div>
    </div>
  );
}
