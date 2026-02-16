const crypto = require('crypto');
const pool = require('../config/db');
const { requireInt } = require('../utils/paramValidation');
const { getLimitsForTenant } = require('../lib/limits/getLimitsForTenant');
const { getUsageForTenant } = require('../lib/limits/getUsageForTenant');

function toPositiveIntOrNull(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const i = Math.floor(n);
    return i > 0 ? i : null;
}

function normalizePlanKey(raw) {
    return String(raw || '').trim().toUpperCase();
}

exports.listPlans = async (req, res) => {
    try {
        const result = await pool.query(
            `select
          plan_key as "PlanKey",
          name as "Name",
          documents_retention_days as "DocumentsRetentionDays",
          documents_retention_days_core as "DocumentsRetentionDaysCore",
          documents_retention_days_pii as "DocumentsRetentionDaysPii",
          documents_monthly_quota as "DocumentsMonthlyQuota",
          storage_gb_quota as "StorageGbQuota",
          otp_sms_monthly_quota as "OtpSmsMonthlyQuota",
          evidence_generations_monthly_quota as "EvidenceGenerationsMonthlyQuota",
          evidence_cpu_seconds_monthly_quota as "EvidenceCpuSecondsMonthlyQuota",
          cases_quota as "CasesQuota",
          clients_quota as "ClientsQuota",
          users_quota as "UsersQuota",
          feature_flags as "FeatureFlags",
          price_monthly_cents as "PriceMonthlyCents",
          price_currency as "PriceCurrency",
          created_at as "CreatedAt",
          updated_at as "UpdatedAt"
       from subscription_plans
       order by plan_key asc`
        );

        return res.status(200).json({ plans: result.rows });
    } catch (e) {
        console.error('listPlans error:', e);
        return res.status(500).json({ message: 'Error listing plans' });
    }
};

exports.upsertPlan = async (req, res) => {
    const planKey = normalizePlanKey(req?.body?.plan_key ?? req?.body?.planKey);
    const name = String(req?.body?.name ?? '').trim();

    if (!planKey) return res.status(422).json({ message: 'plan_key is required' });
    if (!name) return res.status(422).json({ message: 'name is required' });

    const documentsRetentionDaysLegacy = toPositiveIntOrNull(req?.body?.documents_retention_days ?? req?.body?.documentsRetentionDays);
    const documentsRetentionDaysCore = toPositiveIntOrNull(req?.body?.documents_retention_days_core ?? req?.body?.documentsRetentionDaysCore);
    const documentsRetentionDaysPii = toPositiveIntOrNull(req?.body?.documents_retention_days_pii ?? req?.body?.documentsRetentionDaysPii);

    const documentsMonthlyQuota = toPositiveIntOrNull(req?.body?.documents_monthly_quota ?? req?.body?.documentsMonthlyQuota);
    const storageGbQuota = toPositiveIntOrNull(req?.body?.storage_gb_quota ?? req?.body?.storageGbQuota);
    const casesQuota = toPositiveIntOrNull(req?.body?.cases_quota ?? req?.body?.casesQuota);
    const clientsQuota = toPositiveIntOrNull(req?.body?.clients_quota ?? req?.body?.clientsQuota);
    const usersQuota = toPositiveIntOrNull(req?.body?.users_quota ?? req?.body?.usersQuota);

    const otpSmsMonthlyQuota = toPositiveIntOrNull(req?.body?.otp_sms_monthly_quota ?? req?.body?.otpSmsMonthlyQuota);
    const evidenceGenerationsMonthlyQuota = toPositiveIntOrNull(req?.body?.evidence_generations_monthly_quota ?? req?.body?.evidenceGenerationsMonthlyQuota);
    const evidenceCpuSecondsMonthlyQuota = toPositiveIntOrNull(req?.body?.evidence_cpu_seconds_monthly_quota ?? req?.body?.evidenceCpuSecondsMonthlyQuota);

    const priceMonthlyCents = req?.body?.price_monthly_cents ?? req?.body?.priceMonthlyCents;
    const priceCurrency = req?.body?.price_currency ?? req?.body?.priceCurrency;

    const featureFlags = req?.body?.feature_flags ?? req?.body?.featureFlags ?? {};
    if (featureFlags && typeof featureFlags !== 'object') {
        return res.status(422).json({ message: 'feature_flags must be an object' });
    }

    // Keep legacy column populated (NOT NULL) for backward compatibility.
    const effectiveLegacyRetention = documentsRetentionDaysLegacy
        ?? documentsRetentionDaysPii
        ?? documentsRetentionDaysCore;

    if (!effectiveLegacyRetention) {
        return res.status(422).json({ message: 'At least one retention field is required (documents_retention_days_core / _pii / legacy)' });
    }

    try {
        const result = await pool.query(
            `insert into subscription_plans(
          plan_key,
          name,
          documents_retention_days,
          documents_retention_days_core,
          documents_retention_days_pii,
          documents_monthly_quota,
          storage_gb_quota,
                    otp_sms_monthly_quota,
                    evidence_generations_monthly_quota,
                    evidence_cpu_seconds_monthly_quota,
          cases_quota,
          clients_quota,
          users_quota,
          feature_flags,
          price_monthly_cents,
          price_currency,
          created_at,
          updated_at
         ) values (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15, now(), now()
         )
       on conflict (plan_key) do update
       set name = excluded.name,
           documents_retention_days = excluded.documents_retention_days,
           documents_retention_days_core = excluded.documents_retention_days_core,
           documents_retention_days_pii = excluded.documents_retention_days_pii,
           documents_monthly_quota = excluded.documents_monthly_quota,
           storage_gb_quota = excluded.storage_gb_quota,
              otp_sms_monthly_quota = excluded.otp_sms_monthly_quota,
              evidence_generations_monthly_quota = excluded.evidence_generations_monthly_quota,
              evidence_cpu_seconds_monthly_quota = excluded.evidence_cpu_seconds_monthly_quota,
           cases_quota = excluded.cases_quota,
           clients_quota = excluded.clients_quota,
           users_quota = excluded.users_quota,
           feature_flags = excluded.feature_flags,
           price_monthly_cents = excluded.price_monthly_cents,
           price_currency = excluded.price_currency,
           updated_at = now()
       returning plan_key as "PlanKey"`,
            [
                planKey,
                name,
                effectiveLegacyRetention,
                documentsRetentionDaysCore ?? null,
                documentsRetentionDaysPii ?? null,
                documentsMonthlyQuota,
                storageGbQuota,
                otpSmsMonthlyQuota,
                evidenceGenerationsMonthlyQuota,
                evidenceCpuSecondsMonthlyQuota,
                casesQuota,
                clientsQuota,
                usersQuota,
                JSON.stringify(featureFlags || {}),
                priceMonthlyCents ?? null,
                priceCurrency ?? null,
            ]
        );

        return res.status(200).json({ ok: true, planKey: result.rows?.[0]?.PlanKey || planKey });
    } catch (e) {
        console.error('upsertPlan error:', e);
        return res.status(500).json({ message: 'Error upserting plan' });
    }
};

exports.assignTenantPlan = async (req, res) => {
    const tenantId = requireInt(req, res, { source: 'params', name: 'id' });
    if (tenantId === null) return;

    const planKey = normalizePlanKey(req?.body?.plan_key ?? req?.body?.planKey);
    if (!planKey) return res.status(422).json({ message: 'plan_key is required' });

    try {
        const planRes = await pool.query('select plan_key from subscription_plans where plan_key = $1 limit 1', [planKey]);
        if (planRes.rowCount === 0) return res.status(404).json({ message: 'Unknown plan_key' });

        await pool.query(
            `insert into tenant_subscriptions(tenant_id, plan_key, status, starts_at, ends_at, updated_at)
       values ($1, $2, 'active', now(), null, now())
       on conflict (tenant_id) do update
       set plan_key = excluded.plan_key,
           status = 'active',
           ends_at = null,
           starts_at = coalesce(tenant_subscriptions.starts_at, now()),
           updated_at = now()`,
            [tenantId, planKey]
        );

        return res.status(200).json({ tenantId, plan_key: planKey, status: 'active' });
    } catch (e) {
        console.error('assignTenantPlan error:', e);
        return res.status(500).json({ message: 'Error assigning tenant plan' });
    }
};

exports.getTenantUsage = async (req, res) => {
    const tenantId = requireInt(req, res, { source: 'params', name: 'id' });
    if (tenantId === null) return;

    try {
        const [limits, usage] = await Promise.all([
            getLimitsForTenant(tenantId),
            getUsageForTenant(tenantId),
        ]);

        return res.status(200).json({ tenantId, limits, usage });
    } catch (e) {
        console.error('getTenantUsage error:', e);
        return res.status(500).json({ message: 'Error getting tenant usage' });
    }
};

// Firm-scoped endpoints removed – architecture is one DB per firm.
// Tables (firms, firm_users, firm_subscriptions, firm_plan_overrides, firm_usage_events, firm_signing_policy)
// are no longer queried at runtime.

// Placeholder: schedule T-7 days deletion warnings in DB for future messaging.
// Default behavior: dry-run; only writes when RETENTION_WARNINGS_ALLOW_WRITE=true and execute=true.
exports.scheduleDeletionWarnings = async (req, res) => {
    const execute = String(req?.body?.execute ?? req?.query?.execute ?? 'false') === 'true';
    const allowWrite = String(process.env.RETENTION_WARNINGS_ALLOW_WRITE || 'false') === 'true';
    const dryRun = !(execute && allowWrite);

    const daysBefore = toPositiveIntOrNull(req?.body?.daysBefore ?? req?.query?.daysBefore) ?? 7;
    const maxDocs = toPositiveIntOrNull(req?.body?.maxDocs ?? req?.query?.maxDocs) ?? 500;

    try {
        // Find eligible signed files that are approaching retention expiry and have no warning row.
        // Uses current effective plan PII retention at query time (placeholder; not legal advice).
        const candidates = await pool.query(
            `with tenant_plan as (
          select
            ts.tenant_id,
            ts.plan_key,
            greatest(
              coalesce(sp.documents_retention_days_pii, sp.documents_retention_days, 60),
              $1::int
            ) as retention_days_pii
          from tenant_subscriptions ts
          join subscription_plans sp on sp.plan_key = ts.plan_key
          where ts.status = 'active'
      )
      select
        sf.signingfileid as "SigningFileId",
        sf.lawyerid as "TenantId",
        sf.signedat as "SignedAt",
        sf.createdat as "CreatedAt",
        tp.plan_key as "PlanKey",
        tp.retention_days_pii as "RetentionDaysPii",
        (coalesce(sf.signedat, sf.createdat) + make_interval(days => tp.retention_days_pii)) as "ExpiryAt",
        ((coalesce(sf.signedat, sf.createdat) + make_interval(days => tp.retention_days_pii)) - make_interval(days => $2::int)) as "WarnAt"
      from signingfiles sf
      join tenant_plan tp on tp.tenant_id = sf.lawyerid
      left join signing_retention_warnings w on w.signingfileid = sf.signingfileid
      where sf.status = 'signed'
        and sf.legalhold = false
        and sf.pendingdeleteatutc is null
        and w.warning_id is null
        and ((coalesce(sf.signedat, sf.createdat) + make_interval(days => tp.retention_days_pii)) - make_interval(days => $2::int)) <= now() + make_interval(days => $2::int)
      order by "WarnAt" asc
      limit $3`,
            [
                Number(process.env.PLATFORM_MIN_DOCUMENT_RETENTION_DAYS || '60'),
                daysBefore,
                maxDocs,
            ]
        );

        const rows = candidates.rows || [];

        if (!dryRun && rows.length > 0) {
            for (const r of rows) {
                await pool.query(
                    `insert into signing_retention_warnings(warning_id, tenant_id, signingfileid, warn_at_utc, status, metadata)
           values ($1, $2, $3, $4, 'scheduled', $5::jsonb)
           on conflict (signingfileid) do nothing`,
                    [
                        crypto.randomUUID(),
                        r.TenantId,
                        r.SigningFileId,
                        r.WarnAt,
                        JSON.stringify({ planKey: r.PlanKey, retentionDaysPii: r.RetentionDaysPii, daysBefore }),
                    ]
                );
            }
        }

        return res.status(200).json({
            dryRun,
            executeRequested: execute,
            allowWrite,
            scheduledCount: dryRun ? 0 : rows.length,
            candidatesCount: rows.length,
            daysBefore,
            maxDocs,
            candidates: rows,
        });
    } catch (e) {
        console.error('scheduleDeletionWarnings error:', e);
        return res.status(500).json({ message: 'Error scheduling deletion warnings' });
    }
};
