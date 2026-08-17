const pool = require('../../config/db');
const { quotasForPackage, resolvePricingLineItems } = require('../billing/pricingPackage');
const { isDateInFuture, defaultComplimentaryUntil } = require('../billing/tenantBillingDefaults');

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
        storageMbQuota: row.StorageMbQuota,
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
                    sp.storage_mb_quota as "StorageMbQuota",
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
                    sp.storage_mb_quota as "StorageMbQuota",
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

        // Complimentary / unlimited: env, then firm_billing row, then tenant default dates.
        let isUnlimited = false;
        const envVal = String(process.env.FIRM_DEFAULT_UNLIMITED_UNTIL_UTC || '').trim();
        if (envVal) {
            const d = new Date(envVal);
            if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) isUnlimited = true;
        }

        let billingPackage = null;
        try {
            const billingRes = await pool.query(
                `SELECT platform_id, resource_id, signing_id, billing_enabled, complimentary_until, status
                 FROM firm_billing WHERE id = 1 LIMIT 1`
            );
            const b = billingRes.rows?.[0];
            if (b) {
                billingPackage = resolvePricingLineItems({
                    platformId: b.platform_id,
                    resourceId: b.resource_id,
                    signingId: b.signing_id,
                });
                if (b.billing_enabled === false) isUnlimited = true;
                if (isDateInFuture(b.complimentary_until)) isUnlimited = true;
            }
        } catch (e) {
            if (!isRelationMissingError(e)) throw e;
        }

        if (!isUnlimited && isDateInFuture(defaultComplimentaryUntil())) {
            isUnlimited = true;
        }

        const plan = normalizePlanRow(planRow) || {
            planKey: 'UNKNOWN',
            name: 'Unknown',
            featureFlags: {},
        };

        const packageQuotas = billingPackage ? quotasForPackage(billingPackage) : null;
        if (packageQuotas) {
            plan.planKey = packageQuotas.planKey || plan.planKey;
            plan.name = billingPackage.displayName || billingPackage.resource?.label || plan.name;
            plan.documentsMonthlyQuota = packageQuotas.documentsMonthlyQuota;
            plan.storageMbQuota = packageQuotas.storageMbQuota;
            plan.usersQuota = packageQuotas.usersQuota;
            plan.priceMonthlyCents = Math.round(Number(billingPackage.total || 0) * 100);
            plan.priceCurrency = 'ILS';
        }

        const { effectiveDocumentsRetentionDaysCore, effectiveDocumentsRetentionDaysPii } = applyRetentionFloor({
            coreDays: plan.documentsRetentionDaysCore,
            piiDays: plan.documentsRetentionDaysPii,
        });

        const quotas = {
            documentsMonthlyQuota: plan.documentsMonthlyQuota ?? null,
            storageMbQuota: plan.storageMbQuota ?? null,
            usersQuota: plan.usersQuota ?? null,
            otpSmsMonthlyQuota: plan.otpSmsMonthlyQuota ?? null,
            evidenceGenerationsMonthlyQuota: plan.evidenceGenerationsMonthlyQuota ?? null,
            evidenceCpuSecondsMonthlyQuota: plan.evidenceCpuSecondsMonthlyQuota ?? null,
        };

        const effectiveQuotas = isUnlimited
            ? {
                documentsMonthlyQuota: null,
                storageMbQuota: null,
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
            package: billingPackage || null,
        };
    } catch (e) {
        if (isRelationMissingError(e)) return null;
        throw e;
    }
}

module.exports = { resolveFirmPlan };
