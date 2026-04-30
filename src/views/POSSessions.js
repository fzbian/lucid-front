import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import useTitle from '../useTitle';
import { apiFetch } from '../api';
import { useNotifications } from '../components/Notifications';

const VISIBLE_LOCALES_STORAGE_KEY = 'atm_pos_sessions_visible_locales_v1';

function readVisibleLocalesPreference() {
    try {
        const raw = localStorage.getItem(VISIBLE_LOCALES_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const safe = parsed
            .map((item) => String(item || '').trim())
            .filter(Boolean);
        return safe.length > 0 ? safe : null;
    } catch {
        return null;
    }
}

function writeVisibleLocalesPreference(value) {
    if (!Array.isArray(value) || value.length === 0) {
        localStorage.removeItem(VISIBLE_LOCALES_STORAGE_KEY);
        return;
    }
    localStorage.setItem(VISIBLE_LOCALES_STORAGE_KEY, JSON.stringify(value));
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function buildMonthKey(date = new Date()) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function buildMonthRange(monthKey) {
    const [yearRaw, monthRaw] = String(monthKey || '').split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return buildMonthRange(buildMonthKey(new Date()));
    }

    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    return {
        from: start.toISOString(),
        to: end.toISOString(),
    };
}

function buildLocalKey(local) {
    return `${Number(local?.local_id) || 0}::${String(local?.local_name || '').trim()}`;
}

function buildVisibilityKey(local) {
    const localID = Number(local?.local_id) || 0;
    if (localID > 0) {
        return `id:${localID}`;
    }
    return `name:${String(local?.local_name || '').trim().toLowerCase()}`;
}

function toDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonthLabel(monthKey) {
    const [yearRaw, monthRaw] = String(monthKey || '').split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return monthKey || 'Mes';
    }
    return new Date(year, month - 1, 1).toLocaleDateString('es-CO', {
        month: 'long',
        year: 'numeric',
    });
}

function formatDate(value) {
    const date = toDate(value);
    if (!date) return 'Sin fecha';
    return date.toLocaleDateString('es-CO', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
    });
}

function formatTime(value) {
    const date = toDate(value);
    if (!date) return 'Sin hora';
    return date.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return 'Sin fecha';
    return date.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDuration(totalMinutes) {
    const safe = Number(totalMinutes);
    if (!Number.isFinite(safe) || safe <= 0) return 'Sin cierre';
    const hours = Math.floor(safe / 60);
    const minutes = safe % 60;

    if (hours <= 0) return `${minutes} min`;
    if (minutes <= 0) return `${hours} h`;
    return `${hours} h ${minutes} min`;
}

function changeMonth(monthKey, delta) {
    const [yearRaw, monthRaw] = String(monthKey || '').split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const next = new Date(year, Math.max(0, month - 1), 1);
    next.setMonth(next.getMonth() + delta);
    return buildMonthKey(next);
}

function getStateTone(state) {
    const safe = String(state || '').toLowerCase();
    if (safe === 'abierta') {
        return {
            label: 'Abierta',
            className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
            rowClassName: 'bg-emerald-500/[0.04]',
            icon: 'radio_button_checked',
        };
    }
    if (safe === 'abriendo') {
        return {
            label: 'Abriendo',
            className: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
            rowClassName: 'bg-sky-500/[0.04]',
            icon: 'pending',
        };
    }
    if (safe === 'cerrada') {
        return {
            label: 'Cerrada',
            className: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
            rowClassName: '',
            icon: 'lock',
        };
    }
    return {
        label: safe ? safe : 'Sin estado',
        className: 'border-[var(--border-color)] bg-white/5 text-[var(--text-secondary-color)]',
        rowClassName: '',
        icon: 'help',
    };
}

function getWeekStart(date) {
    const safe = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (safe.getDay() + 6) % 7;
    safe.setDate(safe.getDate() - day);
    safe.setHours(0, 0, 0, 0);
    return safe;
}

function formatWeekRange(startDate) {
    const start = new Date(startDate);
    const end = new Date(startDate);
    end.setDate(end.getDate() + 6);
    const startLabel = start.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    const endLabel = end.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    return `${startLabel} - ${endLabel}`;
}

export default function POSSessions() {
    useTitle('Horarios POS · ATM Ricky Rich');
    const { notify } = useNotifications();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [cards, setCards] = useState([]);
    const [month, setMonth] = useState(() => buildMonthKey(new Date()));
    const [selectedLocalKey, setSelectedLocalKey] = useState('');
    const [configOpen, setConfigOpen] = useState(false);
    const [visibleLocaleKeys, setVisibleLocaleKeys] = useState(() => readVisibleLocalesPreference());
    const [draftVisibleLocaleKeys, setDraftVisibleLocaleKeys] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);

    const loadOverview = useCallback(async () => {
        const { from, to } = buildMonthRange(month);

        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({
                from,
                to,
                limit: '12000',
            });

            const res = await apiFetch(`/api/odoo/pos-sessions?${params.toString()}`, { cache: 'no-cache' });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload?.error || 'No se pudieron cargar las sesiones POS');
            }

            const payload = await res.json();
            setCards(Array.isArray(payload?.data) ? payload.data : []);
            setLastUpdated(new Date());
        } catch (fetchError) {
            const message = String(fetchError?.message || 'Error cargando horarios POS');
            setError(message);
            notify({ type: 'error', message });
        } finally {
            setLoading(false);
        }
    }, [month, notify]);

    useEffect(() => {
        loadOverview();
    }, [loadOverview]);

    const sortedCards = useMemo(() => {
        const next = Array.isArray(cards) ? [...cards] : [];
        next.sort((a, b) => String(a?.local_name || '').localeCompare(String(b?.local_name || ''), 'es', { sensitivity: 'base' }));
        return next;
    }, [cards]);

    const allLocaleOptions = useMemo(() => (
        sortedCards.map((card) => ({
            viewKey: buildLocalKey(card),
            visibilityKey: buildVisibilityKey(card),
            localName: card?.local_name || 'Sin local',
            sessionsCount: Number(card?.sessions_count) || 0,
        }))
    ), [sortedCards]);

    const visibleCards = useMemo(() => {
        if (!Array.isArray(visibleLocaleKeys) || visibleLocaleKeys.length === 0) {
            return sortedCards;
        }
        const allowed = new Set(visibleLocaleKeys);
        return sortedCards.filter((card) => allowed.has(buildVisibilityKey(card)));
    }, [sortedCards, visibleLocaleKeys]);

    useEffect(() => {
        if (configOpen) {
            setDraftVisibleLocaleKeys(
                Array.isArray(visibleLocaleKeys) && visibleLocaleKeys.length > 0
                    ? visibleLocaleKeys
                    : allLocaleOptions.map((option) => option.visibilityKey)
            );
        }
    }, [allLocaleOptions, configOpen, visibleLocaleKeys]);

    useEffect(() => {
        if (visibleCards.length === 0) {
            setSelectedLocalKey('');
            return;
        }

        const exists = visibleCards.some((card) => buildLocalKey(card) === selectedLocalKey);
        if (!exists) {
            setSelectedLocalKey(buildLocalKey(visibleCards[0]));
        }
    }, [selectedLocalKey, visibleCards]);

    const selectedLocal = useMemo(
        () => visibleCards.find((card) => buildLocalKey(card) === selectedLocalKey) || null,
        [selectedLocalKey, visibleCards]
    );

    const selectedLocalSessions = useMemo(() => {
        if (!selectedLocal?.sessions || !Array.isArray(selectedLocal.sessions)) return [];
        const next = [...selectedLocal.sessions];
        next.sort((a, b) => {
            const aDate = toDate(a?.start_at_iso);
            const bDate = toDate(b?.start_at_iso);
            const aTime = aDate ? aDate.getTime() : 0;
            const bTime = bDate ? bDate.getTime() : 0;
            return aTime - bTime;
        });
        return next;
    }, [selectedLocal]);

    const weeklyGroups = useMemo(() => {
        const groupsMap = new Map();

        selectedLocalSessions.forEach((session) => {
            const startDate = toDate(session?.start_at_iso) || toDate(session?.stop_at_iso);
            if (!startDate) return;

            const weekStart = getWeekStart(startDate);
            const weekKey = `${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(weekStart.getDate())}`;
            const dayKey = `${startDate.getFullYear()}-${pad2(startDate.getMonth() + 1)}-${pad2(startDate.getDate())}`;

            if (!groupsMap.has(weekKey)) {
                groupsMap.set(weekKey, {
                    key: weekKey,
                    weekStart,
                    sessions: [],
                    days: new Set(),
                });
            }

            const group = groupsMap.get(weekKey);
            group.sessions.push(session);
            group.days.add(dayKey);
        });

        return Array.from(groupsMap.values())
            .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
            .map((group, index) => ({
                ...group,
                label: `Semana ${index + 1}`,
                daysCount: group.days.size,
                rangeLabel: formatWeekRange(group.weekStart),
            }));
    }, [selectedLocalSessions]);

    const selectedSummary = useMemo(() => {
        if (!selectedLocal) {
            return {
                firstOpen: '',
                lastOpen: '',
                lastClose: '',
            };
        }
        return {
            firstOpen: selectedLocal.first_start_iso || '',
            lastOpen: selectedLocal.last_start_iso || '',
            lastClose: selectedLocal.last_stop_iso || '',
        };
    }, [selectedLocal]);

    const handleMonthChange = (nextMonth) => {
        if (!nextMonth) return;
        setMonth(nextMonth);
    };

    const handleToggleDraftLocale = (key) => {
        setDraftVisibleLocaleKeys((current) => (
            current.includes(key)
                ? current.filter((item) => item !== key)
                : [...current, key]
        ));
    };

    const handleApplyVisibleLocales = () => {
        const allKeys = allLocaleOptions.map((option) => option.visibilityKey);
        const next = allKeys.filter((key) => draftVisibleLocaleKeys.includes(key));

        if (next.length === 0) {
            notify({ type: 'warning', message: 'Selecciona al menos un punto de venta.' });
            return;
        }

        const shouldShowAll = next.length === allKeys.length;
        const finalValue = shouldShowAll ? null : next;
        setVisibleLocaleKeys(finalValue);
        writeVisibleLocalesPreference(finalValue);
        setConfigOpen(false);
    };

    const handleShowAllLocales = () => {
        const allKeys = allLocaleOptions.map((option) => option.visibilityKey);
        setDraftVisibleLocaleKeys(allKeys);
    };

    return (
        <Layout title="Horarios POS">
            <div className="space-y-4">
                <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4 space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-xl font-semibold">Horarios por punto de venta</h2>
                        <p className="text-sm text-[var(--text-secondary-color)]">
                            Mira solo el POS, el día, la hora de apertura y la hora de cierre.
                        </p>
                        {lastUpdated ? (
                            <p className="text-xs text-[var(--text-secondary-color)]">
                                Actualizado: {lastUpdated.toLocaleString('es-CO')}
                            </p>
                        ) : null}
                    </div>

                    <div className="grid grid-cols-[40px,1fr,40px] gap-2">
                        <button
                            onClick={() => handleMonthChange(changeMonth(month, -1))}
                            className="h-11 rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] flex items-center justify-center hover:bg-white/5 transition-colors"
                            title="Mes anterior"
                        >
                            <span className="material-symbols-outlined !text-[20px]">chevron_left</span>
                        </button>

                        <input
                            type="month"
                            value={month}
                            onChange={(event) => handleMonthChange(event.target.value)}
                            className="h-11 px-3 rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] text-sm"
                        />

                        <button
                            onClick={() => handleMonthChange(changeMonth(month, 1))}
                            className="h-11 rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] flex items-center justify-center hover:bg-white/5 transition-colors"
                            title="Mes siguiente"
                        >
                            <span className="material-symbols-outlined !text-[20px]">chevron_right</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                            onClick={() => setConfigOpen((current) => !current)}
                            className="h-11 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] flex items-center justify-between text-sm hover:bg-white/5 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <span className="material-symbols-outlined !text-[18px]">tune</span>
                                Configurar locales
                            </span>
                            <span className="text-xs text-[var(--text-secondary-color)]">
                                {visibleCards.length}/{sortedCards.length}
                            </span>
                        </button>

                        <button
                            onClick={loadOverview}
                            className="h-11 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] flex items-center justify-center gap-2 text-sm hover:bg-white/5 transition-colors"
                        >
                            <span className="material-symbols-outlined !text-[18px]">refresh</span>
                            Actualizar
                        </button>
                    </div>

                    {configOpen ? (
                        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--dark-color)] p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="font-medium">Locales visibles</p>
                                    <p className="text-xs text-[var(--text-secondary-color)]">
                                        Elige los puntos de venta que quieres ver en esta pantalla.
                                    </p>
                                </div>
                                <button
                                    onClick={handleShowAllLocales}
                                    className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border-color)] hover:bg-white/5 transition-colors"
                                >
                                    Mostrar todos
                                </button>
                            </div>

                            <div className="max-h-56 overflow-y-auto space-y-2">
                                {allLocaleOptions.map((option) => {
                                    const checked = draftVisibleLocaleKeys.includes(option.visibilityKey);
                                    return (
                                        <label
                                            key={option.visibilityKey}
                                            className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--card-color)]"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => handleToggleDraftLocale(option.visibilityKey)}
                                                className="h-4 w-4 rounded border-[var(--border-color)] bg-transparent"
                                            />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{option.localName}</p>
                                                <p className="text-xs text-[var(--text-secondary-color)]">
                                                    {option.sessionsCount} sesiones en {formatMonthLabel(month)}
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>

                            <button
                                onClick={handleApplyVisibleLocales}
                                className="w-full h-11 rounded-xl bg-[var(--primary-color)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                            >
                                Aplicar configuración
                            </button>
                        </div>
                    ) : null}
                </section>

                {loading ? (
                    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-10 flex items-center justify-center">
                        <span className="w-9 h-9 border-2 border-[var(--border-color)] border-t-[var(--text-color)] rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 space-y-2">
                        <p className="font-semibold text-red-300">No se pudo cargar el horario de sesiones POS.</p>
                        <p className="text-sm text-red-200/90">{error}</p>
                    </div>
                ) : visibleCards.length === 0 ? (
                    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] px-6 py-12 text-center space-y-2">
                        <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]">storefront</span>
                        <p className="text-sm text-[var(--text-secondary-color)]">
                            No hay locales visibles con la configuración actual.
                        </p>
                        <button
                            onClick={() => {
                                setVisibleLocaleKeys(null);
                                writeVisibleLocalesPreference(null);
                            }}
                            className="inline-flex items-center justify-center h-10 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--card-color)] text-sm hover:bg-white/5 transition-colors"
                        >
                            Mostrar todos los locales
                        </button>
                    </div>
                ) : (
                    <>
                        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4 space-y-3">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Punto de venta</p>
                                <select
                                    value={selectedLocalKey}
                                    onChange={(event) => setSelectedLocalKey(event.target.value)}
                                    className="w-full h-12 px-3 rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] text-sm"
                                >
                                    {visibleCards.map((card) => (
                                        <option key={buildLocalKey(card)} value={buildLocalKey(card)}>
                                            {card.local_name || 'Sin local'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedLocal ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-3">
                                        <p className="text-xs text-[var(--text-secondary-color)]">Días con apertura</p>
                                        <p className="mt-1 text-lg font-semibold">{selectedLocal.days_with_session || 0}</p>
                                    </div>
                                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-3">
                                        <p className="text-xs text-[var(--text-secondary-color)]">Sesiones del mes</p>
                                        <p className="mt-1 text-lg font-semibold">{selectedLocal.sessions_count || 0}</p>
                                    </div>
                                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-3">
                                        <p className="text-xs text-[var(--text-secondary-color)]">Sesiones abiertas</p>
                                        <p className="mt-1 text-lg font-semibold">{selectedLocal.open_sessions || 0}</p>
                                    </div>
                                </div>
                            ) : null}
                        </section>

                        {selectedLocal ? (
                            <>
                                <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] p-4">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-semibold">{selectedLocal.local_name || 'Sin local'}</h3>
                                        <p className="text-sm text-[var(--text-secondary-color)]">
                                            {formatMonthLabel(month)}
                                        </p>
                                    </div>

                                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                                        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-3">
                                            <p className="text-xs text-[var(--text-secondary-color)]">Primera apertura</p>
                                            <p className="mt-1 font-medium">{formatDateTime(selectedSummary.firstOpen)}</p>
                                        </div>
                                        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-3">
                                            <p className="text-xs text-[var(--text-secondary-color)]">Última apertura</p>
                                            <p className="mt-1 font-medium">{formatDateTime(selectedSummary.lastOpen)}</p>
                                        </div>
                                        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-3">
                                            <p className="text-xs text-[var(--text-secondary-color)]">Último cierre</p>
                                            <p className="mt-1 font-medium">{formatDateTime(selectedSummary.lastClose)}</p>
                                        </div>
                                    </div>
                                </section>

                                {weeklyGroups.length === 0 ? (
                                    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] px-6 py-10 text-center">
                                        <span className="material-symbols-outlined text-4xl text-[var(--text-secondary-color)]">event_busy</span>
                                        <p className="text-sm text-[var(--text-secondary-color)] mt-2">
                                            Este local no registró aperturas en {formatMonthLabel(month)}.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {weeklyGroups.map((group) => (
                                            <section
                                                key={group.key}
                                                className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-color)] overflow-hidden"
                                            >
                                                <div className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--dark-color)]">
                                                    <p className="font-semibold">{group.label}</p>
                                                    <p className="text-xs text-[var(--text-secondary-color)]">
                                                        {group.rangeLabel} · {group.daysCount} día(s)
                                                    </p>
                                                </div>

                                                <div className="divide-y divide-[var(--border-color)]">
                                                    {group.sessions.map((session) => {
                                                        const tone = getStateTone(session?.session_state);
                                                        return (
                                                            <article
                                                                key={`${session?.session_id || ''}-${session?.start_at_iso || ''}`}
                                                                className={`p-4 space-y-3 ${tone.rowClassName}`}
                                                            >
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <p className="font-medium">{formatDate(session?.start_at_iso || session?.stop_at_iso)}</p>
                                                                        <p className="text-xs text-[var(--text-secondary-color)] truncate">
                                                                            {session?.session_name || `Sesión #${session?.session_id || '-'}`}
                                                                        </p>
                                                                    </div>
                                                                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${tone.className}`}>
                                                                        <span className="material-symbols-outlined !text-[14px]">{tone.icon}</span>
                                                                        {tone.label}
                                                                    </span>
                                                                </div>

                                                                <div className="grid grid-cols-3 gap-2 text-center">
                                                                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] px-2 py-3">
                                                                        <p className="text-[11px] text-[var(--text-secondary-color)]">Abre</p>
                                                                        <p className="mt-1 font-semibold">{formatTime(session?.start_at_iso)}</p>
                                                                    </div>
                                                                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] px-2 py-3">
                                                                        <p className="text-[11px] text-[var(--text-secondary-color)]">Cierra</p>
                                                                        <p className="mt-1 font-semibold">
                                                                            {session?.stop_at_iso ? formatTime(session?.stop_at_iso) : 'Abierta'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--dark-color)] px-2 py-3">
                                                                        <p className="text-[11px] text-[var(--text-secondary-color)]">Duración</p>
                                                                        <p className="mt-1 font-semibold">{formatDuration(session?.duration_minutes)}</p>
                                                                    </div>
                                                                </div>
                                                            </article>
                                                        );
                                                    })}
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : null}
                    </>
                )}
            </div>
        </Layout>
    );
}
