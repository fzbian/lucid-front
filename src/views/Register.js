import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUser } from '../usersApi';
import { login, isAuthenticated } from '../auth';
import useTitle from '../useTitle';

export default function Register() {
  const navigate = useNavigate();
  useTitle('Crear cuenta · ATM Ricky Rich');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(()=>{
    if (isAuthenticated()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    const u = username.trim();
    const dn = displayName.trim();
    const p1 = pin.trim();
    const p2 = pin2.trim();
    if (!u || !dn) return setError('Usuario y nombre son requeridos');
    if (!/^[-a-z0-9_.]{3,}$/i.test(u)) return setError('Usuario inválido (mín. 3, solo letras/números/._-)');
    if (p1.length < 4 || p1.length > 8) return setError('PIN debe tener 4 a 8 dígitos');
    if (p1 !== p2) return setError('Los PIN no coinciden');
    setLoading(true);
    try {
      await createUser({ username: u, displayName: dn, pin: p1 });
      await login(u, p1);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo registrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background-color)] text-[var(--text-color)] flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-[var(--card-color)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6">
        <div className="text-center mb-4">
          <img src="/logo.png" alt="ATM Ricky Rich" className="mx-auto h-14 w-14 object-contain mb-2" />
          <h1 className="text-xl font-bold">Crear cuenta</h1>
          <p className="text-sm text-[var(--text-secondary-color)] mt-1">Regístrate para usar la app</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Usuario</label>
            <input className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
              value={username} onChange={e=>setUsername(e.target.value)} placeholder="ej: juan" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Nombre a mostrar</label>
            <input className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
              value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Juan Pérez" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary-color)] mb-1">PIN</label>
            <input type="password" inputMode="numeric" pattern="[0-9]*" className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
              value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,8))} placeholder="****" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary-color)] mb-1">Confirmar PIN</label>
            <input type="password" inputMode="numeric" pattern="[0-9]*" className="w-full bg-[var(--dark-color)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
              value={pin2} onChange={e=>setPin2(e.target.value.replace(/\D/g,'').slice(0,8))} placeholder="****" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="submit" className="w-full py-3 rounded-lg bg-[var(--primary-color)] text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            disabled={loading}>
            {loading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
            Crear cuenta
          </button>
        </form>
        <div className="mt-4 text-center text-xs text-[var(--text-secondary-color)]">
          ¿Ya tienes cuenta? <button className="underline hover:opacity-90" onClick={()=>navigate('/login')}>Ingresar</button>
        </div>
      </div>
    </div>
  );
}
