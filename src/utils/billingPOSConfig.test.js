import { configKey, analyzeBillingConfigs, buildLocaleDraft, buildBillingConfigEntries, verifyPersistedSelection } from './billingPOSConfig';

test('Gran San is selectable and renames preserve the draft by Odoo ID', () => {
    const original = { odoo_pos_id: 42, pos_name: 'Gran San', include_in_reports: false, arriendo: 100 };
    const draft = buildLocaleDraft([original]);
    draft[configKey(original)] = true;
    const renamed = { ...original, pos_name: 'Nuevo nombre' };
    const entries = buildBillingConfigEntries([renamed], draft);
    expect(entries[0]).toMatchObject({ odoo_pos_id: 42, include_in_reports: true, arriendo: 100 });
    expect(() => verifyPersistedSelection(entries, [{ ...renamed, include_in_reports: true }])).not.toThrow();
});

test('every POS can be disabled including Internet', () => {
    const configs = [{ odoo_pos_id: 1, pos_name: 'Internet', include_in_reports: false }];
    const draft = buildLocaleDraft(configs);
    expect(buildBillingConfigEntries(configs, draft)[0].include_in_reports).toBe(false);
});

test('identical names with distinct Odoo IDs have independent selections', () => {
    const configs = [
        { odoo_pos_id: 42, pos_name: 'Gran San', include_in_reports: true },
        { odoo_pos_id: 43, pos_name: 'Gran San', include_in_reports: false },
    ];
    expect(analyzeBillingConfigs(configs).complete).toBe(true);
    expect(Object.values(buildLocaleDraft(configs))).toEqual([true, false]);
});

test('verification rejects missing IDs and unpersisted selections', () => {
    const entry = { odoo_pos_id: 42, pos_name: 'Gran San', include_in_reports: true };
    expect(analyzeBillingConfigs([{ pos_name: 'Gran San' }]).complete).toBe(false);
    expect(() => verifyPersistedSelection([entry], [{ ...entry, include_in_reports: false }])).toThrow();
    expect(() => verifyPersistedSelection([entry], [{ ...entry, odoo_pos_id: 43 }])).toThrow();
});
