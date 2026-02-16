const pool = require('../../config/db');

function normalizePlanRow(row) {
    if (!row) return null;
    return {
        planKey: row.PlanKey,
        name: row.Name,
        featureFlags: row.FeatureFlags || {},

        documentsRetentionDaysLegacy: row.DocumentsRetentionDays,
        documentsRetentionDaysCore: row.DocumentsRetentionDaysCore,
        documentsRetentionDaysPii: row.DocumentsRetentionDaysPii,

        documentsMonthlyQuota: row.DocumentsMonthlyQuota,
        storageGbQuota: row.StorageGbQuota,
        usersQuota: row.UsersQuota,
        otpSmsMonthlyQuota: row.OtpSmsMonthlyQuota,
        evidenceGenerationsMonthlyQuota: row.EvidenceGenerationsMonthlyQuota,
        evidenceCpuSecondsMonthlyQuota: row.EvidenceCpuSecondsMonthlyQuota,

        priceMonthlyCents: row.PriceMonthlyCents ?? null,
        priceCurrency: row.PriceCurrency ?? null,
    };
}

function applyRetentionFloor({ coreDays, piiDays }) {
    const floor = Number(process.env.PLATFORM_MIN_DOCUMENT_RETENTION_DAYS || '60');
    const floorDays = Number.isFinite(floor) && floor > 0 ? Math.floor(floor) : 60;

    const effCore = coreDays ?? piiDays ?? null;
    const effPii = piiDays ?? coreDays ?? null;

    return {
        effectiveDocumentsRetentionDaysCore: Math.max(Number(effCore || floorDays), floorDays),
        effectiveDocumentsRetentionDaysPii: Math.max(Number(effPii || floorDays), floorDays),
    };
}

function isRelationMissingError(e) {
    const msg = String(e?.message || '');
    return msg.includes('does not exist');
}

/**
 * Resolve the active plan for this single-tenant DB.
 * Reads from tenant_subscriptions → subscription_plans (no firm tables).
 * Falls back to BASIC if no subscription exists.
 * The optional `_firmId` parameter is kept for backward-compat but ignored.
 */
async function resolveFirmPlan(_firmId) {
    try {
        // Try tenant subscription first (tenant_id = 1 is the admin in a single-tenant DB)
        let planRow = null;
        try {
            const tenantRes = await pool.query(
                `select
                    sp.plan_key as "PlanKey",
                    sp.name as "Name",
                    sp.documents_retention_days as "DocumentsRetentionDays",
                    sp.documents_retention_days_core as "DocumentsRetentionDaysCore",
                    sp.documents_retention_days_pii as "DocumentsRetentionDaysPii",
                    sp.documents_monthly_quota as "DocumentsMonthlyQuota",
                    sp.storage_gb_quota as "StorageGbQuota",
                    sp.users_quota as "UsersQuota",
                    sp.otp_sms_monthly_quota as "OtpSmsMonthlyQuota",
                    sp.evidence_generations_monthly_quota as "EvidenceGenerationsMonthlyQuota",
                    sp.evidence_cpu_seconds_monthly_quota as "EvidenceCpuSecondsMonthlyQuota",
                    sp.feature_flags as "FeatureFlags",
                    sp.price_monthly_cents as "PriceMonthlyCents",
                    sp.price_currency as "PriceCurrency"
                 from tenant_subscriptions ts
                 join subscription_plans sp on sp.plan_key = ts.plan_key
                 where ts.status = 'active'
                 order by ts.updated_at desc
                 limit 1`
            );
            planRow = tenantRes.rows?.[0] || null;
        } catch (e) {
            if (!isRelationMissingError(e)) throw e;
        }

        if (!planRow) {
            // Fallback: BASIC plan
            const basic = await pool.query(
                `select
                    sp.plan_key as "PlanKey",
                    sp.name as "Name",
                    sp.documents_retention_days as "DocumentsRetentionDays",
                    sp.documents_retention_days_core as "DocumentsRetentionDaysCore",
                    sp.documents_retention_days_pii as "DocumentsRetentionDaysPii",
                    sp.documents_monthly_quota as "DocumentsMonthlyQuota",
                    sp.storage_gb_quota as "StorageGbQuota",
                    sp.users_quota as "UsersQuota",
                    sp.otp_sms_monthly_quota as "OtpSmsMonthlyQuota",
                    sp.evidence_generations_monthly_quota as "EvidenceGenerationsMonthlyQuota",
                    sp.evidence_cpu_seconds_monthly_quota as "EvidenceCpuSecondsMonthlyQuota",
                    sp.feature_flags as "FeatureFlags",
                    sp.price_monthly_cents as "PriceMonthlyCents",
                    sp.price_currency as "PriceCurrency"
                 from subscription_plans sp
                 where sp.plan_key = 'BASIC'
                 limit 1`
            );
            planRow = basic.rows?.[0] || null;
        }

        // Unlimited override via env (for initial deployments)
        let isUnlimited = false;
        const envVal = String(process.env.FIRM_DEFAULT_UNLIMITED_UNTIL_UTC || '').trim();
        if (envVal) {
            const d = new Date(envVal);
            if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) isUnlimited = true;
        }

        const plan = normalizePlanRow(planRow) || {
            planKey: 'UNKNOWN',
            name: 'Unknown',
            featureFlags: {},
        };

        const { effectiveDocumentsRetentionDaysCore, effectiveDocumentsRetentionDaysPii } = applyRetentionFloor({
            coreDays: plan.documentsRetentionDaysCore,
            piiDays: plan.documentsRetentionDaysPii,
        });

        const quotas = {
            documentsMonthlyQuota: plan.documentsMonthlyQuota ?? null,
            storageGbQuota: plan.storageGbQuota ?? null,
            usersQuota: plan.usersQuota ?? null,
            otpSmsMonthlyQuota: plan.otpSmsMonthlyQuota ?? null,
            evidenceGenerationsMonthlyQuota: plan.evidenceGenerationsMonthlyQuota ?? null,
            evidenceCpuSecondsMonthlyQuota: plan.evidenceCpuSecondsMonthlyQuota ?? null,
        };

        const effectiveQuotas = isUnlimited
            ? {
                documentsMonthlyQuota: null,
                storageGbQuota: null,
                usersQuota: null,
                otpSmsMonthlyQuota: null,
                evidenceGenerationsMonthlyQuota: null,
                evidenceCpuSecondsMonthlyQuota: null,
            }
            : quotas;

        return {
            planKey: plan.planKey,
            name: plan.name,
            featureFlags: {
                ...(plan.featureFlags || {}),
                unlimited: isUnlimited,
            },

            priceMonthlyCents: plan.priceMonthlyCents,
            priceCurrency: plan.priceCurrency,

            effectiveDocumentsRetentionDaysCore,
            effectiveDocumentsRetentionDaysPii,

            quotas: effectiveQuotas,
        };
    } catch (e) {
        if (isRelationMissingError(e)) return null;
        throw e;
    }
}

module.exports = { resolveFirmPlan };
