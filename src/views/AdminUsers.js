import React, { useEffect, useMemo, useState } from 'react';
import { getSessionUsername } from '../auth';
import { loadUsers, createUser, deleteUser, syncUsers } from '../usersApi';
import Layout from '../components/Layout';

const normalizeUsername = (s) => {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n');
};

export default function AdminUsers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    username: '',
    pin: '',
    pay_type: 'daily',
    daily_rate: '',
    base_salary: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const self = getSessionUsername();
  const canManage = useMemo(() => (u) => u?.username !== self, [self]);

  const refreshUsers = async () => {
    const users = await loadUsers();
    setList(Array.isArray(users) ? users : []);
  };

  useEffect(() => {
    (async () => {
      try {
        await refreshUsers();
      } catch (e) {
        setError(e.message || 'Error al cargar usuarios');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSync = async () => {
    if (!window.confirm('¿Sincronizar usuarios con Odoo? Esto puede actualizar nombres y PIN.')) return;

    setSyncing(true);
    try {
      const res = await syncUsers();
      await refreshUsers();
      alert(res.message || 'Sincronizacion completa');
    } catch (e) {
      alert(e.message || 'Error sincronizando usuarios');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (u) => {
    if (!canManage(u)) return;
    if (!window.confirm(`¿Eliminar a "${u.name || u.username}"?\n\nEsto tambien eliminara sus datos de nomina relacionados en esta BD.`)) return;

    try {
      await deleteUser(u.username);
      setList((prev) => prev.filter((x) => x.username !== u.username));
    } catch (e) {
      window.alert(e.message || 'Error eliminando usuario');
    }
  };

  const openCreate = () => {
    setCreateForm({
      name: '',
      username: '',
      pin: '',
      pay_type: 'daily',
      daily_rate: '',
      base_salary: '',
    });
    setCreateError('');
    setCreateModalOpen(true);
  };

  const updateCreateForm = (field, value) => {
    setCreateForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'name') next.username = normalizeUsername(value);
      return next;
    });
  };

  const onSaveCreate = async () => {
    setCreateError('');

    if (!createForm.name.trim()) {
      setCreateError('El nombre es requerido');
      return;
    }
    if (!createForm.username.trim()) {
      setCreateError('El usuario es requerido');
      return;
    }

    setCreating(true);
    try {
      await createUser({
        name: createForm.name.trim(),
        username: createForm.username.trim(),
        pin: createForm.pin || null,
        role: 'user',
        pay_type: createForm.pay_type,
        daily_rate: createForm.pay_type === 'daily' ? Number(createForm.daily_rate) || 0 : 0,
        base_salary: createForm.pay_type === 'fixed' ? Number(createForm.base_salary) || 0 : 0,
      });

      await refreshUsers();
      setCreateModalOpen(false);
    } catch (e) {
      setCreateError(e.message || 'Error al crear empleado');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout title="Usuarios">
      <div className="space-y-4 view-enter view-enter-active">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-white/10" />
            ))}
          </div>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Gestion de usuarios</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={openCreate}
                  className="px-3 py-2 rounded-lg bg-[var(--primary-color)] hover:brightness-110 flex items-center gap-2 text-sm font-bold"
                >
                  <span className="material-symbols-outlined text-base">person_add</span>
                  Nuevo
                </button>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="px-3 py-2 rounded-lg bg-[var(--card-color)] border border-[var(--border-color)] hover:bg-white/5 flex items-center gap-2 text-sm"
                >
                  <span className={`material-symbols-outlined ${syncing ? 'animate-spin' : ''}`}>sync</span>
                  {syncing ? '...' : 'Sincronizar'}
                </button>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary-color)]">
              Usuarios sincronizados desde Odoo o creados manualmente. Los permisos por rol estan deshabilitados temporalmente.
            </p>

            <ul className="bg-[var(--card-color)] rounded-lg border border-[var(--border-color)] divide-y divide-[var(--border-color)]">
              {list.map((u) => (
                <li key={u.username} className="p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{u.name || u.username}</p>
                    <p className="text-xs text-[var(--text-secondary-color)]">
                      {u.username}
                      {!u.odoo_id && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Manual</span>
                      )}
                    </p>
                  </div>

                  {canManage(u) && (
                    <button
                      className="px-2 py-1 rounded-lg border border-red-500/20 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      onClick={() => handleDelete(u)}
                      title="Eliminar usuario"
                    >
                      <span className="material-symbols-outlined !text-base">delete</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setCreateModalOpen(false)}>
          <div className="w-full max-w-lg bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[var(--primary-color)]">person_add</span>
              Nuevo Empleado
            </h3>

            {createError && (
              <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {createError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Nombre *</label>
                <input
                  className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary-color)] focus:outline-none"
                  placeholder="Nombre completo"
                  value={createForm.name}
                  onChange={(e) => updateCreateForm('name', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Usuario *</label>
                <input
                  className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary-color)] focus:outline-none"
                  placeholder="usuario"
                  value={createForm.username}
                  onChange={(e) => updateCreateForm('username', e.target.value)}
                />
                <p className="text-[10px] text-[var(--text-secondary-color)] mt-0.5">Se genera automaticamente del nombre</p>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">PIN (opcional)</label>
                <input
                  className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary-color)] focus:outline-none"
                  placeholder="PIN de acceso"
                  type="password"
                  value={createForm.pin}
                  onChange={(e) => updateCreateForm('pin', e.target.value)}
                />
              </div>

              <div className="border-t border-[var(--border-color)] pt-3">
                <p className="text-xs text-[var(--text-secondary-color)] font-bold uppercase tracking-wider mb-2">Configuracion de Pago</p>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Tipo de pago</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      createForm.pay_type === 'daily'
                        ? 'bg-[var(--primary-color)]/20 border-[var(--primary-color)] text-[var(--primary-color)]'
                        : 'border-[var(--border-color)] text-[var(--text-secondary-color)] hover:bg-white/5'
                    }`}
                    onClick={() => updateCreateForm('pay_type', 'daily')}
                  >
                    Por Dia
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      createForm.pay_type === 'fixed'
                        ? 'bg-[var(--primary-color)]/20 border-[var(--primary-color)] text-[var(--primary-color)]'
                        : 'border-[var(--border-color)] text-[var(--text-secondary-color)] hover:bg-white/5'
                    }`}
                    onClick={() => updateCreateForm('pay_type', 'fixed')}
                  >
                    Fijo Mensual
                  </button>
                </div>
              </div>

              {createForm.pay_type === 'daily' && (
                <div>
                  <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Tarifa diaria ($)</label>
                  <input
                    className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary-color)] focus:outline-none"
                    placeholder="0"
                    type="number"
                    min="0"
                    value={createForm.daily_rate}
                    onChange={(e) => updateCreateForm('daily_rate', e.target.value)}
                  />
                </div>
              )}

              {createForm.pay_type === 'fixed' && (
                <div>
                  <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Salario base mensual ($)</label>
                  <input
                    className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary-color)] focus:outline-none"
                    placeholder="0"
                    type="number"
                    min="0"
                    value={createForm.base_salary}
                    onChange={(e) => updateCreateForm('base_salary', e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                className="flex-1 py-2.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary-color)] hover:bg-white/5"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                className="flex-1 py-2.5 rounded-lg bg-[var(--primary-color)] text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 font-bold"
                onClick={onSaveCreate}
                disabled={creating}
              >
                {creating && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                Crear Empleado
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
