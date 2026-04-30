import React from 'react';
import Layout from '../components/Layout';
import { getSessionUsername } from '../auth';
import { useRole } from '../context/RoleContext';
import { VIEW_BY_ID } from '../roleViews';

export default function HomeFallback({ deniedPath = '', deniedViewLabel = '' }) {
  const username = getSessionUsername();
  const { allowedViews } = useRole();

  const allowedLabels = (allowedViews || [])
    .map((viewId) => VIEW_BY_ID[viewId]?.shortLabel)
    .filter(Boolean)
    .slice(0, 6);

  return (
    <Layout title="Acceso limitado">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 view-enter view-enter-active">

        <div className="w-24 h-24 bg-[var(--card-color)] rounded-full flex items-center justify-center border border-[var(--border-color)] shadow-xl mb-4">
          <img
            src="https://rrimg.chinatownlogistic.com/public/uploads/d55c740d031af3f7f42f7c87e6178df6.png"
            alt="Logo"
            className="w-16 h-16 object-contain opacity-80"
          />
        </div>

        <h2 className="text-2xl font-bold text-[var(--text-color)]">
          Hola, {username}
        </h2>

        <p className="max-w-md text-[var(--text-secondary-color)]">
          No tienes permiso para acceder a esta vista.
          {deniedViewLabel ? ` (${deniedViewLabel})` : ''}
        </p>

        {deniedPath && (
          <div className="text-xs text-[var(--text-secondary-color)] bg-[var(--card-color)] border border-[var(--border-color)] rounded-lg px-3 py-2">
            Ruta solicitada: {deniedPath}
          </div>
        )}

        {allowedLabels.length > 0 ? (
          <div className="max-w-md p-4 rounded-lg bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/20 text-[var(--primary-color)] text-sm">
            <p className="mb-2">Vistas habilitadas para tu rol:</p>
            <p>{allowedLabels.join(' • ')}</p>
          </div>
        ) : (
          <div className="max-w-md p-4 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-200 text-sm">
            Este rol no tiene vistas habilitadas. Solicita a un administrador actualizar permisos en Roles.
          </div>
        )}

      </div>
    </Layout>
  );
}
