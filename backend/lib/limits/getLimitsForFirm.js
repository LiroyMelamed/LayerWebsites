const { resolveFirmPlan } = require('../plan/resolveFirmPlan');

async function getLimitsForFirm(firmId) {
    const plan = await resolveFirmPlan(firmId);
    if (!plan) return null;

    return {
        scope: 'firm',
        firmId: Number(firmId),
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
