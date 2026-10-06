import {
  DASHBOARD_LOCALE_NAMES,
  isDashboardLocale,
  sortDashboardLocaleEntries,
} from './dashboardLocales';

test('uses the current dashboard point-of-sale names', () => {
  expect(DASHBOARD_LOCALE_NAMES).toEqual([
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
  ]);
});

test('accepts current Odoo variants and rejects retired dashboard names', () => {
  expect(isDashboardLocale('San José')).toBe(true);
  expect(isDashboardLocale('Madrugon GS (Caja 2)')).toBe(true);
  expect(isDashboardLocale('Bodega Online Principal')).toBe(true);
  expect(isDashboardLocale('Colombia')).toBe(true);
  expect(isDashboardLocale('Titanium')).toBe(false);
  expect(isDashboardLocale('Premium')).toBe(false);
  expect(isDashboardLocale('Platinum')).toBe(false);
  expect(isDashboardLocale('Medellin')).toBe(false);
});

test('keeps locales in the configured business order', () => {
  const entries = [
    ['San Fason', {}],
    ['Visto', {}],
    ['Gran San', {}],
  ];
  expect(entries.sort(sortDashboardLocaleEntries).map(([name]) => name)).toEqual([
    'Visto',
    'Gran San',
    'San Fason',
  ]);
});
