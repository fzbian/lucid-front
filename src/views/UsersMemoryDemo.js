import React, { useMemo, useState } from 'react';
import data from '../users.json';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { useNavigate } from 'react-router-dom';

// Pequeño “repositorio” en memoria a partir del JSON importado.
// No persiste a disco: solo vive mientras el componente está montado.
export default function UsersMemoryDemo() {
  const navigate = useNavigate();
  // Clonamos los datos para trabajar en memoria sin mutar el import directamente
  const initial = useMemo(() => JSON.parse(JSON.stringify(data)), []);
  const [state, setState] = useState(initial);
  const [form, setForm] = useState({ username: '', displayName: '', pin: '', role: 'user' });
  const [editingIdx, setEditingIdx] = useState(-1);

  const resetForm = () => setForm({ username: '', displayName: '', pin: '', role: 'user' });

  const onSubmit = (e) => {
    e.preventDefault();
    const u = { ...form };
    if (!u.username || !u.pin) return;

    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (editingIdx >= 0) {
        next.usuarios[editingIdx] = u;
      } else {
        next.usuarios.push(u);
      }
      return next;
    });
    setEditingIdx(-1);
    resetForm();
  };

  const onEdit = (idx) => {
    setEditingIdx(idx);
    const u = state.usuarios[idx];
    setForm(u);
  };

  const onDelete = (idx) => {
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.usuarios.splice(idx, 1);
      return next;
    });
    if (editingIdx === idx) {
      setEditingIdx(-1);
      resetForm();
    }
  };

  const onResetToJson = () => {
    // Restablece el estado en memoria al contenido original del import
    setState(JSON.parse(JSON.stringify(initial)));
    setEditingIdx(-1);
    resetForm();
  };

  return (
    <div className="min-h-screen bg-[var(--background-color)] text-[var(--text-color)] flex flex-col">
      <Header title="Usuarios (en memoria)" />
      <main className="flex-1 p-6 space-y-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        <p className="text-[var(--text-secondary-color)] text-sm">Este demo carga usuarios desde <code>src/users.json</code> con import estático. Los cambios solo viven en memoria.</p>

        <section className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-lg p-4">
          <h2 className="font-semibold mb-3">Agregar / Editar</h2>
          <form onSubmit={onSubmit} className="grid gap-3">
            <div>
              <label className="block text-xs mb-1">Usuario</label>
              <input className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                value={form.username} onChange={e=>setForm(v=>({ ...v, username: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs mb-1">Nombre para mostrar</label>
              <input className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                value={form.displayName} onChange={e=>setForm(v=>({ ...v, displayName: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs mb-1">PIN</label>
              <input className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm" type="password"
                value={form.pin} onChange={e=>setForm(v=>({ ...v, pin: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs mb-1">Rol</label>
              <select className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                value={form.role} onChange={e=>setForm(v=>({ ...v, role: e.target.value }))}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-3 py-2 rounded-lg bg-[var(--primary-color)] text-white">{editingIdx>=0? 'Guardar cambios' : 'Agregar'}</button>
              <button type="button" className="px-3 py-2 rounded-lg border border-[var(--border-color)]" onClick={resetForm}>Limpiar</button>
              <button type="button" className="ml-auto px-3 py-2 rounded-lg border border-[var(--border-color)]" onClick={onResetToJson}>Restablecer desde JSON</button>
            </div>
          </form>
        </section>

        <section className="bg-[var(--card-color)] border border-[var(--border-color)] rounded-lg p-4">
          <h2 className="font-semibold mb-3">Lista</h2>
          <ul className="divide-y divide-[var(--border-color)]">
            {state.usuarios.map((u, idx) => (
              <li key={u.username} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{u.displayName || u.username}</p>
                  <p className="text-xs text-[var(--text-secondary-color)]">{u.username} • rol: {u.role || 'user'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 rounded-lg border border-[var(--border-color)] hover:bg-white/5" onClick={()=>onEdit(idx)}>
                    <span className="material-symbols-outlined !text-base">edit</span>
                  </button>
                  <button className="px-2 py-1 rounded-lg border border-[var(--danger-color)] text-[var(--danger-color)] hover:bg-red-900/10" onClick={()=>onDelete(idx)}>
                    <span className="material-symbols-outlined !text-base">delete</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <BottomNav
        onHome={() => navigate('/dashboard')}
        onMovements={() => navigate('/movements')}
        onWallet={() => navigate('/wallet')}
        onReports={() => navigate('/reports')}
        onCreateMovement={() => navigate('/new')}
        onCashout={() => navigate('/cashout')}
        onCashoutBank={() => navigate('/cashout-bank')}
        active={null}
      />
    </div>
  );
}
