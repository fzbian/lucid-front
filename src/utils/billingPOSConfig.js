function posNameKey(value) {
    return String(value || '').trim().toLocaleLowerCase('es');
}

export function configKey(cfg) {
    const id = Number(cfg?.odoo_pos_id);
    return id > 0 ? `odoo:${id}` : `legacy:${posNameKey(cfg?.pos_name)}`;
}

export function analyzeBillingConfigs(configs) {
    const rows = Array.isArray(configs) ? configs : [];
    const seen = new Set();
    const duplicateNames = [];
    rows.forEach((cfg) => {
        const key = configKey(cfg);
        if (seen.has(key)) duplicateNames.push(cfg.pos_name);
        seen.add(key);
    });
    const withoutOdooID = rows.filter((cfg) => !(Number(cfg.odoo_pos_id) > 0)).map((cfg) => cfg.pos_name);
    return { count: rows.length, duplicateNames, withoutOdooID, complete: duplicateNames.length === 0 && withoutOdooID.length === 0 };
}

export function buildLocaleDraft(configs) {
    return Object.fromEntries((Array.isArray(configs) ? configs : []).map((cfg) => [configKey(cfg), cfg.include_in_reports !== false]));
}

export function buildBillingConfigEntries(configs, draft) {
    return configs.map((cfg) => ({
        ...cfg,
        include_in_reports: draft[configKey(cfg)] === true,
    }));
}

export function verifyPersistedSelection(entries, configs) {
    const persisted = new Map(configs.map((cfg) => [configKey(cfg), cfg]));
    if (persisted.size !== entries.length) throw new Error('La lista de puntos de venta cambió; actualiza la configuración.');
    const mismatches = entries.filter((entry) => {
        const cfg = persisted.get(configKey(entry));
        return !cfg || (cfg.include_in_reports !== false) !== entry.include_in_reports;
    });
    if (mismatches.length) throw new Error(`No se confirmó la selección de: ${mismatches.map((entry) => entry.pos_name).join(', ')}`);
}
