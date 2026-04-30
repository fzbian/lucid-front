import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function formatCurrency(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}

function sanitizeFileNamePart(value) {
  return String(value || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'cliente';
}

function formatQty(value) {
  const qty = Number(value || 0);
  return qty.toLocaleString('es-CO', {
    minimumFractionDigits: Number.isInteger(qty) ? 0 : 2,
    maximumFractionDigits: 3,
  });
}

function getInvoiceCode(invoice) {
  return invoice?.op || `#${invoice?.id || ''}`;
}

function buildInvoiceDetailRows(invoices) {
  return (Array.isArray(invoices) ? invoices : []).flatMap((invoice) => {
    const lineas = Array.isArray(invoice?.lineas) ? invoice.lineas.filter(Boolean) : [];
    const hasConcept = Boolean(String(invoice?.concepto || '').trim());
    const headerRow = [{
      content: `Factura ${getInvoiceCode(invoice)} · ${invoice?.estado || 'Sin estado'} · Total ${formatCurrency(invoice?.valor_total)}`,
      colSpan: 4,
      styles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
        overflow: 'linebreak',
      },
    }];

    if (!hasConcept && lineas.length === 0) {
      return [
        headerRow,
        [{
          content: 'Esta factura no tiene conceptos ni lineas registradas.',
          colSpan: 4,
          styles: {
            textColor: [100, 116, 139],
            fontStyle: 'italic',
            overflow: 'linebreak',
          },
        }],
      ];
    }

    const bodyRows = [];

    if (hasConcept) {
      bodyRows.push([
        'Concepto general',
        String(invoice.concepto).trim(),
        '1',
        formatCurrency(invoice?.valor_total),
      ]);
    }

    if (lineas.length > 0) {
      bodyRows.push(...lineas.map((line, index) => [
        hasConcept && index === 0 ? 'Lineas' : '',
        line?.concepto || 'Sin concepto',
        formatQty(line?.cantidad),
        formatCurrency(line?.valor),
      ]));
    }

    return [headerRow, ...bodyRows];
  });
}

function buildSummary(invoices) {
  return (Array.isArray(invoices) ? invoices : []).reduce((acc, invoice) => {
    acc.totalFacturado += Number(invoice?.valor_total || 0);
    acc.totalPagado += Number(invoice?.valor_abonado || 0);
    acc.totalPendiente += Number(invoice?.valor_pendiente || 0);
    acc.facturas += 1;
    return acc;
  }, {
    totalFacturado: 0,
    totalPagado: 0,
    totalPendiente: 0,
    facturas: 0,
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo preparar el PDF para WhatsApp'));
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      if (!base64) {
        reject(new Error('No se pudo convertir el PDF para WhatsApp'));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

export async function generateCarteraAccountStatementPdf(client, invoices) {
  const rows = Array.isArray(invoices) ? invoices : [];
  const summary = buildSummary(rows);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const tableMargin = { left: margin, right: margin + 18 };
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date();
  const generatedAtText = generatedAt.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, 28, pageWidth - margin * 2, 96, 18, 18, 'F');

  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('ATM Ricky Rich', margin + 18, 52);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Estado de cuenta', margin + 18, 78);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generado el ${generatedAtText}`, margin + 18, 98);

  doc.setFontSize(11);
  doc.text((client?.nombre || 'Cliente').toUpperCase(), pageWidth - margin - 18, 62, { align: 'right' });
  doc.setTextColor(191, 219, 254);
  doc.text(client?.celular ? `WhatsApp: ${client.celular}` : 'WhatsApp no registrado', pageWidth - margin - 18, 82, { align: 'right' });
  doc.setTextColor(226, 232, 240);
  doc.text(`${summary.facturas} factura(s) incluidas`, pageWidth - margin - 18, 102, { align: 'right' });

  const cards = [
    { label: 'Total facturado', value: formatCurrency(summary.totalFacturado), fill: [250, 250, 250], text: [15, 23, 42] },
    { label: 'Total pagado', value: formatCurrency(summary.totalPagado), fill: [220, 252, 231], text: [22, 101, 52] },
    { label: 'Saldo pendiente', value: formatCurrency(summary.totalPendiente), fill: [254, 226, 226], text: [153, 27, 27] },
  ];
  const gap = 12;
  const cardWidth = (pageWidth - margin * 2 - gap * 2) / 3;
  const cardY = 142;

  cards.forEach((card, index) => {
    const x = margin + (cardWidth + gap) * index;
    doc.setFillColor(...card.fill);
    doc.roundedRect(x, cardY, cardWidth, 64, 14, 14, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(card.label.toUpperCase(), x + 14, cardY + 20);
    doc.setTextColor(...card.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(card.value, x + 14, cardY + 44);
  });

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Reporte consolidado por factura. Más abajo encontrarás el detalle organizado de conceptos y lineas.', margin, 230);

  autoTable(doc, {
    startY: 246,
    margin: tableMargin,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
      cellPadding: 4,
      overflow: 'linebreak',
    },
    styles: {
      fontSize: 8,
      cellPadding: 4,
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
      textColor: [30, 41, 59],
      valign: 'middle',
      overflow: 'linebreak',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 64 },
      1: { cellWidth: 160 },
      2: { cellWidth: 64, halign: 'right' },
      3: { cellWidth: 64, halign: 'right' },
      4: { cellWidth: 74, halign: 'right' },
      5: { cellWidth: 58, halign: 'center' },
    },
    head: [[
      'Factura',
      'Concepto',
      'Total',
      'Pagado',
      'Pendiente',
      'Estado',
    ]],
    body: rows.map((invoice) => [
      getInvoiceCode(invoice),
      invoice?.concepto || 'Sin concepto',
      formatCurrency(invoice?.valor_total),
      formatCurrency(invoice?.valor_abonado),
      formatCurrency(invoice?.valor_pendiente),
      invoice?.estado || '—',
    ]),
  });

  const detailRows = buildInvoiceDetailRows(rows);
  const detailStartY = (doc.lastAutoTable?.finalY || 246) + 28;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Detalle organizado por factura', margin, detailStartY);

  autoTable(doc, {
    startY: detailStartY + 12,
    margin: tableMargin,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
      cellPadding: 4,
      overflow: 'linebreak',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 4,
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
      textColor: [30, 41, 59],
      valign: 'middle',
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 74 },
      1: { cellWidth: 270 },
      2: { cellWidth: 54, halign: 'right' },
      3: { cellWidth: 86, halign: 'right' },
    },
    head: [['Tipo', 'Concepto o detalle', 'Cantidad', 'Valor']],
    body: detailRows,
  });

  const finalY = (doc.lastAutoTable?.finalY || 246) + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Documento generado para compartir el estado actual de la cartera del cliente por WhatsApp.', margin, finalY);

  const fileName = `Estado_Cuenta_${sanitizeFileNamePart(client?.nombre)}_${generatedAt.toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const base64 = await blobToBase64(blob);

  return { blob, base64, fileName };
}
