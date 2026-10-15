const { resolveFirmPlan } = require('../plan/resolveFirmPlan');

/**
 * Get plan limits for this single-tenant DB.
 * The `_firmId` parameter is kept for backward-compat but ignored.
 */
async function getLimitsForFirm(_firmId) {
    const plan = await resolveFirmPlan(null);
    if (!plan) return null;

    return {
        scope: 'firm',
        planKey: plan.planKey,
        name: plan.name,
        priceMonthlyCents: plan.priceMonthlyCents ?? null,
        priceCurrency: plan.priceCurrency ?? null,

        effectiveDocumentsRetentionDaysCore: plan.effectiveDocumentsRetentionDaysCore,
        effectiveDocumentsRetentionDaysPii: plan.effectiveDocumentsRetentionDaysPii,

        quotas: plan.quotas,
        featureFlags: plan.featureFlags || {},
    };
}

module.exports = { getLimitsForFirm };
