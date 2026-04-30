import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { getRoleConfigs, saveRoleConfig } from '../configApi';
import { loadUsers } from '../usersApi';
import { useRole } from '../context/RoleContext';
import {
    ROLE_VIEW_GROUPS,
    VIEW_BY_ID,
    VIEW_IDS,
    buildRoleConfigMap,
    getRoleLabel,
    normalizeViewIds,
} from '../roleViews';

const ROLE_PATTERN = /^[a-z0-9._-]{2,50}$/;

function cloneMap(map) {
    return Object.entries(map || {}).reduce((acc, [role, views]) => {
        acc[role] = normalizeViewIds(Array.isArray(views) ? views : []);
        return acc;
    }, {});
}

function sortRoles(roles) {
    const priority = { admin: 0, user: 1, finance: 2 };
    return [...new Set((roles || []).map((r) => String(r || '').trim().toLowerCase()).filter(Boolean))]
        .sort((a, b) => {
            const pa = priority[a] ?? 99;
            const pb = priority[b] ?? 99;
            if (pa !== pb) return pa - pb;
            return a.localeCompare(b, 'es');
        });
}

function sameViews(a, b) {
    const left = normalizeViewIds(a);
    const right = normalizeViewIds(b);
    if (left.length !== right.length) return false;
    return left.every((viewId, index) => viewId === right[index]);
}

export default function AdminRoles() {
    const { reloadConfig } = useRole();

    const [configs, setConfigs] = useState({});
    const [savedConfigs, setSavedConfigs] = useState({});
    const [roles, setRoles] = useState([]);
    const [selectedRole, setSelectedRole] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [pendingNewRoles, setPendingNewRoles] = useState([]);

    const [query, setQuery] = useState('');
    const [newRole, setNewRole] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const [rolesConfigResult, usersResult] = await Promise.allSettled([
                getRoleConfigs(),
                loadUsers(),
            ]);

            if (rolesConfigResult.status !== 'fulfilled') {
                throw rolesConfigResult.reason || new Error('No se pudieron cargar los roles');
            }

            const map = buildRoleConfigMap(rolesConfigResult.value);

            const userRoles = usersResult.status === 'fulfilled'
                ? usersResult.value.map((u) => String(u?.role || '').trim().toLowerCase()).filter(Boolean)
                : [];

            const mergedRoles = sortRoles([
                ...Object.keys(map),
                ...userRoles,
                'admin',
                'user',
                'finance',
            ]);

            const completedMap = { ...map };
            mergedRoles.forEach((role) => {
                if (!Array.isArray(completedMap[role])) {
                    completedMap[role] = [];
                }
            });

            const cleanMap = cloneMap(completedMap);
            const sortedRoles = sortRoles(mergedRoles);

            setConfigs(cleanMap);
            setSavedConfigs(cloneMap(cleanMap));
            setRoles(sortedRoles);
            setSelectedRole((prev) => (prev && sortedRoles.includes(prev) ? prev : (sortedRoles[0] || 'user')));
            setPendingNewRoles([]);
        } catch (e) {
            setError(e?.message || 'Error cargando configuraciones');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const roleViews = useMemo(() => normalizeViewIds(configs[selectedRole] || []), [configs, selectedRole]);
    const enabledCount = roleViews.length;
    const totalCount = VIEW_IDS.length;

    const hasUnsavedChanges = useMemo(() => {
        if (pendingNewRoles.includes(selectedRole)) return true;
        return !sameViews(configs[selectedRole] || [], savedConfigs[selectedRole] || []);
    }, [configs, pendingNewRoles, savedConfigs, selectedRole]);

    const visibleViewIds = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return VIEW_IDS;

        return VIEW_IDS.filter((viewId) => {
            const view = VIEW_BY_ID[viewId];
            if (!view) return false;
            return [view.id, view.label, view.description, view.path]
                .some((field) => String(field || '').toLowerCase().includes(q));
        });
    }, [query]);

    const visibleSet = useMemo(() => new Set(visibleViewIds), [visibleViewIds]);

    const groups = useMemo(() => {
        return ROLE_VIEW_GROUPS
            .map((group) => ({
                ...group,
                views: group.viewIds
                    .filter((viewId) => visibleSet.has(viewId))
                    .map((viewId) => VIEW_BY_ID[viewId])
                    .filter(Boolean),
            }))
            .filter((group) => group.views.length > 0);
    }, [visibleSet]);

    const updateRoleViews = (role, nextViews) => {
        const safeRole = String(role || '').trim().toLowerCase();
        if (!safeRole) return;

        let normalized = normalizeViewIds(nextViews);
        if (safeRole === 'admin' && !normalized.includes('admin/roles')) {
            normalized = normalizeViewIds([...normalized, 'admin/roles']);
        }

        setConfigs((prev) => ({
            ...prev,
            [safeRole]: normalized,
        }));
        setSuccess('');
    };

    const isLockedView = (viewId) => selectedRole === 'admin' && viewId === 'admin/roles';

    const toggleView = (viewId) => {
        if (!selectedRole || isLockedView(viewId)) return;

        const current = new Set(configs[selectedRole] || []);
        if (current.has(viewId)) {
            current.delete(viewId);
        } else {
            current.add(viewId);
        }

        updateRoleViews(selectedRole, Array.from(current));
    };

    const applyToVisible = (enable) => {
        if (!selectedRole) return;

        const current = new Set(configs[selectedRole] || []);

        visibleViewIds.forEach((viewId) => {
            if (isLockedView(viewId)) return;
            if (enable) current.add(viewId);
            else current.delete(viewId);
        });

        updateRoleViews(selectedRole, Array.from(current));
    };

    const applyAll = (enable) => {
        if (!selectedRole) return;

        if (enable) {
            updateRoleViews(selectedRole, VIEW_IDS);
            return;
        }

        const next = selectedRole === 'admin' ? ['admin/roles'] : [];
        updateRoleViews(selectedRole, next);
    };

    const handleSave = async () => {
        if (!selectedRole || saving || !hasUnsavedChanges) return;

        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const response = await saveRoleConfig(selectedRole, configs[selectedRole] || []);
            const savedViews = normalizeViewIds(configs[selectedRole] || []);

            setConfigs((prev) => ({ ...prev, [selectedRole]: savedViews }));
            setSavedConfigs((prev) => ({ ...prev, [selectedRole]: savedViews }));
            setPendingNewRoles((prev) => prev.filter((role) => role !== selectedRole));

            await reloadConfig();
            setSuccess(`Permisos guardados para el rol "${response?.role || selectedRole}".`);
        } catch (e) {
            setError(e?.message || 'No se pudo guardar la configuración');
        } finally {
            setSaving(false);
        }
    };

    const handleResetRole = () => {
        if (!selectedRole) return;
        updateRoleViews(selectedRole, savedConfigs[selectedRole] || []);
    };

    const handleCreateRole = () => {
        const role = String(newRole || '').trim().toLowerCase();

        if (!role) {
            setError('Ingresa un nombre para el rol.');
            return;
        }

        if (!ROLE_PATTERN.test(role)) {
            setError('El rol solo puede contener letras minúsculas, números, punto, guion y guion bajo (2-50 caracteres).');
            return;
        }

        if (roles.includes(role)) {
            setError(`El rol "${role}" ya existe.`);
            return;
        }

        const nextRoles = sortRoles([...roles, role]);
        setRoles(nextRoles);
        setConfigs((prev) => ({ ...prev, [role]: [] }));
        setSavedConfigs((prev) => ({ ...prev, [role]: [] }));
        setPendingNewRoles((prev) => [...new Set([...prev, role])]);
        setSelectedRole(role);
        setNewRole('');
        setError('');
        setSuccess(`Rol "${role}" creado localmente. Guarda para persistir permisos.`);
    };

    return (
        <Layout title="Roles y permisos">
            <div className="space-y-6 view-enter view-enter-active">
                <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-color)] p-4 sm:p-5">
                    <h2 className="text-lg font-semibold">Control de vistas por rol</h2>
                    <p className="text-sm text-[var(--text-secondary-color)] mt-1">
                        Activa o desactiva vistas para cada rol. Los cambios aplican al menú y al acceso directo por URL.
                    </p>
                </div>

                {error && (
                    <div className="rounded-lg border border-red-400/40 bg-red-500/10 text-red-200 text-sm px-4 py-3 flex items-center justify-between gap-3">
                        <span>{error}</span>
                        <button className="text-xs underline" onClick={() => setError('')}>Cerrar</button>
                    </div>
                )}

                {success && (
                    <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 text-sm px-4 py-3 flex items-center justify-between gap-3">
                        <span>{success}</span>
                        <button className="text-xs underline" onClick={() => setSuccess('')}>Cerrar</button>
                    </div>
                )}

                {loading ? (
                    <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-color)] p-6">
                        <div className="space-y-3 animate-pulse">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div key={index} className="h-12 rounded-lg bg-white/10" />
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-color)] p-4 sm:p-5 space-y-4">
                            <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
                                <div className="flex flex-wrap gap-2">
                                    {roles.map((role) => (
                                        <button
                                            key={role}
                                            onClick={() => {
                                                setSelectedRole(role);
                                                setSuccess('');
                                            }}
                                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedRole === role
                                                ? 'bg-[var(--primary-color)] text-white'
                                                : 'bg-[var(--dark-color)] border border-[var(--border-color)] text-[var(--text-secondary-color)] hover:bg-white/5'
                                                }`}
                                        >
                                            {getRoleLabel(role)}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex w-full lg:w-auto items-center gap-2">
                                    <input
                                        value={newRole}
                                        onChange={(e) => setNewRole(e.target.value)}
                                        placeholder="nuevo_rol"
                                        className="w-full lg:w-44 bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                                    />
                                    <button
                                        onClick={handleCreateRole}
                                        className="px-3 py-2 rounded-lg bg-[var(--primary-color)] text-white text-sm hover:opacity-90"
                                    >
                                        Crear rol
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-2">
                                    <p className="text-[var(--text-secondary-color)] text-xs">Rol seleccionado</p>
                                    <p className="font-medium">{selectedRole || 'N/A'}</p>
                                </div>
                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-2">
                                    <p className="text-[var(--text-secondary-color)] text-xs">Vistas activas</p>
                                    <p className="font-medium">{enabledCount} / {totalCount}</p>
                                </div>
                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--dark-color)] px-3 py-2">
                                    <p className="text-[var(--text-secondary-color)] text-xs">Estado</p>
                                    <p className={`font-medium ${hasUnsavedChanges ? 'text-amber-300' : 'text-emerald-300'}`}>
                                        {hasUnsavedChanges ? 'Cambios sin guardar' : 'Sin cambios pendientes'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-color)] p-4 sm:p-5 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Buscar vista por nombre o ruta"
                                    className="w-full sm:max-w-md bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                                />

                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => applyAll(true)} className="px-3 py-2 rounded-lg text-sm border border-[var(--border-color)] hover:bg-white/5">Activar todo</button>
                                    <button onClick={() => applyAll(false)} className="px-3 py-2 rounded-lg text-sm border border-[var(--border-color)] hover:bg-white/5">Limpiar todo</button>
                                    <button onClick={() => applyToVisible(true)} className="px-3 py-2 rounded-lg text-sm border border-[var(--border-color)] hover:bg-white/5">Activar visibles</button>
                                    <button onClick={() => applyToVisible(false)} className="px-3 py-2 rounded-lg text-sm border border-[var(--border-color)] hover:bg-white/5">Limpiar visibles</button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {groups.length === 0 ? (
                                    <div className="text-sm text-[var(--text-secondary-color)] border border-[var(--border-color)] rounded-lg px-4 py-6 text-center">
                                        No hay vistas que coincidan con tu búsqueda.
                                    </div>
                                ) : (
                                    groups.map((group) => (
                                        <section key={group.id} className="space-y-3">
                                            <div>
                                                <h3 className="font-semibold">{group.label}</h3>
                                                <p className="text-xs text-[var(--text-secondary-color)]">{group.description}</p>
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                {group.views.map((view) => {
                                                    const enabled = roleViews.includes(view.id);
                                                    const locked = isLockedView(view.id);

                                                    return (
                                                        <label
                                                            key={view.id}
                                                            className={`p-3 rounded-lg border transition-colors cursor-pointer ${enabled
                                                                ? 'border-[var(--primary-color)]/40 bg-[var(--primary-color)]/10'
                                                                : 'border-[var(--border-color)] hover:bg-white/5'
                                                                } ${locked ? 'opacity-80 cursor-not-allowed' : ''}`}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={enabled}
                                                                    onChange={() => toggleView(view.id)}
                                                                    disabled={locked}
                                                                    className="mt-1 w-5 h-5 rounded border-gray-600 bg-transparent text-[var(--primary-color)] focus:ring-0 focus:ring-offset-0"
                                                                />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <p className="font-medium text-sm">{view.label}</p>
                                                                        <span className="text-[10px] px-2 py-1 rounded bg-black/20 border border-[var(--border-color)]">{view.id}</span>
                                                                    </div>
                                                                    <p className="text-xs text-[var(--text-secondary-color)] mt-1">{view.description}</p>
                                                                    <p className="text-[11px] text-[var(--text-secondary-color)] mt-2">Ruta: {view.path}</p>
                                                                    {locked && (
                                                                        <p className="text-[11px] text-amber-300 mt-2">Este permiso es obligatorio para evitar bloqueo de administracion.</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    ))
                                )}
                            </div>

                            <div className="pt-2 border-t border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <p className="text-xs text-[var(--text-secondary-color)]">
                                    {hasUnsavedChanges ? 'Hay cambios pendientes para este rol.' : 'Todos los cambios estan guardados.'}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleResetRole}
                                        disabled={!hasUnsavedChanges || saving}
                                        className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-sm hover:bg-white/5 disabled:opacity-50"
                                    >
                                        Revertir
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={!hasUnsavedChanges || saving}
                                        className="px-5 py-2 rounded-lg bg-[var(--primary-color)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {saving && <span className="material-symbols-outlined animate-spin text-sm">sync</span>}
                                        Guardar cambios
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
}
