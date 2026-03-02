const BILLING_DRAFTS_KEY = 'atm_billing_drafts_v1';

function readDrafts() {
    try {
        const raw = localStorage.getItem(BILLING_DRAFTS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeDrafts(drafts) {
    try {
        localStorage.setItem(BILLING_DRAFTS_KEY, JSON.stringify(drafts));
    } catch {
        // ignore localStorage write errors (quota/private mode)
    }
}

function draftKey(year, month) {
    return `${Number(year)}-${Number(month)}`;
}

export function getBillingDraft(year, month) {
    const drafts = readDrafts();
    return drafts[draftKey(year, month)] || null;
}

export function upsertBillingDraft(year, month, patch) {
    const drafts = readDrafts();
    const key = draftKey(year, month);
    drafts[key] = {
        ...(drafts[key] || {}),
        ...(patch || {}),
        year: Number(year),
        month: Number(month),
        updated_at: new Date().toISOString(),
    };
    writeDrafts(drafts);
    return drafts[key];
}

export function clearBillingDraft(year, month) {
    const drafts = readDrafts();
    const key = draftKey(year, month);
    if (drafts[key]) {
        delete drafts[key];
        writeDrafts(drafts);
    }
}
