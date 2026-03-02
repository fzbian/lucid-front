export const VIEW_CATALOG = [
  {
    id: 'dashboard',
    label: 'Inicio (Dashboard)',
    shortLabel: 'Inicio',
    description: 'Pantalla principal del sistema',
    icon: 'home',
    path: '/dashboard',
    group: 'Operacion principal',
    section: 'main',
  },
  {
    id: 'movements',
    label: 'Movimientos',
    shortLabel: 'Movimientos',
    description: 'Historial de ingresos y egresos',
    icon: 'receipt_long',
    path: '/movements',
    group: 'Operacion principal',
    section: 'main',
  },
  {
    id: 'new',
    label: 'Nuevo movimiento',
    shortLabel: 'Nuevo movimiento',
    description: 'Crear ingresos o egresos manuales',
    icon: 'add_notes',
    path: '/new',
    group: 'Operacion principal',
    section: 'action',
  },
  {
    id: 'gastos',
    label: 'Gastos',
    shortLabel: 'Gastos',
    description: 'Gestion de gastos operativos',
    icon: 'receipt',
    path: '/gastos',
    group: 'Operacion principal',
    section: 'main',
  },
  {
    id: 'pedidos',
    label: 'Pedidos',
    shortLabel: 'Pedidos',
    description: 'Control de pedidos y operaciones relacionadas',
    icon: 'shopping_cart',
    path: '/pedidos',
    group: 'Operacion principal',
    section: 'main',
  },
  {
    id: 'wallet',
    label: 'Cartera',
    shortLabel: 'Cartera',
    description: 'Gestion de cartera de clientes y facturas',
    icon: 'account_balance_wallet',
    path: '/wallet',
    group: 'Operacion principal',
    section: 'main',
  },
  {
    id: 'payroll',
    label: 'Nomina',
    shortLabel: 'Nomina',
    description: 'Modulo de nomina y pagos',
    icon: 'payments',
    path: '/payroll',
    group: 'Operacion principal',
    section: 'main',
  },
  {
    id: 'reports',
    label: 'Reportes',
    shortLabel: 'Reportes',
    description: 'Indicadores y reportes financieros',
    icon: 'bar_chart',
    path: '/reports',
    group: 'Operacion principal',
    section: 'main',
  },
  {
    id: 'billing',
    label: 'Facturacion',
    shortLabel: 'Facturacion',
    description: 'Facturacion mensual, generacion y reporte',
    icon: 'request_quote',
    path: '/billing',
    group: 'Facturacion',
    section: 'main',
  },
  {
    id: 'cashout',
    label: 'Retirar efectivo (Caja)',
    shortLabel: 'Retirar efectivo',
    description: 'Retiros de efectivo por punto de venta',
    icon: 'point_of_sale',
    path: '/cashout',
    group: 'Caja y retiros',
    section: 'secondary',
  },
  {
    id: 'cashout-bank',
    label: 'Retirar banco',
    shortLabel: 'Retirar banco',
    description: 'Retiros de dinero desde banco',
    icon: 'account_balance',
    path: '/cashout-bank',
    group: 'Caja y retiros',
    section: 'secondary',
  },
  {
    id: 'admin/users',
    label: 'Admin usuarios',
    shortLabel: 'Usuarios',
    description: 'Gestion de usuarios del sistema',
    icon: 'group',
    path: '/admin/users',
    group: 'Administracion',
    section: 'admin',
  },
  {
    id: 'admin/categories',
    label: 'Admin categorias',
    shortLabel: 'Categorias',
    description: 'Gestion de categorias del sistema',
    icon: 'category',
    path: '/admin/categories',
    group: 'Administracion',
    section: 'admin',
  },
];

export const VIEW_IDS = VIEW_CATALOG.map((view) => view.id);
export const VIEW_ID_SET = new Set(VIEW_IDS);

export const VIEW_BY_ID = VIEW_CATALOG.reduce((acc, view) => {
  acc[view.id] = view;
  return acc;
}, {});

export const ROLE_VIEW_GROUPS = [
  {
    id: 'operacion',
    label: 'Operacion principal',
    description: 'Vistas base para la operacion diaria.',
    viewIds: ['dashboard', 'movements', 'new', 'gastos', 'pedidos', 'wallet', 'payroll', 'reports'],
  },
  {
    id: 'facturacion',
    label: 'Facturacion',
    description: 'Incluye modulo principal, generacion y reporte.',
    viewIds: ['billing'],
  },
  {
    id: 'caja',
    label: 'Caja y retiros',
    description: 'Acciones de retiro en caja o banco.',
    viewIds: ['cashout', 'cashout-bank'],
  },
  {
    id: 'admin',
    label: 'Administracion',
    description: 'Configuraciones y mantenimiento del sistema.',
    viewIds: ['admin/users', 'admin/categories'],
  },
];

export const DEFAULT_ROLE_LABELS = {
  admin: 'Administrador',
  user: 'Usuario',
  finance: 'Finanzas',
};

export function getRoleLabel(role) {
  const normalized = String(role || '').trim();
  if (!normalized) return 'Rol';
  if (DEFAULT_ROLE_LABELS[normalized]) {
    return `${DEFAULT_ROLE_LABELS[normalized]} (${normalized})`;
  }
  return normalized;
}

export function normalizeViewIds(input) {
  if (!Array.isArray(input)) return [];

  const selected = new Set(
    input
      .filter((viewId) => typeof viewId === 'string')
      .map((viewId) => viewId.trim())
      .filter((viewId) => viewId && VIEW_ID_SET.has(viewId))
  );

  return VIEW_IDS.filter((id) => selected.has(id));
}

export function parseViewsPayload(rawViews) {
  if (Array.isArray(rawViews)) {
    return normalizeViewIds(rawViews);
  }

  if (typeof rawViews !== 'string') {
    return [];
  }

  const payload = rawViews.trim();
  if (!payload) {
    return [];
  }

  try {
    const parsed = JSON.parse(payload);

    if (Array.isArray(parsed)) {
      return normalizeViewIds(parsed);
    }

    if (typeof parsed === 'string') {
      const nested = JSON.parse(parsed);
      return normalizeViewIds(Array.isArray(nested) ? nested : []);
    }

    return [];
  } catch {
    return [];
  }
}

export function buildRoleConfigMap(configs) {
  if (!Array.isArray(configs)) return {};

  return configs.reduce((acc, item) => {
    const role = String(item?.role || '').trim().toLowerCase();
    if (!role) return acc;
    acc[role] = parseViewsPayload(item?.views);
    return acc;
  }, {});
}

export function getDefaultPathForViews(allowedViews) {
  const normalized = normalizeViewIds(allowedViews);
  if (normalized.includes('dashboard')) return '/dashboard';
  const first = normalized.find((viewId) => !!VIEW_BY_ID[viewId]?.path);
  return first ? VIEW_BY_ID[first].path : '/dashboard';
}

export const SIDEBAR_MAIN_IDS = VIEW_CATALOG.filter((item) => item.section === 'main').map((item) => item.id);
export const SIDEBAR_SECONDARY_IDS = VIEW_CATALOG.filter((item) => item.section === 'secondary').map((item) => item.id);
export const SIDEBAR_ADMIN_IDS = VIEW_CATALOG.filter((item) => item.section === 'admin').map((item) => item.id);
