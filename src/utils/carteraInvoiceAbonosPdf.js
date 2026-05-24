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

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatQty(value) {
  const qty = Number(value || 0);
  return qty.toLocaleString('es-CO', {
    minimumFractionDigits: Number.isInteger(qty) ? 0 : 2,
    maximumFractionDigits: 3,
  });
}

function getLineUnitValue(line) {
  const quantity = Number(line?.cantidad || 0);
  const storedUnit = Number(line?.valor_unitario || 0);
  if (storedUnit > 0) return storedUnit;
  const total = Number(line?.valor || 0);
  if (quantity > 0 && total > 0) return total / quantity;
  return 0;
}

function getLineTotal(line) {
  const quantity = Number(line?.cantidad || 0);
  const storedTotal = Number(line?.valor || 0);
  const unit = getLineUnitValue(line);
  if (quantity > 0 && unit > 0) return quantity * unit;
  return storedTotal;
}

function getInvoiceCode(invoice) {
  return invoice?.op || `#${invoice?.id || ''}`;
}

function sanitizeFileNamePart(value) {
  return String(value || 'factura')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'factura';
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

function buildInvoiceRows(invoice) {
  const lineas = Array.isArray(invoice?.lineas) ? invoice.lineas.filter(Boolean) : [];
  const conceptoGeneral = String(invoice?.concepto || '').trim();
  const rows = [];

  rows.push([{
    content: `Factura ${getInvoiceCode(invoice)}\nConcepto de la factura: ${conceptoGeneral || 'Sin concepto'}`,
    colSpan: 4,
    styles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: { top: 6, right: 5, bottom: 6, left: 5 },
      overflow: 'linebreak',
    },
  }]);

  const detailLines = lineas.length > 0
    ? lineas
    : [{
      concepto: conceptoGeneral || 'Concepto general',
      cantidad: 1,
      valor_unitario: Number(invoice?.valor_total || 0),
      valor: Number(invoice?.valor_total || 0),
    }];

  detailLines.forEach((line) => {
    rows.push([
      line?.concepto || 'Sin concepto',
      formatQty(line?.cantidad || 0),
      formatCurrency(getLineUnitValue(line)),
      formatCurrency(getLineTotal(line)),
    ]);
  });

  rows.push([
    {
      content: 'Total factura',
      colSpan: 3,
      styles: { fontStyle: 'bold', halign: 'right', textColor: [15, 23, 42] },
    },
    formatCurrency(invoice?.valor_total || 0),
  ]);
  rows.push([
    {
      content: 'Abonado',
      colSpan: 3,
      styles: { fontStyle: 'bold', halign: 'right', textColor: [22, 101, 52] },
    },
    formatCurrency(invoice?.valor_abonado || 0),
  ]);
  rows.push([
    {
      content: 'Pendiente',
      colSpan: 3,
      styles: { fontStyle: 'bold', halign: 'right', textColor: [153, 27, 27] },
    },
    formatCurrency(invoice?.valor_pendiente || 0),
  ]);

  return rows;
}

function buildSummary(invoice, abonos) {
  const rows = Array.isArray(abonos) ? abonos : [];
  return rows.reduce((acc, abono) => {
    acc.totalAplicado += Number(abono?.valor_aplicado || 0);
    acc.totalPagos += Number(abono?.monto_total || 0);
    acc.count += 1;
    return acc;
  }, {
    totalAplicado: 0,
    totalPagos: 0,
    count: 0,
    pendiente: Number(invoice?.valor_pendiente || 0),
  });
}

export async function generateCarteraInvoiceAbonosPdf(invoice, abonos) {
  const rows = Array.isArray(abonos) ? abonos : [];
  const summary = buildSummary(invoice, rows);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
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
  doc.roundedRect(margin, 28, pageWidth - margin * 2, 112, 18, 18, 'F');

  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('ATM Ricky Rich', margin + 18, 52);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(`Abonos de factura ${invoice?.op || ''}`.trim(), margin + 18, 78);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generado el ${generatedAtText}`, margin + 18, 98);

  doc.setFontSize(11);
  doc.text((invoice?.cliente?.nombre || 'Cliente').toUpperCase(), pageWidth - margin - 18, 62, { align: 'right' });
  doc.setTextColor(191, 219, 254);
  doc.text(invoice?.cliente?.celular ? `WhatsApp: ${invoice.cliente.celular}` : 'WhatsApp no registrado', pageWidth - margin - 18, 82, { align: 'right' });
  doc.setTextColor(226, 232, 240);
  doc.text(`${summary.count} abono(s) registrados`, pageWidth - margin - 18, 102, { align: 'right' });

  const cards = [
    { label: 'Valor factura', value: formatCurrency(invoice?.valor_total || 0), fill: [250, 250, 250], text: [15, 23, 42] },
    { label: 'Aplicado a factura', value: formatCurrency(summary.totalAplicado), fill: [220, 252, 231], text: [22, 101, 52] },
    { label: 'Pendiente actual', value: formatCurrency(summary.pendiente), fill: [254, 226, 226], text: [153, 27, 27] },
  ];
  const gap = 12;
  const cardWidth = (pageWidth - margin * 2 - gap * 2) / 3;
  const cardY = 158;

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

  const invoiceRows = buildInvoiceRows(invoice);
  let cursorY = 246;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Detalle por factura', margin, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('La factura muestra primero su concepto general y debajo las líneas cobradas.', margin, cursorY + 14);

  cursorY += 30;
  if (invoiceRows.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.text('No hay líneas detalladas registradas; se muestra solo el concepto general de la factura.', margin, cursorY + 6);
    cursorY += 18;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        lineColor: [226, 232, 240],
        lineWidth: 0.4,
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
        0: { cellWidth: 232 },
        1: { cellWidth: 54, halign: 'center' },
        2: { cellWidth: 88, halign: 'right' },
        3: { cellWidth: 110, halign: 'right' },
      },
      head: [[
        'Línea cobrada',
        'Cant.',
        'Valor unitario',
        'Subtotal / saldo',
      ]],
      body: invoiceRows,
    });
    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 18;
  }

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Abonos aplicados', margin, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Pagos actuales aplicados a esta factura.', margin, cursorY + 14);

  autoTable(doc, {
    startY: cursorY + 22,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
    },
    styles: {
      fontSize: 9,
      cellPadding: 6,
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 108 },
      1: { cellWidth: 74, halign: 'center' },
      2: { cellWidth: 72, halign: 'right' },
      3: { cellWidth: 76, halign: 'right' },
      4: { cellWidth: 110 },
      5: { cellWidth: 72, halign: 'center' },
    },
    head: [[
      'Fecha',
      'Método',
      'Aplicado',
      'Pago total',
      'Referencia',
      'Cobertura',
    ]],
    body: rows.map((abono) => [
      formatDate(abono?.fecha_pago || abono?.created_at),
      abono?.metodo_pago || '—',
      formatCurrency(abono?.valor_aplicado || 0),
      formatCurrency(abono?.monto_total || 0),
      abono?.referencia || '—',
      Array.isArray(abono?.distribucion) && abono.distribucion.length > 1 ? 'Distribuido' : 'Directo',
    ]),
  });

  const finalY = (doc.lastAutoTable?.finalY || cursorY + 16) + 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Documento generado para compartir por WhatsApp el historial de abonos aplicados a una factura.', margin, finalY);

  const fileName = `Abonos_${sanitizeFileNamePart(invoice?.op || invoice?.id)}_${generatedAt.toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const base64 = await blobToBase64(blob);

  return { blob, base64, fileName };
}
