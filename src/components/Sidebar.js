import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSession, logout } from '../auth';
import { useRole } from '../context/RoleContext';
import {
    VIEW_BY_ID,
    SIDEBAR_MAIN_IDS,
    SIDEBAR_SECONDARY_IDS,
    SIDEBAR_ADMIN_IDS,
} from '../roleViews';

export default function Sidebar({ open, onClose }) {
    const navigate = useNavigate();
    const location = useLocation();
    const path = location.pathname;
    const { hasAccess, reloadConfig } = useRole();

    const handleNav = (to) => {
        navigate(to);
        if (window.innerWidth < 1024) {
            onClose();
        }
    };

    const isActive = (p) => {
        if (p === '/dashboard' && path === '/') return true;
        if (path === p) return true;
        return path.startsWith(p + '/');
    };

    const visibleMain = SIDEBAR_MAIN_IDS
        .map((id) => VIEW_BY_ID[id])
        .filter((item) => item && hasAccess(item.id));

    const visibleSecondary = SIDEBAR_SECONDARY_IDS
        .map((id) => VIEW_BY_ID[id])
        .filter((item) => item && hasAccess(item.id));

    const visibleAdmin = SIDEBAR_ADMIN_IDS
        .map((id) => VIEW_BY_ID[id])
        .filter((item) => item && hasAccess(item.id));

    const renderNav = (items) => (
        items.map((item) => (
            <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive(item.path)
                    ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] font-medium'
                    : 'text-[var(--text-secondary-color)] hover:bg-white/5 hover:text-[var(--text-color)]'
                    }`}
            >
                <span className={`material-symbols-outlined ${isActive(item.path) ? 'fill-current' : ''}`}>{item.icon}</span>
                <span>{item.shortLabel}</span>
            </button>
        ))
    );

    const session = getSession();
    const displayName = session?.displayName || session?.username || 'Usuario';

    return (
        <>
            <div
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 lg:hidden ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <aside
                className={`fixed inset-y-0 left-0 z-50 w-64 bg-[var(--card-color)] border-r border-[var(--border-color)] transform transition-transform duration-300 ease-out lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="flex flex-col h-full">
                    <div className="h-16 flex items-center px-6 border-b border-[var(--border-color)]">
                        <img
                            src="https://rrimg.chinatownlogistic.com/public/uploads/d55c740d031af3f7f42f7c87e6178df6.png"
                            alt="RickyRich ATM"
                            className="h-12 object-contain"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
                        {visibleMain.length > 0 && (
                            <nav className="space-y-1">
                                <p className="px-4 text-xs font-semibold text-[var(--text-secondary-color)] uppercase tracking-wider mb-2">Menu</p>
                                {renderNav(visibleMain)}
                            </nav>
                        )}

                        {visibleSecondary.length > 0 && (
                            <nav className="space-y-1">
                                <p className="px-4 text-xs font-semibold text-[var(--text-secondary-color)] uppercase tracking-wider mb-2">Caja</p>
                                {renderNav(visibleSecondary)}
                            </nav>
                        )}

                        {visibleAdmin.length > 0 && (
                            <nav className="space-y-1">
                                <p className="px-4 text-xs font-semibold text-[var(--text-secondary-color)] uppercase tracking-wider mb-2">Configuracion</p>
                                {renderNav(visibleAdmin)}
                            </nav>
                        )}
                    </div>

                    <div className="p-4 border-t border-[var(--border-color)] bg-[var(--background-color)]/50">
                        <div className="px-4 mb-2">
                            <p className="text-sm font-semibold text-[var(--text-color)] truncate">{displayName}</p>
                            <p className="text-xs text-[var(--text-secondary-color)] truncate">Acceso completo</p>
                        </div>
                        <button
                            onClick={async () => {
                                logout();
                                await reloadConfig();
                                navigate('/login');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-[var(--text-secondary-color)] hover:text-[var(--danger-color)] hover:bg-red-500/10 transition-colors"
                        >
                            <span className="material-symbols-outlined">logout</span>
                            <span className="text-sm font-medium">Cerrar Sesion</span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
