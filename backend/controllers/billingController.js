const { getLimitsForFirm } = require('../lib/limits/getLimitsForFirm');
const { getUsageForFirm } = require('../lib/limits/getUsageForFirm');
const { enforcementMode } = require('../lib/limits/enforceFirmLimits');
const pool = require('../config/db');

exports.getCurrentPlan = async (req, res) => {
    try {
        const tenantId = Number(req.user?.UserId);
        if (!Number.isFinite(tenantId) || tenantId <= 0) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const limits = await getLimitsForFirm(null);
        if (!limits) {
            return res.status(404).json({ message: 'No plan found' });
        }
        return res.status(200).json({ ...limits, enforcementMode: enforcementMode() });
    } catch (e) {
        console.error('getCurrentPlan error:', e);
        return res.status(500).json({ message: 'Error getting plan' });
    }
};

exports.getCurrentUsage = async (req, res) => {
    try {
        const tenantId = Number(req.user?.UserId);
        if (!Number.isFinite(tenantId) || tenantId <= 0) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const usage = await getUsageForFirm(null);
        if (!usage) {
            return res.status(404).json({ message: 'No usage data' });
        }
        return res.status(200).json(usage);
    } catch (e) {
        console.error('getCurrentUsage error:', e);
        return res.status(500).json({ message: 'Error getting usage' });
    }
};

// Tenant-visible, read-only list of available plans + pricing.
exports.listPlans = async (req, res) => {
    try {
        const tenantId = Number(req.user?.UserId);
        if (!Number.isFinite(tenantId) || tenantId <= 0) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const result = await pool.query(
            `select
          plan_key as "planKey",
          name as "name",
          documents_retention_days as "documentsRetentionDays",
          documents_retention_days_core as "documentsRetentionDaysCore",
          documents_retention_days_pii as "documentsRetentionDaysPii",
          documents_monthly_quota as "documentsMonthlyQuota",
          storage_gb_quota as "storageGbQuota",
          otp_sms_monthly_quota as "otpSmsMonthlyQuota",
          evidence_generations_monthly_quota as "evidenceGenerationsMonthlyQuota",
          evidence_cpu_seconds_monthly_quota as "evidenceCpuSecondsMonthlyQuota",
          cases_quota as "casesQuota",
          clients_quota as "clientsQuota",
          users_quota as "usersQuota",
          feature_flags as "featureFlags",
          price_monthly_cents as "priceMonthlyCents",
          price_currency as "priceCurrency"
       from subscription_plans
       order by price_monthly_cents asc nulls last, plan_key asc`
        );

        return res.status(200).json({ plans: result.rows });
    } catch (e) {
        console.error('listPlans error:', e);
        return res.status(500).json({ message: 'Error listing plans' });
    }
};
