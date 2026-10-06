const STATUSES = new Set(['active', 'past_due', 'suspended', 'complimentary', 'none']);
const PURPOSES = new Set(['renewal', 'setup', 'upgrade', 'retry', 'annual', 'manual', 'other']);

function cents(value) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
        throw new Error('Invalid billing amount');
    }
    return Math.round(Number(value) * 100);
}

function iso(value) {
    const date = new Date(value);
    if (!value || !Number.isFinite(date.getTime())) throw new Error('Invalid billing timestamp');
    return date.toISOString();
}

function summary(snapshot) {
    if (!snapshot) throw new Error('Missing billing snapshot');
    const billingStatus = snapshot.available === false || snapshot.billingEnabled === false
        ? 'none' : snapshot.status;
    if (!STATUSES.has(billingStatus)) throw new Error('Invalid billing status');
    // Complimentary/disabled plans have a list price, but no recurring revenue.
    const billable = billingStatus === 'active' || billingStatus === 'past_due';
    const monthly = snapshot.billingInterval === 'yearly'
        ? Number(snapshot.priceYearlyIls) / 12 : snapshot.package?.total;
    return {
        productId: 'layerwebsites',
        ts: new Date().toISOString(),
        mrrCents: billable ? cents(monthly) : 0,
        billingStatus,
        pastDue: billingStatus === 'past_due' || billingStatus === 'suspended',
        currency: 'ILS',
        plan: snapshot.package ? `${snapshot.package.platformId}/${snapshot.package.resourceId}` : 'manual',
        complimentaryUntil: snapshot.complimentaryUntil || null,
    };
}

function payments(rows) {
    return rows.map(row => ({
        id: String(row.id),
        amountCents: cents(row.amountIls),
        currency: row.currency || 'ILS',
        status: row.status,
        purpose: PURPOSES.has(row.kind) ? row.kind : 'other',
        occurredAt: iso(row.settledAt || row.createdAt),
    }));
}

module.exports = { summary, payments };
