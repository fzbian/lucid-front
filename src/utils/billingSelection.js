function uniqueSortedNumbers(values) {
    return [...new Set((values || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))]
        .sort((a, b) => a - b);
}

function uniqueSortedNames(values) {
    return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

export function verifyMonthlyPOSSelection(payload) {
    if (!Array.isArray(payload?.selected_pos_ids) || !Array.isArray(payload?.selected_pos_names)) {
        return;
    }

    const rows = Array.isArray(payload.data) ? payload.data : [];
    const expectedIDs = uniqueSortedNumbers(payload.selected_pos_ids);
    const actualIDs = uniqueSortedNumbers(rows.map((row) => row?.odoo_pos_id));
    const expectedNames = uniqueSortedNames(payload.selected_pos_names);
    const actualNames = uniqueSortedNames(rows.map((row) => row?.pos_name));

    if (JSON.stringify(expectedIDs) !== JSON.stringify(actualIDs) ||
        JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
        throw new Error('El informe no coincide con la selección verificada de puntos de venta de Odoo');
    }
}
