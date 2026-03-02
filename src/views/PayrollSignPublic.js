import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../api';
import { formatCLP } from '../formatMoney';
import { generatePaymentSlipBlob } from '../utils/pdfGenerator';

const SIGNATURE_LIBRARY_PREFIX = 'payroll_signature_library_v1:';

function normalizeCedulaValue(value) {
    return String(value || '').toLowerCase().replace(/[.\-\s]/g, '').trim();
}

function getSignatureStorageKey(cedula) {
    return `${SIGNATURE_LIBRARY_PREFIX}${normalizeCedulaValue(cedula)}`;
}

function loadSavedSignatures(cedula) {
    const key = getSignatureStorageKey(cedula);
    try {
        const raw = localStorage.getItem(key);
        const parsed = JSON.parse(raw || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(s => s && typeof s.id === 'string' && typeof s.data_url === 'string');
    } catch {
        return [];
    }
}

function saveSignatureLibrary(cedula, signatures) {
    const key = getSignatureStorageKey(cedula);
    localStorage.setItem(key, JSON.stringify(signatures));
}

function formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function PdfViewerModal({ title, url, filename, onClose }) {
    if (!url) return null;
    return (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm p-3 flex items-center justify-center" onClick={onClose}>
            <div className="w-full max-w-5xl h-[90vh] bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="h-14 px-4 border-b border-[var(--border-color)] flex items-center justify-between bg-black/20">
                    <div className="font-bold text-sm truncate">{title}</div>
                    <div className="flex items-center gap-2">
                        <a
                            href={url}
                            download={filename}
                            className="h-9 px-3 rounded-lg bg-white/10 border border-[var(--border-color)] text-xs font-bold inline-flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-sm">download</span>
                            Descargar
                        </a>
                        <button onClick={onClose} className="h-9 w-9 rounded-lg bg-white/10 border border-[var(--border-color)] inline-flex items-center justify-center">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                </div>
                <iframe title={title} src={url} className="w-full flex-1 bg-[#1f2937]" />
            </div>
        </div>
    );
}

export default function PayrollSignPublic() {
    const { token } = useParams();
    const [step, setStep] = useState('identity');
    const [cedula, setCedula] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [accessData, setAccessData] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [signedFilePath, setSignedFilePath] = useState('');
    const [hasSignature, setHasSignature] = useState(false);
    const [savedSignatures, setSavedSignatures] = useState([]);
    const [selectedSignatureId, setSelectedSignatureId] = useState('');
    const [signatureMode, setSignatureMode] = useState('new');
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfModal, setPdfModal] = useState(null);

    const canvasRef = useRef(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef({ x: 0, y: 0 });

    const selectedSignature = useMemo(
        () => savedSignatures.find(s => s.id === selectedSignatureId) || null,
        [savedSignatures, selectedSignatureId]
    );

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            if (pdfModal?.url && pdfModal.url.startsWith('blob:') && pdfModal.url !== previewUrl) {
                URL.revokeObjectURL(pdfModal.url);
            }
        };
    }, [previewUrl, pdfModal]);

    const closePdfModal = useCallback(() => {
        setPdfModal((prev) => {
            if (prev?.url && prev.url.startsWith('blob:') && prev.url !== previewUrl) {
                URL.revokeObjectURL(prev.url);
            }
            return null;
        });
    }, [previewUrl]);

    const setupCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const cssWidth = Math.max(Math.min(window.innerWidth - 40, 520), 280);
        const cssHeight = 220;

        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cssWidth, cssHeight);
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0f172a';

        setHasSignature(false);
    }, []);

    useEffect(() => {
        if (step !== 'sign') return;
        setupCanvas();
        window.addEventListener('resize', setupCanvas);
        return () => window.removeEventListener('resize', setupCanvas);
    }, [step, setupCanvas]);

    useEffect(() => {
        if (step !== 'sign') return;
        if (savedSignatures.length === 0 && signatureMode === 'saved') {
            setSignatureMode('new');
        }
    }, [step, savedSignatures.length, signatureMode]);

    const getCanvasPoint = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const handlePointerDown = (e) => {
        if (!canvasRef.current) return;
        e.preventDefault();
        setSelectedSignatureId('');
        const point = getCanvasPoint(e);
        drawingRef.current = true;
        lastPointRef.current = point;
        canvasRef.current.setPointerCapture?.(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!drawingRef.current || !canvasRef.current) return;
        e.preventDefault();
        const point = getCanvasPoint(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        lastPointRef.current = point;
        setHasSignature(true);
    };

    const handlePointerUp = (e) => {
        if (!canvasRef.current) return;
        drawingRef.current = false;
        canvasRef.current.releasePointerCapture?.(e.pointerId);
    };

    const clearSignature = () => {
        setSelectedSignatureId('');
        setupCanvas();
    };

    const handleSaveCurrentSignature = () => {
        if (!canvasRef.current || !hasSignature) return;

        const dataUrl = canvasRef.current.toDataURL('image/png');
        const newSignature = {
            id: `sig_${Date.now()}`,
            data_url: dataUrl,
            created_at: new Date().toISOString()
        };

        const nextSignatures = [newSignature, ...savedSignatures].slice(0, 8);
        setSavedSignatures(nextSignatures);
        saveSignatureLibrary(cedula, nextSignatures);
        setSelectedSignatureId(newSignature.id);
        setSignatureMode('saved');
        setupCanvas();
    };

    const handleDeleteSavedSignature = (signatureId) => {
        const nextSignatures = savedSignatures.filter((sig) => sig.id !== signatureId);
        setSavedSignatures(nextSignatures);
        saveSignatureLibrary(cedula, nextSignatures);

        if (selectedSignatureId === signatureId) {
            setSelectedSignatureId(nextSignatures[0]?.id || '');
        }
        if (nextSignatures.length === 0) {
            setSignatureMode('new');
        }
    };

    const openSignedPdfModal = async () => {
        if (!signedFilePath) return;
        setPdfLoading(true);
        setError('');
        try {
            const res = await apiFetch(signedFilePath);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'No se pudo cargar el PDF firmado');
            }
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            setPdfModal({
                title: 'PDF firmado',
                url: objectUrl,
                filename: `Comprobante_Firmado_${accessData?.payment?.id || 'nomina'}.pdf`
            });
        } catch (e) {
            setError(e.message || 'No se pudo cargar el PDF firmado');
        } finally {
            setPdfLoading(false);
        }
    };

    const handleValidateIdentity = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await apiFetch(`/api/nomina/sign/${token}/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cedula })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'No se pudo validar el link');
                return;
            }

            const blob = generatePaymentSlipBlob(data.payment, data.user, data.config);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            const objectUrl = URL.createObjectURL(blob);
            setPreviewUrl(objectUrl);
            setAccessData(data);
            setSavedSignatures(loadSavedSignatures(cedula));
            setSelectedSignatureId('');
            setStep('preview');
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitSignature = async () => {
        if (!accessData) return;

        const signatureDataUrl = signatureMode === 'saved'
            ? (selectedSignature?.data_url || '')
            : (hasSignature && canvasRef.current ? canvasRef.current.toDataURL('image/png') : '');
        if (!signatureDataUrl) return;

        setSubmitting(true);
        setError('');

        try {
            const signedAt = new Date().toISOString();
            const signedBlob = generatePaymentSlipBlob(accessData.payment, accessData.user, accessData.config, {
                signatureDataUrl,
                signedAt
            });
            const signedFile = new File([signedBlob], `payment_signed_${accessData.payment.id}.pdf`, { type: 'application/pdf' });

            const formData = new FormData();
            formData.append('cedula', cedula);
            formData.append('signed_pdf', signedFile);

            const res = await apiFetch(`/api/nomina/sign/${token}/complete`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'No se pudo confirmar la firma');
                return;
            }

            setSignedFilePath(data.signed_file || '');
            setStep('done');
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    const canSubmitSignature = signatureMode === 'saved'
        ? Boolean(selectedSignature)
        : Boolean(hasSignature);

    return (
        <main className="min-h-screen bg-[var(--background-color)] text-[var(--text-color)] px-4 py-6">
            <div className="max-w-xl mx-auto space-y-4">
                <header className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary-color)] font-bold">Firma de Recibo</p>
                    <h1 className="text-xl font-bold mt-1">Comprobante de Nómina</h1>
                    <p className="text-xs text-[var(--text-secondary-color)] mt-2">
                        Firma electrónica simple auditada. Este enlace es personal y temporal.
                    </p>
                </header>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-3 py-2 text-sm">
                        {error}
                    </div>
                )}

                {step === 'identity' && (
                    <section className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-4 space-y-4">
                        <h2 className="font-bold">1. Validar identidad</h2>
                        <form className="space-y-3" onSubmit={handleValidateIdentity}>
                            <label className="block text-xs text-[var(--text-secondary-color)]">Ingresa tu cédula</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                value={cedula}
                                onChange={(e) => setCedula(e.target.value)}
                                className="w-full h-12 rounded-xl bg-[var(--dark-color)] border border-[var(--border-color)] px-3 outline-none focus:border-[var(--primary-color)]"
                                placeholder="Número de cédula"
                                required
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full h-12 rounded-xl bg-[var(--primary-color)] text-white font-bold disabled:opacity-50"
                            >
                                {loading ? 'Validando...' : 'Continuar'}
                            </button>
                        </form>
                    </section>
                )}

                {step === 'preview' && accessData && (
                    <section className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-4 space-y-4">
                        <h2 className="font-bold">2. Revisa tu comprobante</h2>
                        <div className="bg-white/5 rounded-xl p-3 text-sm space-y-1">
                            <div><span className="text-[var(--text-secondary-color)]">Empleado:</span> {accessData.user.full_name || accessData.user.name}</div>
                            <div><span className="text-[var(--text-secondary-color)]">Periodo:</span> {formatDate(accessData.payment.period_start)} - {formatDate(accessData.payment.period_end)}</div>
                            <div><span className="text-[var(--text-secondary-color)]">Total:</span> <span className="font-mono font-bold">{formatCLP(accessData.payment.total_paid)}</span></div>
                        </div>

                        {previewUrl && (
                            <button
                                type="button"
                                onClick={() => setPdfModal({
                                    title: 'Comprobante de nómina',
                                    url: previewUrl,
                                    filename: `Comprobante_${accessData.payment.id}.pdf`
                                })}
                                className="w-full h-12 rounded-xl border border-[var(--border-color)] flex items-center justify-center gap-2 bg-white/5 font-bold"
                            >
                                <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                                Abrir comprobante
                            </button>
                        )}

                        <div className="sticky bottom-0 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSignatureMode(savedSignatures.length > 0 ? 'saved' : 'new');
                                    setStep('sign');
                                }}
                                className="w-full h-12 rounded-xl bg-[var(--primary-color)] text-white font-bold"
                            >
                                Continuar a firmar
                            </button>
                        </div>
                    </section>
                )}

                {step === 'sign' && (
                    <section className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl p-4 space-y-4">
                        <h2 className="font-bold">3. Firma digital</h2>
                        <p className="text-xs text-[var(--text-secondary-color)]">
                            Elige una opción y luego pulsa firmar.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setSignatureMode('saved')}
                                disabled={savedSignatures.length === 0}
                                className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                                    signatureMode === 'saved'
                                        ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10'
                                        : 'border-[var(--border-color)] bg-white/5'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">bookmarks</span>
                                    <span className="text-sm font-bold">Usar firma guardada</span>
                                </div>
                                <div className="text-[11px] text-[var(--text-secondary-color)] mt-1">
                                    {savedSignatures.length > 0
                                        ? `${savedSignatures.length} firma(s) disponible(s)`
                                        : 'No tienes firmas guardadas'}
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSignatureMode('new')}
                                className={`rounded-xl border p-3 text-left transition-colors ${
                                    signatureMode === 'new'
                                        ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10'
                                        : 'border-[var(--border-color)] bg-white/5'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">draw</span>
                                    <span className="text-sm font-bold">Nueva firma</span>
                                </div>
                                <div className="text-[11px] text-[var(--text-secondary-color)] mt-1">
                                    Dibuja una firma desde cero.
                                </div>
                            </button>
                        </div>

                        {signatureMode === 'saved' && (
                            <div className="space-y-2">
                                {savedSignatures.length === 0 ? (
                                    <div className="rounded-xl border border-[var(--border-color)] bg-white/5 p-3 text-xs text-[var(--text-secondary-color)]">
                                        No hay firmas guardadas. Cambia a <strong>Nueva firma</strong> para continuar.
                                    </div>
                                ) : (
                                    <>
                                        <div className="text-xs text-[var(--text-secondary-color)] font-semibold">
                                            Selecciona una firma guardada
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {savedSignatures.map((sig) => (
                                                <div
                                                    key={sig.id}
                                                    className={`rounded-xl border p-2 relative ${
                                                        selectedSignatureId === sig.id
                                                            ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10'
                                                            : 'border-[var(--border-color)] bg-white/5'
                                                    }`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedSignatureId(sig.id)}
                                                        className="w-full"
                                                    >
                                                        <img src={sig.data_url} alt="Firma guardada" className="w-full h-16 object-contain bg-white rounded-lg" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteSavedSignature(sig.id);
                                                        }}
                                                        className="absolute top-1 right-1 h-7 w-7 rounded-lg bg-black/50 border border-white/20 text-red-300 inline-flex items-center justify-center"
                                                        aria-label="Eliminar firma guardada"
                                                        title="Eliminar firma"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {signatureMode === 'new' && (
                            <>
                                <div className="flex justify-center">
                                    <canvas
                                        ref={canvasRef}
                                        className="rounded-xl shadow-inner bg-white border border-slate-300"
                                        style={{ touchAction: 'none' }}
                                        onPointerDown={handlePointerDown}
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={handlePointerUp}
                                        onPointerCancel={handlePointerUp}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={clearSignature}
                                        className="h-12 rounded-xl border border-[var(--border-color)] bg-white/5 font-bold text-xs"
                                    >
                                        Limpiar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveCurrentSignature}
                                        disabled={!hasSignature}
                                        className="h-12 rounded-xl border border-[var(--border-color)] bg-white/5 font-bold text-xs disabled:opacity-50"
                                    >
                                        Guardar firma
                                    </button>
                                </div>
                            </>
                        )}

                        <div className="pt-1">
                            <button
                                type="button"
                                onClick={handleSubmitSignature}
                                disabled={!canSubmitSignature || submitting}
                                className="w-full h-12 rounded-xl bg-[var(--success-color)] text-white font-bold text-sm disabled:opacity-50"
                            >
                                {submitting
                                    ? 'Enviando...'
                                    : (signatureMode === 'saved' ? 'Firmar con firma guardada' : 'Firmar con nueva firma')}
                            </button>
                        </div>
                    </section>
                )}

                {step === 'done' && (
                    <section className="bg-[var(--card-color)] border border-green-500/30 rounded-2xl p-4 space-y-4">
                        <h2 className="font-bold text-green-400">Has firmado el documento</h2>
                        <p className="text-sm text-[var(--text-secondary-color)]">
                            Tu firma quedó registrada correctamente.
                        </p>
                        <button
                            type="button"
                            onClick={openSignedPdfModal}
                            disabled={!signedFilePath || pdfLoading}
                            className="w-full h-12 rounded-xl bg-green-500/15 border border-green-500/40 text-green-300 flex items-center justify-center gap-2 font-bold disabled:opacity-60"
                        >
                            <span className="material-symbols-outlined text-sm">description</span>
                            {pdfLoading ? 'Cargando...' : 'Abrir PDF firmado'}
                        </button>
                    </section>
                )}
            </div>

            <PdfViewerModal
                title={pdfModal?.title || ''}
                url={pdfModal?.url || ''}
                filename={pdfModal?.filename || 'comprobante.pdf'}
                onClose={closePdfModal}
            />
        </main>
    );
}
