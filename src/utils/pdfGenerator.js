import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCLP } from '../formatMoney';

function formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatDateTime(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function buildPaymentSlipDoc(payment, user, config, options = {}) {
    const { signatureDataUrl, signedAt } = options;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    const isDaily = payment.pay_type === 'daily';
    const isHourly = payment.pay_type === 'madrugones';

    const drawLine = (y) => {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(33, 33, 33);
    doc.text(config?.company_name?.toUpperCase() || 'EMPRESA DEMO', margin, 25);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`NIT: ${config?.nit || '800.000.000-0'}`, margin, 32);

    doc.setFontSize(10);
    doc.text((isDaily || isHourly) ? "RECIBO DE PAGO" : "COMPROBANTE DE NÓMINA", pageWidth - margin, 25, { align: "right" });
    doc.text(`No. ${payment.id.toString().padStart(6, '0')}`, pageWidth - margin, 32, { align: "right" });
    doc.text(`Fecha Emisión: ${formatDate(new Date().toISOString())}`, pageWidth - margin, 39, { align: "right" });

    drawLine(45);

    const startY = 55;

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("EMPLEADO", margin, startY);

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text((user.full_name || user.name || user.username).toUpperCase(), margin, startY + 6);

    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(`CC: ${user.cedula || 'N/A'}`, margin, startY + 12);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("PERIODO DE PAGO", pageWidth - margin, startY, { align: "right" });

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`${formatDate(payment.period_start)} - ${formatDate(payment.period_end)}`, pageWidth - margin, startY + 6, { align: "right" });

    doc.setFontSize(10);
    if (isDaily) {
        doc.text(`Valor por Día: ${formatCLP(payment.daily_rate)}`, pageWidth - margin, startY + 12, { align: "right" });
    } else if (isHourly) {
        doc.text(`Valor por Hora: ${formatCLP(payment.hourly_rate)}`, pageWidth - margin, startY + 12, { align: "right" });
    } else {
        doc.text(`Salario Base: ${formatCLP(payment.base_salary)}`, pageWidth - margin, startY + 12, { align: "right" });
    }

    const tableStyles = {
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2, textColor: [50, 50, 50] },
        headStyles: {
            fillColor: [245, 245, 245],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.1,
            lineColor: [200, 200, 200]
        },
        columnStyles: {
            0: { cellWidth: 130 },
            1: { cellWidth: 'auto', halign: 'right' }
        },
        margin: { left: margin, right: margin }
    };

    if (isDaily) {
        const dailyDetails = [
            ['Valor por Día', formatCLP(payment.daily_rate)],
            ['Días Trabajados', `${payment.days_worked}`],
            ['Subtotal', formatCLP(payment.paid_base)],
        ];

        if (payment.advance > 0) {
            dailyDetails.push(['Adelanto Descontado', `-${formatCLP(payment.advance)}`]);
        }

        if (payment.commission > 0) {
            dailyDetails.push(['Comisión Administración POS', `+${formatCLP(payment.commission)}`]);
        }

        autoTable(doc, {
            startY: 85,
            head: [['DETALLE', 'VALOR']],
            body: dailyDetails,
            ...tableStyles,
            didParseCell: function (data) {
                if (data.section === 'head') {
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.1);
                    doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                }
            }
        });
    } else {
        const earnings = [
            [isHourly ? `Pago por Horas (${payment.hours_worked || 0}h x ${formatCLP(payment.hourly_rate || 0)})` : 'Salario Básico', formatCLP(payment.paid_base)],
        ];

        if (payment.transport_aid > 0) earnings.push(['Auxilio de Transporte', formatCLP(payment.transport_aid)]);
        if (payment.sundays_total > 0) earnings.push(['Dominicales / Festivos', formatCLP(payment.sundays_total)]);
        if (payment.madrugones_total > 0) earnings.push(['Horas Madrugón', formatCLP(payment.madrugones_total)]);
        if (payment.commission > 0) earnings.push(['Comisión Administración POS', formatCLP(payment.commission)]);

        try {
            if (payment.aditions) {
                const ads = typeof payment.aditions === 'string' ? JSON.parse(payment.aditions) : payment.aditions;
                if (Array.isArray(ads)) ads.forEach(a => earnings.push([a.label, formatCLP(a.value)]));
            }
        } catch (e) { }

        autoTable(doc, {
            startY: 85,
            head: [['DEVENGADOS', 'VALOR']],
            body: earnings,
            ...tableStyles,
            didParseCell: function (data) {
                if (data.section === 'head') {
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.1);
                    doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                }
            }
        });

        const deductions = [
            [`Aporte Salud (${config?.porcentaje_salud || 4}%)`, formatCLP(payment.health)],
            [`Aporte Pensión (${config?.porcentaje_pension || 4}%)`, formatCLP(payment.pension)],
        ];

        if (payment.advance > 0) deductions.push(['Adelantos / Préstamos', formatCLP(payment.advance)]);

        try {
            if (payment.deductions) {
                const deds = typeof payment.deductions === 'string' ? JSON.parse(payment.deductions) : payment.deductions;
                if (Array.isArray(deds)) deds.forEach(d => deductions.push([d.label, formatCLP(d.value)]));
            }
        } catch (e) { }

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 10,
            head: [['DEDUCCIONES', 'VALOR']],
            body: deductions,
            ...tableStyles,
            columnStyles: {
                0: { cellWidth: 130 },
                1: { cellWidth: 'auto', halign: 'right' }
            }
        });
    }

    const finalY = doc.lastAutoTable.finalY + 15;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(pageWidth - 80, finalY, pageWidth - margin, finalY);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(isDaily ? "TOTAL A PAGAR" : "NETO A PAGAR", pageWidth - 80, finalY + 8);
    doc.text(formatCLP(payment.total_paid), pageWidth - margin, finalY + 8, { align: "right" });

    const signY = finalY + 50;

    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(margin + 10, signY, margin + 70, signY);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("EMPLEADOR", margin + 40, signY + 5, { align: "center" });

    doc.line(pageWidth - 80, signY, pageWidth - 20, signY);
    doc.text("RECIBÍ CONFORME", pageWidth - 50, signY + 5, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text((user.full_name || user.name || "Usuario").toUpperCase(), pageWidth - 50, signY + 10, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(`CC: ${user.cedula || '_________________'}`, pageWidth - 50, signY + 15, { align: "center" });

    if (signatureDataUrl) {
        try {
            doc.addImage(signatureDataUrl, 'PNG', pageWidth - 78, signY - 17, 56, 14, undefined, 'FAST');
            doc.setFontSize(7);
            doc.setTextColor(80, 80, 80);
            doc.text(`Firmado: ${formatDateTime(signedAt || new Date().toISOString())}`, pageWidth - 50, signY - 20, { align: "center" });
            doc.setTextColor(0, 0, 0);
        } catch (e) {
            console.error('Error embebiendo firma en PDF', e);
        }
    }

    return doc;
}

export const generatePaymentSlip = (payment, user, config) => {
    const doc = buildPaymentSlipDoc(payment, user, config);
    const filePrefix = (payment.pay_type === 'daily' || payment.pay_type === 'madrugones') ? 'Recibo' : 'Nomina';
    doc.save(`${filePrefix}_${user.name?.replace(/\s+/g, '_')}_${payment.id}.pdf`);
};

export const generatePaymentSlipBlob = (payment, user, config, options = {}) => {
    const doc = buildPaymentSlipDoc(payment, user, config, options);
    return doc.output('blob');
};
