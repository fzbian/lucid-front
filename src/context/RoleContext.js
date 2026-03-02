import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { refreshSessionFromServer } from '../auth';
import {
  VIEW_ID_SET,
  VIEW_IDS,
} from '../roleViews';

const RoleContext = createContext();
const SESSION_KEY = 'auth_session_v1';

function getSessionRole() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return 'user';
    const parsed = JSON.parse(raw);
    const role = String(parsed?.role || 'user').trim().toLowerCase();
    return role || 'user';
  } catch {
    return 'user';
  }
}

export function RoleProvider({ children }) {
  const [allowedViews, setAllowedViews] = useState([...VIEW_IDS]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('user');

  const loadConfig = useCallback(async () => {
    await refreshSessionFromServer();
    const currentRole = getSessionRole();

    setLoading(true);
    setRole(currentRole);
    // RBAC temporalmente deshabilitado: todas las vistas disponibles para cualquier sesión autenticada.
    setAllowedViews([...VIEW_IDS]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const hasAccess = useCallback(
    (viewId) => {
      const safeViewId = String(viewId || '').trim();
      if (!safeViewId) return false;
      return VIEW_ID_SET.has(safeViewId);
    },
    []
  );

  return (
    <RoleContext.Provider value={{ allowedViews, hasAccess, loading, role, reloadConfig: loadConfig }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
