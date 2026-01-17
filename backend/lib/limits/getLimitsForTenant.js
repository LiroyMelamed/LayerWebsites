const pool = require('../../config/db');
const { resolveTenantPlan } = require('../plan/resolveTenantPlan');

async function getLimitsForTenant(tenantId) {
    const policy = await resolveTenantPlan(tenantId);

    // Best-effort: fetch additional plan fields (pricing placeholders).
    let pricing = { priceMonthlyCents: null, currency: null };
    try {
        const planRes = await pool.query(
            `select price_monthly_cents as "PriceMonthlyCents", price_currency as "PriceCurrency"
       from subscription_plans
       where plan_key = $1
       limit 1`,
            [policy.planKey]
        );

        if (planRes.rows.length > 0) {
            pricing = {
                priceMonthlyCents: planRes.rows[0].PriceMonthlyCents ?? null,
                currency: planRes.rows[0].PriceCurrency ?? null,
            };
        }
    } catch {
        // ignore
    }

    return {
        tenantId: policy.tenantId,
        planKey: policy.planKey,
        planName: policy.planName,
        status: policy.status,
        startsAt: policy.startsAt,
        endsAt: policy.endsAt,

        retention: {
            platformMinDays: policy.platformMinDocumentsRetentionDays,
            documentsCoreDays: policy.effectiveDocumentsRetentionDaysCore,
            documentsPiiDays: policy.effectiveDocumentsRetentionDaysPii,
        },

        quotas: policy.quotas,
        featureFlags: policy.featureFlags,
        pricing,
    };
}

module.exports = { getLimitsForTenant };
