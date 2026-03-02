// Utilidad para formatear fecha y hora en español de Colombia sin segundos
// Uso: formatDateTimeCO(value) donde value es Date o string/number parseable por Date
export function formatDateTimeCO(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    // Fallback simple si el runtime no soporta opciones
    return d.toLocaleString("es-CO");
  }
}

// Variantes con mes abreviado y "del" para Movimientos
const TZ_CO = "America/Bogota";
const MONTHS_ABBR_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

function getMonthIndexInTZ(date) {
  try {
    const s = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, month: "numeric" }).format(date);
    const n = parseInt(s, 10);
    return isNaN(n) ? date.getMonth() : Math.max(0, Math.min(11, n - 1));
  } catch {
    return date.getMonth();
  }
}

export function formatDateTimeCOAbbr(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  try {
    const weekday = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, weekday: "long" }).format(d);
    const day = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, day: "numeric" }).format(d);
    const year = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, year: "numeric" }).format(d);
    const monthIndex = getMonthIndexInTZ(d);
    const monthAbbr = MONTHS_ABBR_ES[monthIndex] || "";
    const time = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, hour: "2-digit", minute: "2-digit" }).format(d);
    return `${weekday}, ${day} de ${monthAbbr} del ${year}, ${time}`;
  } catch {
    return formatDateTimeCO(d);
  }
}

export function formatDateCOAbbr(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  try {
    const weekday = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, weekday: "long" }).format(d);
    const day = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, day: "numeric" }).format(d);
    const year = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, year: "numeric" }).format(d);
    const monthIndex = getMonthIndexInTZ(d);
    const monthAbbr = MONTHS_ABBR_ES[monthIndex] || "";
    return `${weekday}, ${day} de ${monthAbbr} del ${year}`;
  } catch {
    return new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, dateStyle: "long" }).format(d);
  }
}

// Solo fecha: "9 de sept del 2025"
export function formatDateCOAbbrOnlyDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  try {
    const day = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, day: "numeric" }).format(d);
    const year = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, year: "numeric" }).format(d);
    const monthIndex = getMonthIndexInTZ(d);
    const monthAbbr = MONTHS_ABBR_ES[monthIndex] || "";
    return `${day} de ${monthAbbr} del ${year}`;
  } catch {
    return new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, dateStyle: "medium" }).format(d);
  }
}

function getYMDPartsCO(date) {
  const fmt = new Intl.DateTimeFormat("es-CO", { timeZone: TZ_CO, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  return { y, m, d };
}

export function getYMDKeyCO(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const { y, m, d: dd } = getYMDPartsCO(d);
  const mm = String(m).padStart(2, '0');
  const day = String(dd).padStart(2, '0');
  return `${y}-${mm}-${day}`;
}

export function isTodayCO(value) {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return getYMDKeyCO(d) === getYMDKeyCO(now);
}

export function isYesterdayCO(value) {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  // Restar 1 día en zona CO comparando claves YMD
  const { y, m, d: dd } = getYMDPartsCO(now);
  const current = new Date(Date.UTC(y, m - 1, dd));
  const yesterday = new Date(current.getTime() - 24 * 60 * 60 * 1000);
  return getYMDKeyCO(d) === getYMDKeyCO(yesterday);
}

// Helpers basados en claves YMD para evitar desfases por parsing UTC
export function formatDateFromYMDKeyCO(ymd) {
  if (typeof ymd !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return '';
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const abbr = MONTHS_ABBR_ES[Math.max(0, Math.min(11, mm - 1))] || '';
  return `${dd} de ${abbr} del ${y}`;
}

export function getTodayYMDKeyCO() {
  const { y, m, d } = getYMDPartsCO(new Date());
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function getYesterdayYMDKeyCO() {
  const now = new Date();
  const { y, m, d } = getYMDPartsCO(now);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
