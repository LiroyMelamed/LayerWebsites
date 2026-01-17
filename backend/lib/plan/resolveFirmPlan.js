const pool = require('../../config/db');
const { isFirmScopeEnabled, getDefaultFirmKey } = require('../firm/firmScope');

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

async function resolveFirmPlan(firmId) {
    if (!isFirmScopeEnabled()) {
        return null;
    }

    const fid = Number(firmId);
    if (!Number.isFinite(fid) || fid <= 0) return null;

    try {
        const planRes = await pool.query(
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
                sp.price_currency as "PriceCurrency",
                fs.status as "Status"
             from firm_subscriptions fs
             join subscription_plans sp on sp.plan_key = fs.plan_key
             where fs.firmid = $1
               and fs.status = 'active'
             limit 1`,
            [fid]
        );

        let planRow = planRes.rows?.[0] || null;
        if (!planRow) {
            // Safe default: BASIC if firm has no subscription yet.
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

        const overrideRes = await pool.query(
            `select unlimited_until_utc as "UnlimitedUntilUtc"
             from firm_plan_overrides
             where firmid = $1
             limit 1`,
            [fid]
        );

        const overrideUnlimitedUntil = overrideRes.rows?.[0]?.UnlimitedUntilUtc || null;

        // Optional env-based temporary override for the default firm key (for first production firm).
        let envUnlimitedUntil = null;
        const envVal = String(process.env.FIRM_DEFAULT_UNLIMITED_UNTIL_UTC || '').trim();
        if (envVal) {
            const d = new Date(envVal);
            if (!Number.isNaN(d.getTime())) envUnlimitedUntil = d.toISOString();
        }

        let isUnlimited = false;
        const now = new Date();

        if (overrideUnlimitedUntil) {
            const d = new Date(overrideUnlimitedUntil);
            if (!Number.isNaN(d.getTime()) && d.getTime() > now.getTime()) isUnlimited = true;
        }

        if (!isUnlimited && envUnlimitedUntil) {
            // Apply only to the firm matching LAW_FIRM_KEY.
            const keyRes = await pool.query(`select firm_key as "FirmKey" from firms where firmid = $1 limit 1`, [fid]);
            const key = String(keyRes.rows?.[0]?.FirmKey || '');
            if (key && key === getDefaultFirmKey()) {
                const d = new Date(envUnlimitedUntil);
                if (!Number.isNaN(d.getTime()) && d.getTime() > now.getTime()) isUnlimited = true;
            }
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
                firmScope: true,
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
