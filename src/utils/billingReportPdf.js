import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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

function formatPercent(value) {
    const n = toNumber(value);
    return `${n.toFixed(2)}%`;
}

function formatMoneyOrDash(value, { showZero = false } = {}) {
    const n = toNumber(value);
    if (!showZero && Math.abs(n) < 0.5) return '—';
    return formatCLP(Math.round(n));
}

function buildReportRows(rawRows) {
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

function sanitizeFilenamePart(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function buildProgressRows(rows, valueGetter, formatter, options = {}) {
    const {
        positiveColor = '#34d399',
        negativeColor = '#fb7185',
        barBgPositive = 'rgba(16, 185, 129, 0.2)',
        barBgNegative = 'rgba(244, 63, 94, 0.2)',
        maxScale,
    } = options;

    const values = rows.map((row) => toNumber(valueGetter(row)));
    const maxAbs = maxScale || Math.max(1, ...values.map((v) => Math.abs(v)));

    return rows.map((row) => {
        const value = toNumber(valueGetter(row));
        const width = value === 0 ? 0 : Math.max(2, Math.round((Math.abs(value) / maxAbs) * 100));
        const positive = value >= 0;
        const barColor = positive ? positiveColor : negativeColor;
        const barBg = positive ? barBgPositive : barBgNegative;
        return `
            <div class="progress-item">
              <div class="progress-meta">
                <span>${escapeHtml(row.posName)}</span>
                <span>${escapeHtml(formatter(value))}</span>
              </div>
              <div class="progress-bg" style="background:${barBg}">
                <div class="progress-fill" style="width:${width}%;background:${barColor}"></div>
              </div>
            </div>
        `;
    }).join('');
}

function buildTemplate({ title, subtitle, rows, summary, logoUrl }) {
    const avgMarginPct = summary.ventas > 0 ? (summary.utilidadBruta / summary.ventas) * 100 : 0;

    const topUtilRows = [...rows].sort((a, b) => b.utilidadNeta - a.utilidadNeta);
    const salesRows = [...rows].sort((a, b) => b.venta - a.venta);
    const salesMax = Math.max(1, ...salesRows.map((r) => r.venta));

    const tableRows = rows.map((row) => {
        const utilidadClass = row.utilidad >= 0 ? 'text-positive' : 'text-negative';
        const netaClass = row.utilidadNeta >= 0 ? 'text-positive' : 'text-negative';
        return `
            <tr>
              <td>${escapeHtml(row.posName)}</td>
              <td class="num">${formatMoneyOrDash(row.venta)}</td>
              <td class="num">${formatMoneyOrDash(row.margen)}</td>
              <td class="num">${row.venta > 0 ? formatPercent(row.margenPct) : '—'}</td>
              <td class="num">${formatMoneyOrDash(row.gastos)}</td>
              <td class="num ${utilidadClass}">${formatMoneyOrDash(row.utilidad, { showZero: true })}</td>
              <td class="num">${formatMoneyOrDash(row.comision)}</td>
              <td class="num ${netaClass}">${formatMoneyOrDash(row.utilidadNeta, { showZero: true })}</td>
            </tr>
        `;
    }).join('');

    const topUtilMarkup = buildProgressRows(
        topUtilRows,
        (row) => row.utilidadNeta,
        (value) => formatMoneyOrDash(value, { showZero: true }),
    );

    const salesMarkup = buildProgressRows(
        salesRows,
        (row) => summary.ventas > 0 ? (row.venta / summary.ventas) * 100 : 0,
        (value) => `${value.toFixed(0)}%`,
        {
            positiveColor: '#67e8f9',
            negativeColor: '#67e8f9',
            barBgPositive: 'rgba(34, 211, 238, 0.2)',
            barBgNegative: 'rgba(34, 211, 238, 0.2)',
            maxScale: Math.max(1, ...salesRows.map((r) => (r.venta / salesMax) * 100)),
        },
    );

    return `
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Space Grotesk", "Inter", system-ui, -apple-system, sans-serif;
        color: #e2e8f0;
        background: radial-gradient(circle at 20% 0%, #0f172a 0%, #020617 55%, #020617 100%);
      }
      .page {
        width: 1120px;
        margin: 0 auto;
        padding: 28px;
        background: radial-gradient(circle at 20% 0%, #0f172a 0%, #020617 55%, #020617 100%);
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
        margin-bottom: 18px;
      }
      .header-left { display: flex; flex-direction: column; gap: 8px; }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo-wrap {
        width: 48px; height: 48px; border-radius: 12px;
        background: rgba(255,255,255,0.1);
        padding: 8px;
        display: flex; align-items: center; justify-content: center;
      }
      .logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
      .eyebrow { font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: #94a3b8; margin: 0; }
      h1 { margin: 0; font-size: 34px; line-height: 1.1; color: #fff; font-weight: 700; }
      .subtitle { margin: 0; font-size: 13px; color: #94a3b8; }
      .legend { display: flex; gap: 8px; font-size: 11px; font-weight: 600; color: #cbd5e1; flex-wrap: wrap; }
      .legend span { border-radius: 999px; padding: 5px 10px; }
      .legend .ok { background: rgba(16, 185, 129, .12); color: #bbf7d0; }
      .legend .bad { background: rgba(244, 63, 94, .12); color: #fecdd3; }
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
      .kpi {
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.05);
        border-radius: 12px;
        padding: 10px 12px;
      }
      .kpi .label {
        margin: 0; font-size: 11px; letter-spacing: .06em;
        text-transform: uppercase; color: #94a3b8;
      }
      .kpi .value { margin: 5px 0 0; font-size: 28px; line-height: 1; font-weight: 700; color: #fff; }
      .kpi .value.ok { color: #a7f3d0; }
      .table-wrap {
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,0.05);
        border-radius: 16px;
        overflow: hidden;
        margin-bottom: 16px;
      }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      thead th {
        background: rgba(30, 41, 59, 0.7);
        color: #cbd5e1;
        text-transform: uppercase;
        letter-spacing: .04em;
        font-size: 10px;
      }
      th, td {
        border: 1px solid rgba(255,255,255,.08);
        padding: 8px 10px;
      }
      tbody tr:nth-child(even) { background: rgba(255,255,255,.04); }
      td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .text-positive { color: #86efac; }
      .text-negative { color: #fda4af; }
      tfoot td {
        background: rgba(255,255,255,0.1);
        font-weight: 700;
      }
      .analytics {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .card {
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.05);
        border-radius: 16px;
        padding: 12px;
      }
      .card-title {
        display: flex; align-items: center; gap: 8px;
        color: #94a3b8; text-transform: uppercase;
        letter-spacing: .18em; font-size: 10px; margin-bottom: 10px;
      }
      .dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
      .dot.ok { background: #34d399; }
      .dot.sales { background: #67e8f9; }
      .progress-item + .progress-item { margin-top: 7px; }
      .progress-meta {
        display: flex; justify-content: space-between; font-size: 11px;
        color: #d1d5db; margin-bottom: 3px;
      }
      .progress-bg { height: 8px; border-radius: 999px; overflow: hidden; }
      .progress-fill { height: 8px; border-radius: 999px; }
    </style>
    <main class="page">
      <header class="header">
        <div class="header-left">
          <div class="brand">
            <div class="logo-wrap">
              <img src="${escapeHtml(logoUrl)}" alt="RickyRich" />
            </div>
            <div>
              <p class="eyebrow">Reporte ejecutivo</p>
              <h1>${escapeHtml(title)}</h1>
            </div>
          </div>
          <p class="subtitle">${escapeHtml(subtitle)}</p>
        </div>
        <div class="legend">
          <span class="ok">● Utilidad positiva</span>
          <span class="bad">● Utilidad negativa</span>
        </div>
      </header>

      <section class="kpis">
        <article class="kpi">
          <p class="label">Ventas totales</p>
          <p class="value">${formatMoneyOrDash(summary.ventas, { showZero: true })}</p>
        </article>
        <article class="kpi">
          <p class="label">Utilidad bruta</p>
          <p class="value">${formatMoneyOrDash(summary.utilidadBruta, { showZero: true })}</p>
        </article>
        <article class="kpi">
          <p class="label">Margen promedio</p>
          <p class="value ok">${formatPercent(avgMarginPct)}</p>
        </article>
        <article class="kpi">
          <p class="label">Utilidad neta</p>
          <p class="value ${summary.utilidadNeta >= 0 ? 'ok' : ''}">${formatMoneyOrDash(summary.utilidadNeta, { showZero: true })}</p>
        </article>
      </section>

      <section class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Punto de venta</th>
              <th class="num">Ventas totales</th>
              <th class="num">Utilidad bruta</th>
              <th class="num">Margen</th>
              <th class="num">Gastos</th>
              <th class="num">Utilidad</th>
              <th class="num">Comisión</th>
              <th class="num">Utilidad neta</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="num">${formatMoneyOrDash(summary.ventas, { showZero: true })}</td>
              <td class="num">${formatMoneyOrDash(summary.utilidadBruta, { showZero: true })}</td>
              <td class="num">${formatPercent(avgMarginPct)}</td>
              <td class="num">${formatMoneyOrDash(summary.gastos, { showZero: true })}</td>
              <td class="num ${summary.utilidad >= 0 ? 'text-positive' : 'text-negative'}">${formatMoneyOrDash(summary.utilidad, { showZero: true })}</td>
              <td class="num">${formatMoneyOrDash(summary.comision, { showZero: true })}</td>
              <td class="num ${summary.utilidadNeta >= 0 ? 'text-positive' : 'text-negative'}">${formatMoneyOrDash(summary.utilidadNeta, { showZero: true })}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section class="analytics">
        <article class="card">
          <div class="card-title"><span class="dot ok"></span><span>Top utilidad neta (COP)</span></div>
          ${topUtilMarkup}
        </article>
        <article class="card">
          <div class="card-title"><span class="dot sales"></span><span>Participación en ventas</span></div>
          ${salesMarkup}
        </article>
      </section>
    </main>
    `;
}

function waitForImages(container) {
    const images = Array.from(container.querySelectorAll('img'));
    if (images.length === 0) return Promise.resolve();
    return Promise.all(images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    })).then(() => undefined);
}

export async function exportBillingReportPDF({
    year,
    monthName,
    rows: inputRows,
    title,
    subtitle,
}) {
    const rows = buildReportRows(inputRows);
    if (rows.length === 0) {
        throw new Error('No hay datos para exportar');
    }

    const monthLabel = monthName || '';
    const reportTitle = title || `Informes ${monthLabel} ${year}`;
    const reportSubtitle = subtitle || 'Resultados consolidados por punto de venta · Valores en pesos colombianos (COP)';
    const summary = buildSummary(rows);

    const host = typeof window !== 'undefined' ? window.location.origin : '';
    const logoUrl = `${host}/atm.png`;

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-99999px';
    container.style.top = '0';
    container.style.width = '1120px';
    container.style.zIndex = '-1';
    container.innerHTML = buildTemplate({
        title: reportTitle,
        subtitle: reportSubtitle,
        rows,
        summary,
        logoUrl,
    });

    document.body.appendChild(container);

    try {
        await waitForImages(container);

        if (typeof window !== 'undefined' && html2canvas && !window.html2canvas) {
            window.html2canvas = html2canvas;
        }

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'a4',
            compress: true,
        });

        await new Promise((resolve, reject) => {
            doc.html(container, {
                x: 20,
                y: 20,
                width: 555,
                windowWidth: 1120,
                autoPaging: 'text',
                html2canvas: {
                    scale: 0.48,
                    useCORS: true,
                    backgroundColor: '#020617',
                },
                callback: (pdf) => {
                    try {
                        const safeMonth = sanitizeFilenamePart(monthLabel) || 'Mes';
                        const safeYear = sanitizeFilenamePart(year);
                        pdf.save(`Informe_${safeMonth}_${safeYear}.pdf`);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                },
            });
        });
    } finally {
        container.remove();
    }
}
