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

function getInvoiceCode(invoice) {
  return invoice?.op || `#${invoice?.id || ''}`;
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
  const unitValue = Number(line?.valor_unitario || 0);
  const total = Number(line?.valor || 0);
  if (unitValue > 0) return unitValue;
  if (quantity > 0 && total > 0) return total / quantity;
  return 0;
}

function getLineSubtotal(line) {
  const quantity = Number(line?.cantidad || 0);
  const unitValue = getLineUnitValue(line);
  const total = Number(line?.valor || 0);
  if (quantity > 0 && unitValue > 0) return quantity * unitValue;
  return total;
}

function buildInvoiceRows(invoices) {
  return (Array.isArray(invoices) ? invoices : []).flatMap((invoice) => {
    const lineas = Array.isArray(invoice?.lineas) ? invoice.lineas.filter(Boolean) : [];
    const conceptoGeneral = String(invoice?.concepto || '').trim();
    const rows = [];
    const invoiceLabel = getInvoiceCode(invoice);

    rows.push([{
      content: `Factura ${invoiceLabel}\nConcepto de la factura: ${conceptoGeneral || 'Sin concepto'}`,
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
        formatQty(line?.cantidad),
        formatCurrency(getLineUnitValue(line)),
        formatCurrency(getLineSubtotal(line)),
      ]);
    });

    rows.push([
      {
        content: 'Total factura',
        colSpan: 3,
        styles: { fontStyle: 'bold', halign: 'right', textColor: [15, 23, 42] },
      },
      formatCurrency(invoice?.valor_total),
    ]);
    rows.push([
      {
        content: 'Abonado',
        colSpan: 3,
        styles: { fontStyle: 'bold', halign: 'right', textColor: [22, 101, 52] },
      },
      formatCurrency(invoice?.valor_abonado),
    ]);
    rows.push([
      {
        content: 'Pendiente',
        colSpan: 3,
        styles: { fontStyle: 'bold', halign: 'right', textColor: [153, 27, 27] },
      },
      formatCurrency(invoice?.valor_pendiente),
    ]);

    return rows;
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

  doc.setFontSize(11);
  doc.text((client?.nombre || 'Cliente').toUpperCase(), pageWidth - margin - 18, 62, { align: 'right' });
  doc.setTextColor(191, 219, 254);
  doc.text('Resumen actual de cartera', pageWidth - margin - 18, 82, { align: 'right' });
  doc.setTextColor(226, 232, 240);
  doc.text(`${summary.facturas} factura(s)`, pageWidth - margin - 18, 102, { align: 'right' });

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

  const invoiceRows = buildInvoiceRows(rows);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Detalle por factura', margin, 230);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Cada factura muestra primero su concepto general y debajo las líneas cobradas.', margin, 244);

  autoTable(doc, {
    startY: 260,
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
    body: invoiceRows.length > 0 ? invoiceRows : [[
      'No hay líneas registradas',
      '—',
      '—',
      '—',
    ]],
  });

  const finalY = (doc.lastAutoTable?.finalY || 260) + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Documento generado para compartir el estado actual de la cartera del cliente.', margin, finalY);

  const fileName = `Estado_Cuenta_${sanitizeFileNamePart(client?.nombre)}_${generatedAt.toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const base64 = await blobToBase64(blob);

  return { blob, base64, fileName };
}
