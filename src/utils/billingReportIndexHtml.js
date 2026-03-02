import { formatCLP } from '../formatMoney';

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPercent(value, digits = 2) {
    const n = toNumber(value);
    return `${n.toFixed(digits)}%`;
}

function formatMoneyOrDash(value, { showZero = false } = {}) {
    const n = toNumber(value);
    if (!showZero && Math.abs(n) < 0.5) return '—';
    return formatCLP(Math.round(n));
}

function normalizeRows(rawRows) {
    return (Array.isArray(rawRows) ? rawRows : []).map((row) => {
        const posName = row?.posName || row?.pos_name || 'Sin nombre';
        const venta = toNumber(row?.venta);
        const margen = toNumber(row?.margen);
        const gastos = toNumber(row?.gastosTot ?? row?.gastos_tot ?? row?.gastos);
        const utilidad = toNumber(row?.utilBruta ?? row?.utilidad ?? (margen - gastos));
        const comision = toNumber(row?.comision);
        const utilidadNeta = toNumber(row?.utilNeta ?? row?.utilidadNeta ?? (utilidad - comision));
        const margenPct = venta > 0 ? (margen / venta) * 100 : 0;

        return {
            posName,
            venta,
            margen,
            margenPct,
            gastos,
            utilidad,
            comision,
            utilidadNeta,
        };
    });
}

function buildSummary(rows) {
    return rows.reduce((acc, row) => {
        acc.ventas += row.venta;
        acc.utilidadBruta += row.margen;
        acc.gastos += row.gastos;
        acc.utilidad += row.utilidad;
        acc.comision += row.comision;
        acc.utilidadNeta += row.utilidadNeta;
        return acc;
    }, {
        ventas: 0,
        utilidadBruta: 0,
        gastos: 0,
        utilidad: 0,
        comision: 0,
        utilidadNeta: 0,
    });
}

function buildProgressList(rows, valueGetter, labelFormatter, options = {}) {
    const {
        positiveColor = 'bg-emerald-400',
        negativeColor = 'bg-rose-400',
        trackPositive = 'bg-emerald-500/20',
        trackNegative = 'bg-rose-500/20',
        minVisiblePct = 0,
    } = options;

    const values = rows.map((row) => toNumber(valueGetter(row)));
    const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));

    return rows.map((row) => {
        const value = toNumber(valueGetter(row));
        const absPct = (Math.abs(value) / maxAbs) * 100;
        const widthPct = value === 0 ? minVisiblePct : Math.max(minVisiblePct, absPct);
        const positive = value >= 0;

        return `
          <div>
            <div class="flex justify-between text-xs text-slate-300">
              <span>${escapeHtml(row.posName)}</span>
              <span>${escapeHtml(labelFormatter(value))}</span>
            </div>
            <div class="mt-1 h-2 rounded-full ${positive ? trackPositive : trackNegative}">
              <div class="h-2 rounded-full ${positive ? positiveColor : negativeColor}" style="width:${widthPct}%"></div>
            </div>
          </div>
        `;
    }).join('');
}

function buildHtml({ year, monthName, rows }) {
    const summary = buildSummary(rows);
    const marginPromedio = summary.ventas > 0 ? (summary.utilidadBruta / summary.ventas) * 100 : 0;

    const topUtilRows = [...rows].sort((a, b) => b.utilidadNeta - a.utilidadNeta);
    const salesRows = [...rows].sort((a, b) => b.venta - a.venta);

    const tableBody = rows.map((row) => `
      <tr class="odd:bg-white/0 even:bg-white/5/40 hover:bg-white/10 transition-colors">
        <td class="border border-white/5 px-4 py-3">${escapeHtml(row.posName)}</td>
        <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoneyOrDash(row.venta)}</td>
        <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoneyOrDash(row.margen)}</td>
        <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${row.venta > 0 ? formatPercent(row.margenPct) : '—'}</td>
        <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoneyOrDash(row.gastos)}</td>
        <td class="border border-white/5 px-4 py-3 text-right tabular-nums ${row.utilidad >= 0 ? 'text-emerald-300' : 'text-rose-300'}">${formatMoneyOrDash(row.utilidad, { showZero: true })}</td>
        <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoneyOrDash(row.comision)}</td>
        <td class="border border-white/5 px-4 py-3 text-right tabular-nums ${row.utilidadNeta >= 0 ? 'text-emerald-300' : 'text-rose-300'}">${formatMoneyOrDash(row.utilidadNeta, { showZero: true })}</td>
      </tr>
    `).join('');

    const salesParticipation = buildProgressList(
        salesRows,
        (row) => summary.ventas > 0 ? (row.venta / summary.ventas) * 100 : 0,
        (value) => `${toNumber(value).toFixed(0)}%`,
        {
            positiveColor: 'bg-cyan-300',
            negativeColor: 'bg-cyan-300',
            trackPositive: 'bg-cyan-500/20',
            trackNegative: 'bg-cyan-500/20',
            minVisiblePct: 0,
        },
    );

    const topUtilMarkup = buildProgressList(
        topUtilRows,
        (row) => row.utilidadNeta,
        (value) => formatMoneyOrDash(value, { showZero: true }),
        {
            positiveColor: 'bg-emerald-400',
            negativeColor: 'bg-rose-400',
            trackPositive: 'bg-emerald-500/20',
            trackNegative: 'bg-rose-500/20',
            minVisiblePct: 2,
        },
    );

    const host = typeof window !== 'undefined' ? window.location.origin : '';
    const logoSrc = `${host}/atm.png`;
    const title = `Informes ${monthName} ${year}`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body
  class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-6 md:px-6 md:py-10 text-slate-100 antialiased"
  style="font-family: 'Space Grotesk', 'Inter', system-ui, -apple-system, sans-serif;">
  <main class="mx-auto flex max-w-6xl flex-col gap-6">
    <header class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 p-2 shadow-lg shadow-black/30">
            <img src="${escapeHtml(logoSrc)}" alt="RickyRich" class="h-full w-full object-contain" />
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.25em] text-slate-400">Reporte ejecutivo</p>
            <h1 class="text-3xl font-semibold text-white">${escapeHtml(title)}</h1>
          </div>
        </div>
        <p class="text-sm text-slate-400">Resultados consolidados por punto de venta · Valores en pesos colombianos (COP)</p>
      </div>
      <div class="flex flex-wrap gap-2 text-xs font-medium">
        <span class="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200">● Utilidad positiva</span>
        <span class="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1 text-rose-200">● Utilidad negativa</span>
      </div>
    </header>

    <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-black/20">
        <p class="text-xs uppercase tracking-wide text-slate-400">Ventas totales</p>
        <p class="text-2xl font-semibold text-white">${formatMoneyOrDash(summary.ventas, { showZero: true })}</p>
      </div>
      <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-black/20">
        <p class="text-xs uppercase tracking-wide text-slate-400">Utilidad bruta</p>
        <p class="text-2xl font-semibold text-white">${formatMoneyOrDash(summary.utilidadBruta, { showZero: true })}</p>
      </div>
      <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-black/20">
        <p class="text-xs uppercase tracking-wide text-slate-400">Margen promedio</p>
        <p class="text-2xl font-semibold text-emerald-200">${formatPercent(marginPromedio, 0)}</p>
      </div>
      <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-black/20">
        <p class="text-xs uppercase tracking-wide text-slate-400">Utilidad neta</p>
        <p class="text-2xl font-semibold ${summary.utilidadNeta >= 0 ? 'text-emerald-200' : 'text-rose-300'}">${formatMoneyOrDash(summary.utilidadNeta, { showZero: true })}</p>
      </div>
    </section>

    <div class="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl shadow-black/25 backdrop-blur">
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm text-slate-100">
          <thead class="bg-slate-800/70 text-xs uppercase tracking-wide text-slate-200">
            <tr>
              <th class="border border-white/5 px-4 py-3 text-left">Punto de venta</th>
              <th class="border border-white/5 px-4 py-3 text-right">Ventas totales</th>
              <th class="border border-white/5 px-4 py-3 text-right">Utilidad bruta</th>
              <th class="border border-white/5 px-4 py-3 text-right">Margen</th>
              <th class="border border-white/5 px-4 py-3 text-right">Gastos</th>
              <th class="border border-white/5 px-4 py-3 text-right">Utilidad</th>
              <th class="border border-white/5 px-4 py-3 text-right">Comisión</th>
              <th class="border border-white/5 px-4 py-3 text-right">Utilidad neta</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            ${tableBody}
          </tbody>
          <tfoot class="bg-white/10 text-slate-50">
            <tr class="font-semibold">
              <td class="border border-white/5 px-4 py-3">Total</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoneyOrDash(summary.ventas, { showZero: true })}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoneyOrDash(summary.utilidadBruta, { showZero: true })}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatPercent(marginPromedio)}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoneyOrDash(summary.gastos, { showZero: true })}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums ${summary.utilidad >= 0 ? 'text-emerald-200' : 'text-rose-300'}">${formatMoneyOrDash(summary.utilidad, { showZero: true })}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoneyOrDash(summary.comision, { showZero: true })}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums ${summary.utilidadNeta >= 0 ? 'text-emerald-200' : 'text-rose-300'}">${formatMoneyOrDash(summary.utilidadNeta, { showZero: true })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <section class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/25 backdrop-blur">
        <div class="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
          <span class="inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
          <span>Top utilidad neta (COP)</span>
        </div>
        <div class="mt-3 space-y-2 text-sm text-slate-100">
          ${topUtilMarkup}
        </div>
      </div>
      <div class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/25 backdrop-blur">
        <div class="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
          <span class="inline-flex h-2 w-2 rounded-full bg-cyan-300"></span>
          <span>Participacion en ventas</span>
        </div>
        <div class="mt-3 space-y-2 text-sm text-slate-100">
          ${salesParticipation}
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export function openBillingReportIndex({ year, monthName, rows }) {
    const normalizedRows = normalizeRows(rows);
    if (!normalizedRows.length) {
        throw new Error('No hay datos para visualizar');
    }

    const html = buildHtml({
        year,
        monthName,
        rows: normalizedRows,
    });

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const newWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow) {
        URL.revokeObjectURL(blobUrl);
        throw new Error('El navegador bloqueó la ventana emergente');
    }

    setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
    }, 60_000);
}

