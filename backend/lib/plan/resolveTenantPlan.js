const pool = require('../../config/db');

const DEFAULT_PLAN_KEY = String(process.env.DEFAULT_PLAN_KEY || 'BASIC').toUpperCase();
const PLATFORM_MIN_DOCUMENT_RETENTION_DAYS = Number(
    process.env.PLATFORM_MIN_DOCUMENT_RETENTION_DAYS || '60'
);

function toPositiveIntOrNull(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const intVal = Math.floor(num);
    return intVal > 0 ? intVal : null;
}

async function resolveTenantPlan(tenantId) {
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum <= 0) {
        throw new Error('resolveTenantPlan: tenantId must be a positive number');
    }

    // Resolve plan assignment (tenant_subscriptions) and plan definition (subscription_plans).
    const res = await pool.query(
        `select
        ts.tenant_id as "TenantId",
        ts.plan_key as "PlanKey",
        ts.status as "Status",
        ts.starts_at as "StartsAt",
        ts.ends_at as "EndsAt",
        sp.name as "PlanName",
        sp.documents_retention_days as "DocumentsRetentionDays",
        sp.documents_retention_days_core as "DocumentsRetentionDaysCore",
        sp.documents_retention_days_pii as "DocumentsRetentionDaysPii",
        sp.documents_monthly_quota as "DocumentsMonthlyQuota",
        sp.storage_gb_quota as "StorageGbQuota",
        sp.cases_quota as "CasesQuota",
        sp.clients_quota as "ClientsQuota",
        sp.users_quota as "UsersQuota",
        sp.feature_flags as "FeatureFlags"
     from tenant_subscriptions ts
     join subscription_plans sp on sp.plan_key = ts.plan_key
     where ts.tenant_id = $1 and ts.status = 'active'
     limit 1`,
        [tenantIdNum]
    );

    let planKey = DEFAULT_PLAN_KEY;
    let planName = 'Default';
    let planRetentionLegacy = null;
    let planRetentionCore = null;
    let planRetentionPii = null;
    let featureFlags = {};
    let planStatus = 'active';
    let startsAt = null;
    let endsAt = null;
    let documentsMonthlyQuota = null;
    let storageGbQuota = null;
    let casesQuota = null;
    let clientsQuota = null;
    let usersQuota = null;

    if (res.rows.length > 0) {
        planKey = String(res.rows[0].PlanKey || planKey).toUpperCase();
        planName = res.rows[0].PlanName || planName;
        planRetentionLegacy = toPositiveIntOrNull(res.rows[0].DocumentsRetentionDays);
        planRetentionCore = toPositiveIntOrNull(res.rows[0].DocumentsRetentionDaysCore);
        planRetentionPii = toPositiveIntOrNull(res.rows[0].DocumentsRetentionDaysPii);

        planStatus = res.rows[0].Status || planStatus;
        startsAt = res.rows[0].StartsAt || null;
        endsAt = res.rows[0].EndsAt || null;

        documentsMonthlyQuota = toPositiveIntOrNull(res.rows[0].DocumentsMonthlyQuota);
        storageGbQuota = toPositiveIntOrNull(res.rows[0].StorageGbQuota);
        casesQuota = toPositiveIntOrNull(res.rows[0].CasesQuota);
        clientsQuota = toPositiveIntOrNull(res.rows[0].ClientsQuota);
        usersQuota = toPositiveIntOrNull(res.rows[0].UsersQuota);

        featureFlags = res.rows[0].FeatureFlags && typeof res.rows[0].FeatureFlags === 'object'
            ? res.rows[0].FeatureFlags
            : {};
    } else {
        // Fallback: read plan definition directly; if missing, keep defaults.
        const planRes = await pool.query(
            `select
          plan_key as "PlanKey",
          name as "PlanName",
          documents_retention_days as "DocumentsRetentionDays",
          documents_retention_days_core as "DocumentsRetentionDaysCore",
          documents_retention_days_pii as "DocumentsRetentionDaysPii",
          documents_monthly_quota as "DocumentsMonthlyQuota",
          storage_gb_quota as "StorageGbQuota",
          cases_quota as "CasesQuota",
          clients_quota as "ClientsQuota",
          users_quota as "UsersQuota",
          feature_flags as "FeatureFlags"
       from subscription_plans
       where plan_key = $1
       limit 1`,
            [planKey]
        );
        if (planRes.rows.length > 0) {
            planName = planRes.rows[0].PlanName || planName;
            planRetentionLegacy = toPositiveIntOrNull(planRes.rows[0].DocumentsRetentionDays);
            planRetentionCore = toPositiveIntOrNull(planRes.rows[0].DocumentsRetentionDaysCore);
            planRetentionPii = toPositiveIntOrNull(planRes.rows[0].DocumentsRetentionDaysPii);

            documentsMonthlyQuota = toPositiveIntOrNull(planRes.rows[0].DocumentsMonthlyQuota);
            storageGbQuota = toPositiveIntOrNull(planRes.rows[0].StorageGbQuota);
            casesQuota = toPositiveIntOrNull(planRes.rows[0].CasesQuota);
            clientsQuota = toPositiveIntOrNull(planRes.rows[0].ClientsQuota);
            usersQuota = toPositiveIntOrNull(planRes.rows[0].UsersQuota);

            featureFlags = planRes.rows[0].FeatureFlags && typeof planRes.rows[0].FeatureFlags === 'object'
                ? planRes.rows[0].FeatureFlags
                : {};
        }
    }

    const floor = toPositiveIntOrNull(PLATFORM_MIN_DOCUMENT_RETENTION_DAYS) ?? 60;

    const retentionCoreRaw = planRetentionCore ?? planRetentionLegacy ?? floor;
    const retentionPiiRaw = planRetentionPii ?? planRetentionLegacy ?? floor;

    const effectiveDocumentsRetentionDaysCore = Math.max(retentionCoreRaw, floor);
    const effectiveDocumentsRetentionDaysPii = Math.max(retentionPiiRaw, floor);

    return {
        tenantId: tenantIdNum,
        planKey,
        planName,
        status: planStatus,
        startsAt,
        endsAt,

        documentsRetentionDaysLegacy: planRetentionLegacy,
        documentsRetentionDaysCore: retentionCoreRaw,
        documentsRetentionDaysPii: retentionPiiRaw,
        effectiveDocumentsRetentionDaysCore,
        effectiveDocumentsRetentionDaysPii,

        quotas: {
            documentsMonthlyQuota,
            storageGbQuota,
            casesQuota,
            clientsQuota,
            usersQuota,
        },
        featureFlags,
        platformMinDocumentsRetentionDays: floor,
    };
}

module.exports = { resolveTenantPlan };
