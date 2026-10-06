export const DASHBOARD_LOCALE_NAMES = [
  'Visto',
  'Lo Nuestro',
  'San Jose',
  'Madrugon GS',
  'Madrugon Medellin',
  'Gran San',
  'Bodega Online',
  'Bodega Quilla',
  'San Fason',
  'Colombia',
];

function normalizeLocaleName(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

export function dashboardLocaleIndex(name) {
  const safeName = normalizeLocaleName(name);
  return DASHBOARD_LOCALE_NAMES.findIndex((allowedName) => {
    const safeAllowedName = normalizeLocaleName(allowedName);
    return safeName === safeAllowedName
      || safeName.startsWith(`${safeAllowedName} `)
      || safeName.startsWith(`${safeAllowedName}(`);
  });
}

export function isDashboardLocale(name) {
  return dashboardLocaleIndex(name) !== -1;
}

export function sortDashboardLocaleEntries([nameA], [nameB]) {
  const indexA = dashboardLocaleIndex(nameA);
  const indexB = dashboardLocaleIndex(nameB);
  if (indexA !== indexB) return indexA - indexB;
  return String(nameA || '').localeCompare(String(nameB || ''), 'es', { sensitivity: 'base' });
}

export function sortDashboardLocalesByLabel(a, b) {
  return sortDashboardLocaleEntries([a?.label], [b?.label]);
}
