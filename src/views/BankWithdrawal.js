import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
// import BottomNav from '../components/BottomNav';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import useTitle from '../useTitle';
import { getSessionUsername, getUsers } from '../auth';
import { useNotifications } from '../components/Notifications';
import { formatCLP } from '../formatMoney';

export default function BankWithdrawal() {
  useTitle('Retirar dinero de banco · ATM Ricky Rich');
  const navigate = useNavigate();
  const { notify } = useNotifications();

  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const uname = getSessionUsername();
        const list = await getUsers();
        const arr = Array.isArray(list) ? list : [];
        const me = arr.find(u => u.username === uname);
        setDisplayName(me?.displayName || uname || '');
      } catch {
        setDisplayName(getSessionUsername() || '');
      }
    })();
  }, []);

  // Physical Keyboard Support
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prevent default behavior if needed, e.g. preventing scrolling on Space, but strict numeric handling usually avoids this.

      if (e.key >= '0' && e.key <= '9') {
        setAmount(prev => (prev.length < 9 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        setAmount(prev => prev.slice(0, -1));
      } else if (e.key === 'Delete' || e.key === 'Escape') {
        setAmount('');
      } else if (e.key === 'Enter') {
        // Trigger submit strictly if valid
        // We can't easily invoke onSubmit directly if it relies on current state scope without refs or specific patterns, 
        // but since we are inside the component, we can call it if we wrap it or just use the button ref.
        // Actually, since onSubmit uses 'amount' state, and this effect closes over 'amount' if we looked at it, 
        // BUT we are only setting state here.
        // To submit via Enter, we need to call onSubmit. However, onSubmit depends on 'amount' which might be stale in a simplified closure.
        // Best way: use a ref to access current amount or just let the user click. 
        // Or better, let's just create a ref for the submit button and click it.
        document.getElementById('btn-confirm-withdrawal')?.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    const n = Number(amount);
    if (!n || Number.isNaN(n) || n <= 0) return setError('Monto inválido');

    const usuario = displayName || getSessionUsername() || '';
    const body = { monto: n, usuario, Descripcion: 'Retiro de efectivo desde Cuenta bancaria' };

    try {
      setLoading(true);
      const r = await apiFetch('/api/cuenta/retiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        let msg = 'No se pudo completar el retiro';
        try { const d = await r.json(); if (d?.error) msg = d.error; } catch { msg = await r.text().catch(() => msg) || msg; }
        notify({ type: 'error', title: 'Retiro fallido', message: msg });
        throw new Error(msg);
      }
      const data = await r.json().catch(() => null);
      notify({ type: 'success', title: 'Retiro realizado', message: data?.ingreso?.id ? `OK: Tx ${data.egreso?.id} y ${data.ingreso?.id} por ${formatCLP(n)}.` : `OK por ${formatCLP(n)}.` });
      navigate('/movements', { state: { reload: true } });
    } catch (e2) {
      setError(e2.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Retirar dinero de banco">
      <div className="flex-1 p-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] view-enter view-enter-active">
        <div className="flex flex-col h-full max-w-md mx-auto relative z-10">

          {/* 1. Pantalla de Monto (Display ATM) */}
          <div className="flex-none mb-6">
            <div className="bg-[#1e293b]/80 backdrop-blur-xl border-2 border-blue-500/30 rounded-2xl p-6 text-right shadow-[0_0_30px_-10px_rgba(59,130,246,0.3)] relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-50" />
              <p className="text-blue-200/60 text-xs font-semibold uppercase tracking-wider mb-1">Monto a retirar</p>
              <div className="flex items-center justify-end gap-1">
                <span className="text-3xl text-blue-400 font-light">$</span>
                <span className={`text-5xl font-mono font-bold tracking-tight ${!amount ? 'text-white/20' : 'text-white'}`}>
                  {amount ? Number(amount).toLocaleString('es-CL') : '0'}
                </span>
              </div>
            </div>
            {/* Presets Rápidos */}
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[50000, 100000, 200000, 500000].map(val => (
                <button
                  key={val}
                  onClick={() => setAmount(String(val))}
                  className="py-2 px-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-[10px] sm:text-xs font-semibold hover:bg-blue-500/20 active:scale-95 transition-all text-center"
                >
                  {formatCLP(val)}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Teclado Numérico (Keypad) */}
          <div className="flex-1 bg-[var(--card-color)]/50 rounded-3xl border border-[var(--border-color)] p-4 shadow-xl backdrop-blur-sm">
            <div className="grid grid-cols-3 gap-3 h-full">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  onClick={() => setAmount(prev => (prev.length < 9 ? prev + num : prev))}
                  className="rounded-2xl bg-white/[0.03] border border-white/5 text-2xl font-semibold text-white hover:bg-white/10 active:bg-blue-500/20 active:border-blue-500/50 active:scale-95 transition-all flex items-center justify-center shadow-sm"
                >
                  {num}
                </button>
              ))}
              {/* Special Keys */}
              <button
                onClick={() => setAmount('')}
                className="rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold hover:bg-red-500/20 active:scale-95 transition-all flex flex-col items-center justify-center"
              >
                <span className="text-xs uppercase">Borrar</span>
                <span className="material-symbols-outlined text-xl">delete</span>
              </button>

              <button
                onClick={() => setAmount(prev => (prev.length < 9 ? prev + '0' : prev))}
                className="rounded-2xl bg-white/[0.03] border border-white/5 text-2xl font-semibold text-white hover:bg-white/10 active:bg-blue-500/20 active:border-blue-500/50 active:scale-95 transition-all flex items-center justify-center shadow-sm"
              >
                0
              </button>

              <button
                onClick={() => setAmount(prev => prev.slice(0, -1))}
                className="rounded-2xl bg-white/[0.03] border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-xl">backspace</span>
              </button>
            </div>
          </div>

          {/* 3. Botón Principal */}
          <div className="mt-6">
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm flex items-center gap-2 animate-bounce">
                <span className="material-symbols-outlined text-lg">error_outline</span>
                {error}
              </div>
            )}

            <button
              id="btn-confirm-withdrawal"
              onClick={onSubmit}
              disabled={loading || !amount || Number(amount) <= 0}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold text-lg shadow-[0_0_20px_-5px_rgba(59,130,246,0.6)] hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.8)] hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:transform-none transition-all flex items-center justify-center gap-3"
            >
              {loading ? (
                <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Confirmar Retiro</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
