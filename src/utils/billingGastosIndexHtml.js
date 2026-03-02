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

function formatMoney(value) {
    return formatCLP(Math.round(toNumber(value)));
}

function normalizeFixedCostsByPos(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;

    Object.entries(raw).forEach(([pos, list]) => {
        const rows = Array.isArray(list) ? list : [];
        out[pos] = rows.map((fc) => ({
            id: fc?.id ?? fc?.ID,
            name: fc?.name || fc?.Name || 'Gasto fijo',
            amount: toNumber(fc?.amount ?? fc?.Amount),
            active: fc?.active !== false,
        }));
    });
    return out;
}

function normalizeCommonGastosByPos(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;

    Object.entries(raw).forEach(([pos, list]) => {
        const rows = Array.isArray(list) ? list : [];
        out[pos] = rows.map((g) => ({
            id: g?.id ?? g?.ID,
            motivo: g?.motivo || g?.Motivo || 'Gasto común',
            monto: toNumber(g?.monto ?? g?.Monto),
        }));
    });
    return out;
}

function normalizeNominaByPos(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;

    Object.entries(raw).forEach(([pos, value]) => {
        const employeesRaw = Array.isArray(value?.employees) ? value.employees : [];
        out[pos] = {
            total: toNumber(value?.total),
            employees: employeesRaw.map((emp) => ({
                user_id: emp?.user_id,
                name: emp?.name || 'Empleado',
                total_paid: toNumber(emp?.total_paid),
                count: Number(emp?.count) || 0,
            })),
        };
    });
    return out;
}

function normalizeRows(rawRows) {
    return (Array.isArray(rawRows) ? rawRows : []).map((row) => {
        const posName = row?.posName || row?.pos_name || 'Sin nombre';
        const servicios = toNumber(row?.servicios);
        const arriendo = toNumber(row?.arriendo);
        const fixedFromRow = servicios + arriendo;
        const gastosComunes = toNumber(row?.gastosComunes ?? row?.gastos_comunes);
        const nomina = toNumber(row?.nomina ?? row?.nomina_auto);
        const gastosTotal = toNumber(row?.gastosTot ?? row?.gastos_tot ?? row?.gastos ?? (fixedFromRow + gastosComunes + nomina));

        return {
            posName,
            servicios,
            arriendo,
            fixedFromRow,
            gastosComunes,
            nomina,
            gastosTotal,
        };
    });
}

function buildSummary(rows) {
    return rows.reduce((acc, row) => {
        acc.total += row.gastosTotal;
        acc.fijos += row.fixedFromRow;
        acc.comunes += row.gastosComunes;
        acc.nomina += row.nomina;
        return acc;
    }, {
        total: 0,
        fijos: 0,
        comunes: 0,
        nomina: 0,
    });
}

function buildHtml({
    year,
    monthName,
    rows,
    fixedCostsByPos,
    commonGastosByPos,
    nominaByPos,
}) {
    const summary = buildSummary(rows);
    const title = `Gastos ${monthName} ${year}`;
    const host = typeof window !== 'undefined' ? window.location.origin : '';
    const logoSrc = `${host}/atm.png`;

    const tableBody = rows.map((row) => {
        const fixedList = fixedCostsByPos[row.posName] || [];
        const fixedActiveTotal = fixedList.filter((fc) => fc.active).reduce((sum, fc) => sum + fc.amount, 0);
        const commonList = commonGastosByPos[row.posName] || [];
        const nominaEntry = nominaByPos[row.posName] || { employees: [] };

        return `
          <tr class="odd:bg-white/0 even:bg-white/5/40 hover:bg-white/10 transition-colors">
            <td class="border border-white/5 px-4 py-3">${escapeHtml(row.posName)}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoney(row.fixedFromRow)}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoney(row.servicios)}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoney(row.arriendo)}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoney(row.gastosComunes)}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoney(row.nomina)}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums text-cyan-200">${formatMoney(row.gastosTotal)}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${fixedList.length}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${commonList.length}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${nominaEntry.employees?.length || 0}</td>
            <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoney(fixedActiveTotal)}</td>
          </tr>
        `;
    }).join('');

    const detailsByPos = rows.map((row) => {
        const fixedList = fixedCostsByPos[row.posName] || [];
        const commonList = commonGastosByPos[row.posName] || [];
        const nominaEntry = nominaByPos[row.posName] || { employees: [], total: row.nomina };

        const fixedMarkup = fixedList.length
            ? fixedList.map((fc) => `
                <div class="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${fc.active ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-700/60 text-slate-300'}">${fc.active ? 'Activo' : 'Inactivo'}</span>
                    <span class="text-sm">${escapeHtml(fc.name)}</span>
                  </div>
                  <span class="font-mono text-sm">${formatMoney(fc.amount)}</span>
                </div>
            `).join('')
            : `<div class="text-xs text-slate-400 italic py-3">Sin configuración de gastos fijos.</div>`;

        const commonMarkup = commonList.length
            ? commonList.map((g) => `
                <div class="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span class="text-sm">${escapeHtml(g.motivo)}</span>
                  <span class="font-mono text-sm">${formatMoney(g.monto)}</span>
                </div>
            `).join('')
            : `<div class="text-xs text-slate-400 italic py-3">Sin gastos comunes registrados para este mes.</div>`;

        const nominaMarkup = nominaEntry.employees?.length
            ? nominaEntry.employees.map((emp) => `
                <div class="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div>
                    <div class="text-sm">${escapeHtml(emp.name)}</div>
                    <div class="text-[11px] text-slate-400">${emp.count === 1 ? '1 quincena' : `${emp.count} quincenas`}</div>
                  </div>
                  <span class="font-mono text-sm">${formatMoney(emp.total_paid)}</span>
                </div>
            `).join('')
            : `<div class="text-xs text-slate-400 italic py-3">Sin nómina asignada a este local.</div>`;

        return `
          <section class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/25 backdrop-blur space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-white">${escapeHtml(row.posName)}</h3>
              <span class="text-sm font-mono text-cyan-200">Total gastos: ${formatMoney(row.gastosTotal)}</span>
            </div>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div class="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                <div class="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">Gastos fijos usados</div>
                <div class="text-[11px] text-slate-400 mb-2">Servicios + Arriendo usados en el informe: <strong class="text-slate-200">${formatMoney(row.fixedFromRow)}</strong></div>
                <div class="space-y-0">${fixedMarkup}</div>
              </div>
              <div class="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                <div class="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">Gastos comunes usados</div>
                <div class="text-[11px] text-slate-400 mb-2">Total del mes: <strong class="text-slate-200">${formatMoney(row.gastosComunes)}</strong></div>
                <div class="space-y-0">${commonMarkup}</div>
              </div>
              <div class="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                <div class="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">Nómina usada</div>
                <div class="text-[11px] text-slate-400 mb-2">Total asignado: <strong class="text-slate-200">${formatMoney(nominaEntry.total || row.nomina)}</strong></div>
                <div class="space-y-0">${nominaMarkup}</div>
              </div>
            </div>
          </section>
        `;
    }).join('');

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
        <p class="text-sm text-slate-400">Desglose de gastos por punto de venta usados en el informe mensual.</p>
      </div>
      <div class="flex flex-wrap gap-2 text-xs font-medium">
        <span class="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-cyan-200">● Total gastos</span>
        <span class="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200">● Nómina</span>
        <span class="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-amber-200">● Gastos comunes</span>
      </div>
    </header>

    <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-black/20">
        <p class="text-xs uppercase tracking-wide text-slate-400">Gastos totales</p>
        <p class="text-2xl font-semibold text-cyan-200">${formatMoney(summary.total)}</p>
      </div>
      <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-black/20">
        <p class="text-xs uppercase tracking-wide text-slate-400">Gastos fijos usados</p>
        <p class="text-2xl font-semibold text-white">${formatMoney(summary.fijos)}</p>
      </div>
      <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-black/20">
        <p class="text-xs uppercase tracking-wide text-slate-400">Gastos comunes</p>
        <p class="text-2xl font-semibold text-amber-200">${formatMoney(summary.comunes)}</p>
      </div>
      <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg shadow-black/20">
        <p class="text-xs uppercase tracking-wide text-slate-400">Nómina</p>
        <p class="text-2xl font-semibold text-emerald-200">${formatMoney(summary.nomina)}</p>
      </div>
    </section>

    <div class="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl shadow-black/25 backdrop-blur">
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm text-slate-100">
          <thead class="bg-slate-800/70 text-xs uppercase tracking-wide text-slate-200">
            <tr>
              <th class="border border-white/5 px-4 py-3 text-left">Punto de venta</th>
              <th class="border border-white/5 px-4 py-3 text-right">Fijos usados</th>
              <th class="border border-white/5 px-4 py-3 text-right">Servicios</th>
              <th class="border border-white/5 px-4 py-3 text-right">Arriendo</th>
              <th class="border border-white/5 px-4 py-3 text-right">Comunes</th>
              <th class="border border-white/5 px-4 py-3 text-right">Nómina</th>
              <th class="border border-white/5 px-4 py-3 text-right">Total gastos</th>
              <th class="border border-white/5 px-4 py-3 text-right"># Fijos</th>
              <th class="border border-white/5 px-4 py-3 text-right"># Comunes</th>
              <th class="border border-white/5 px-4 py-3 text-right"># Empleados</th>
              <th class="border border-white/5 px-4 py-3 text-right">Fijos actuales</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            ${tableBody}
          </tbody>
          <tfoot class="bg-white/10 text-slate-50">
            <tr class="font-semibold">
              <td class="border border-white/5 px-4 py-3">Total</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoney(summary.fijos)}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">—</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">—</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoney(summary.comunes)}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">${formatMoney(summary.nomina)}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums text-cyan-200">${formatMoney(summary.total)}</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">—</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">—</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">—</td>
              <td class="border border-white/5 px-4 py-3 text-right tabular-nums">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <section class="space-y-4">
      ${detailsByPos}
    </section>
  </main>
</body>
</html>`;
}

export function openBillingGastosIndex({
    year,
    monthName,
    rows,
    fixedCostsByPos,
    commonGastosByPos,
    nominaByPos,
}) {
    const normalizedRows = normalizeRows(rows);
    if (!normalizedRows.length) {
        throw new Error('No hay datos de gastos para visualizar');
    }

    const html = buildHtml({
        year,
        monthName,
        rows: normalizedRows,
        fixedCostsByPos: normalizeFixedCostsByPos(fixedCostsByPos),
        commonGastosByPos: normalizeCommonGastosByPos(commonGastosByPos),
        nominaByPos: normalizeNominaByPos(nominaByPos),
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

