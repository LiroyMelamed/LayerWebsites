const crypto = require('node:crypto');
const pool = require('../../config/db');
const { encryptSecret, decryptSecret } = require('./secrets');
const {
    resolvePricingLineItems,
    quotasForPackage,
    evaluatePackageChange,
    disabledOptionsForUsage,
    DEFAULT_SELECTION,
    normalizeBillingInterval,
    yearlyTotalIls,
} = require('./pricingPackage');
const {
    getTenantSlug,
    defaultComplimentaryUntil,
    defaultBillingEnabled,
    isDateInFuture,
    computeFlags,
    addCalendarMonth,
    addCalendarYear,
    getPublicApiBaseUrl,
    getFrontendBaseUrl,
} = require('./tenantBillingDefaults');
const {
    createTakbullPaymentPage,
    validateTakbullNotification,
    chargeTakbullToken,
    getTakbullCredentialsFromEnv,
    getTakbullMode,
    resolveSetupAmountIls,
    extractTokenFromValidated,
} = require('../payments/takbullClient');
const { sendFailedPaymentEmails } = require('./billingEmails');
const { getCurrentTenantId } = require('../tenant/tenantContext');

let chargeTakbullTokenFn = chargeTakbullToken;

function setChargeTakbullTokenForTests(fn) {
    chargeTakbullTokenFn = fn || chargeTakbullToken;
}

const GRACE_MS = 72 * 60 * 60 * 1000;
const SETUP_AMOUNT_ILS = resolveSetupAmountIls();
const RETRY_GAP_MS = 12 * 60 * 60 * 1000;
const UPGRADE_RECOVERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let chargeProviderCallCount = 0;

function resetChargeProviderCallCountForTests() {
    chargeProviderCallCount = 0;
}

function getChargeProviderCallCountForTests() {
    return chargeProviderCallCount;
}

function isRelationMissingError(e) {
    return e?.code === '42P01' || String(e?.message || '').includes('does not exist');
}

function mapBillingRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        platformId: row.platform_id,
        resourceId: row.resource_id,
        signingId: row.signing_id,
        priceMonthlyIls: Number(row.price_monthly_ils || 0),
        billingInterval: normalizeBillingInterval(row.billing_interval),
        status: row.status,
        billingEnabled: row.billing_enabled !== false,
        autoRenew: row.auto_renew !== false,
        complimentaryUntil: row.complimentary_until,
        renewsAt: row.renews_at,
        graceUntil: row.grace_until,
        lastPaymentError: row.last_payment_error,
        lastFailedAt: row.last_failed_at,
        lastPaidAt: row.last_paid_at,
        updatedAt: row.updated_at,
    };
}

function billingScopeSql(paramOffset = 0) {
    const tenantId = getCurrentTenantId();
    if (tenantId) {
        return {
            clause: `law_firm_tenant_id = $${paramOffset + 1}`,
            param: tenantId,
        };
    }
    return { clause: 'id = 1', param: null };
}

async function getBillingRow() {
    try {
        const scope = billingScopeSql();
        const params = scope.param != null ? [scope.param] : [];
        const res = await pool.query(
            `SELECT * FROM firm_billing WHERE ${scope.clause} LIMIT 1`,
            params
        );
        return mapBillingRow(res.rows?.[0] || null);
    } catch (e) {
        if (isRelationMissingError(e)) return null;
        throw e;
    }
}

async function ensureBillingRow() {
    const existing = await getBillingRow();
    if (existing) return existing;

    const slug = getTenantSlug();
    const tenantId = getCurrentTenantId();
    const complimentaryUntil = defaultComplimentaryUntil(slug);
    const billingEnabled = defaultBillingEnabled(slug);
    const pkg = resolvePricingLineItems(DEFAULT_SELECTION);
    const status = billingEnabled && !isDateInFuture(complimentaryUntil) ? 'active' : 'complimentary';
    const renewsAt = complimentaryUntil || addCalendarMonth(new Date());

    try {
        if (tenantId) {
            await pool.query(
                `INSERT INTO firm_billing (
                    platform_id, resource_id, signing_id, price_monthly_ils,
                    status, billing_enabled, complimentary_until, renews_at, law_firm_tenant_id
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT DO NOTHING`,
                [
                    pkg.platformId,
                    pkg.resourceId,
                    pkg.signingId,
                    pkg.total,
                    status,
                    billingEnabled,
                    complimentaryUntil,
                    renewsAt,
                    tenantId,
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO firm_billing (
                    id, platform_id, resource_id, signing_id, price_monthly_ils,
                    status, billing_enabled, complimentary_until, renews_at
                 ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (id) DO NOTHING`,
                [
                    pkg.platformId,
                    pkg.resourceId,
                    pkg.signingId,
                    pkg.total,
                    status,
                    billingEnabled,
                    complimentaryUntil,
                    renewsAt,
                ]
            );
        }
    } catch (e) {
        if (isRelationMissingError(e)) return null;
        throw e;
    }
    return getBillingRow();
}

async function updateBilling(fields) {
    const sets = [];
    const vals = [];
    let i = 1;
    for (const [col, val] of Object.entries(fields)) {
        sets.push(`${col} = $${i++}`);
        vals.push(val);
    }
    sets.push('updated_at = now()');
    const scope = billingScopeSql(vals.length);
    const allParams = scope.param != null ? [...vals, scope.param] : vals;
    await pool.query(
        `UPDATE firm_billing SET ${sets.join(', ')} WHERE ${scope.clause}`,
        allParams
    );
    return getBillingRow();
}

async function getActiveCard() {
    try {
        const tenantId = getCurrentTenantId();
        const res = tenantId
            ? await pool.query(
                `SELECT id, last4, exp_month, exp_year, card_brand, token_encrypted, is_active
                 FROM firm_payment_methods
                 WHERE is_active = true AND law_firm_tenant_id = $1
                 ORDER BY updated_at DESC
                 LIMIT 1`,
                [tenantId]
            )
            : await pool.query(
                `SELECT id, last4, exp_month, exp_year, card_brand, token_encrypted, is_active
                 FROM firm_payment_methods
                 WHERE is_active = true AND law_firm_tenant_id IS NULL
                 ORDER BY updated_at DESC
                 LIMIT 1`
            );
        const row = res.rows?.[0];
        if (!row) return null;
        return {
            id: row.id,
            last4: row.last4,
            expMonth: row.exp_month,
            expYear: row.exp_year,
            cardBrand: row.card_brand,
            tokenEncrypted: row.token_encrypted,
        };
    } catch (e) {
        if (isRelationMissingError(e)) return null;
        throw e;
    }
}

async function saveCardFromToken(tokenInfo, database = pool) {
    if (!tokenInfo?.token) return null;
    const encrypted = encryptSecret(tokenInfo.token);
    const tenantId = getCurrentTenantId();
    if (tenantId) {
        await database.query(
            `UPDATE firm_payment_methods SET is_active = false, updated_at = now()
             WHERE is_active = true AND law_firm_tenant_id = $1`,
            [tenantId]
        );
        const res = await database.query(
            `INSERT INTO firm_payment_methods (provider, token_encrypted, last4, exp_month, exp_year, card_brand, is_active, law_firm_tenant_id)
             VALUES ('takbull', $1, $2, $3, $4, $5, true, $6)
             RETURNING id, last4, exp_month, exp_year, card_brand`,
            [
                encrypted,
                tokenInfo.last4Digits || tokenInfo.last4 || null,
                tokenInfo.expMonth || null,
                tokenInfo.expYear || null,
                tokenInfo.cardBrand || null,
                tenantId,
            ]
        );
        return res.rows[0];
    }
    await database.query(`UPDATE firm_payment_methods SET is_active = false, updated_at = now() WHERE is_active = true AND law_firm_tenant_id IS NULL`);
    const res = await database.query(
        `INSERT INTO firm_payment_methods (provider, token_encrypted, last4, exp_month, exp_year, card_brand, is_active)
         VALUES ('takbull', $1, $2, $3, $4, $5, true)
         RETURNING id, last4, exp_month, exp_year, card_brand`,
        [
            encrypted,
            tokenInfo.last4Digits || tokenInfo.last4 || null,
            tokenInfo.expMonth || null,
            tokenInfo.expYear || null,
            tokenInfo.cardBrand || null,
        ]
    );
    return res.rows[0];
}

function publicCard(card) {
    if (!card) return null;
    return {
        last4: card.last4,
        expMonth: card.expMonth || card.exp_month,
        expYear: card.expYear || card.exp_year,
        cardBrand: card.cardBrand || card.card_brand,
    };
}

async function expireGraceIfNeeded(row, now = new Date()) {
    const flags = computeFlags(row, now);
    if (flags.stillComplimentary) {
        if (row.status === 'past_due' || row.status === 'suspended' || row.graceUntil) {
            return updateBilling({
                status: 'complimentary',
                grace_until: null,
                last_failed_at: null,
            });
        }
        return row;
    }
    if (row.status === 'complimentary') {
        const renewsAt = row.renewsAt || row.complimentaryUntil || now;
        return updateBilling({ status: 'active', renews_at: renewsAt });
    }
    if (flags.graceExpired && row.status !== 'suspended') {
        return updateBilling({ status: 'suspended' });
    }
    return row;
}

async function listPaymentHistory(limit = 25) {
    try {
        const res = await pool.query(
            `SELECT id, kind, status, amount_ils, currency, purpose, error_message,
                    created_at, settled_at, takbull_transaction_id
             FROM firm_payment_intents
             WHERE law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid
             ORDER BY created_at DESC
             LIMIT $1`,
            [Math.min(Math.max(Number(limit) || 25, 1), 100),getCurrentTenantId()]
        );
        return (res.rows || []).map((row) => ({
            id: row.id,
            kind: row.kind,
            status: row.status,
            amountIls: Number(row.amount_ils || 0),
            currency: row.currency || 'ILS',
            purpose: row.purpose,
            errorMessage: row.error_message,
            createdAt: row.created_at,
            settledAt: row.settled_at,
            transactionId: row.takbull_transaction_id,
        }));
    } catch (e) {
        if (isRelationMissingError(e)) return [];
        throw e;
    }
}

async function getBillingSnapshot() {
    let row = await ensureBillingRow();
    if (!row) {
        return {
            available: false,
            locked: false,
            stillComplimentary: true,
            billingEnabled: false,
            package: resolvePricingLineItems(DEFAULT_SELECTION),
            quotas: quotasForPackage(DEFAULT_SELECTION),
            card: null,
            payments: [],
            upcomingPayment: null,
        };
    }
    row = await expireGraceIfNeeded(row);
    const flags = computeFlags(row);
    const pkg = resolvePricingLineItems({
        platformId: row.platformId,
        resourceId: row.resourceId,
        signingId: row.signingId,
    });
    const quotas = quotasForPackage(pkg);
    const card = publicCard(await getActiveCard());
    const payments = await listPaymentHistory();
    const billingInterval = normalizeBillingInterval(row.billingInterval);
    const agreedMonthly = getCurrentTenantId() ? row.priceMonthlyIls : pkg.total;
    const priceYearlyIls = yearlyTotalIls(agreedMonthly);
    let nextChargeIls = billingInterval === 'yearly' ? priceYearlyIls : Number(agreedMonthly || 0);
    let signupPriceIsFinal = false;
    if (getCurrentTenantId()) {
        const agreement = (await pool.query(
            "SELECT consent_version,recurring_amount_ils FROM signup_intents WHERE law_firm_tenant_id=$1 AND status='completed' AND consent_version='signup-1ils-3months-v2'",
            [getCurrentTenantId()]
        )).rows[0];
        if (agreement) {
            nextChargeIls = require('./signupQuote').renewalAmount({ price_monthly_ils: agreedMonthly, billing_interval: billingInterval }, agreement);
            signupPriceIsFinal = true;
        }
    }
    const upcomingPayment = row.autoRenew !== false && row.renewsAt
        ? {
            id: 'upcoming',
            kind: 'upcoming',
            status: 'scheduled',
            amountIls: nextChargeIls,
            currency: 'ILS',
            purpose: flags.stillComplimentary
                ? (billingInterval === 'yearly'
                    ? 'חיוב שנתי ראשון אחרי תקופת ההמתנה'
                    : 'חיוב חודשי ראשון אחרי תקופת ההמתנה')
                : (billingInterval === 'yearly' ? 'חיוב שנתי הבא' : 'חיוב חודשי הבא'),
            createdAt: row.renewsAt,
            settledAt: null,
            errorMessage: null,
        }
        : null;

    return {
        available: true,
        ...row,
        ...flags,
        isUnlimited: flags.stillComplimentary,
        package: pkg,
        quotas,
        card,
        payments,
        upcomingPayment,
        priceMonthlyIls: agreedMonthly,
        priceYearlyIls,
        billingInterval,
        nextChargeIls,
        signupPriceIsFinal,
        setupCheckoutAmountIls: resolveSetupAmountIls(),
        takbullMode: getTakbullMode(),
        payUrl: `${getFrontendBaseUrl()}/AdminStack/PlanUsage`,
    };
}

async function syncTenantSubscription(pkg) {
    const quotas = quotasForPackage(pkg);
    try {
        await pool.query(
            `INSERT INTO tenant_subscriptions (tenant_id, plan_key, status, starts_at, updated_at, created_at)
             SELECT u.userid, $1, 'active', now(), now(), now()
             FROM users u
             WHERE u.role = 'Admin' AND u.law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid
             ORDER BY u.userid
             LIMIT 1
             ON CONFLICT (tenant_id) DO UPDATE
             SET plan_key = EXCLUDED.plan_key, status = 'active', updated_at = now()`,
            [quotas.planKey, getCurrentTenantId()]
        );
    } catch (e) {
        if (!isRelationMissingError(e)) {
            console.warn('[billing] sync tenant_subscriptions failed:', e?.message);
        }
    }
}

async function recordEvent(intentId, eventType, payload) {
    try {
        await pool.query(
            `INSERT INTO firm_payment_events (intent_id, event_type, payload) VALUES ($1, $2, $3::jsonb)`,
            [intentId || null, eventType, JSON.stringify(payload || {})]
        );
    } catch (e) {
        console.warn('[billing] recordEvent failed:', e?.message);
    }
}

function ipnAddress() {
    return `${getPublicApiBaseUrl()}/api/webhooks/payments/takbull`;
}

function returnAddress() {
    return `${getPublicApiBaseUrl()}/api/billing/takbull/return`;
}

function cancelAddress() {
    return `${getPublicApiBaseUrl()}/api/billing/takbull/cancel`;
}

async function createIntent({ kind, amountIls, purpose, packageSnapshot }, dbClient) {
    const id = crypto.randomUUID();
    const orderReference = `lw-${kind}-${id.replace(/-/g, '').slice(0, 18)}`;
    const q = dbClient?.query?.bind(dbClient) || pool.query.bind(pool);
    const res = await q(
        `INSERT INTO firm_payment_intents (
            id, kind, status, amount_ils, currency, order_reference, purpose, package_snapshot, law_firm_tenant_id
         ) VALUES ($1, $2, 'pending', $3, 'ILS', $4, $5, $6::jsonb, $7)
         RETURNING *`,
        [id, kind, amountIls, orderReference, purpose || null, JSON.stringify(packageSnapshot || {}), getCurrentTenantId()]
    );
    return res.rows[0];
}

function buildUpgradeOperationKey({
    tenantId,
    platformId,
    resourceId,
    signingId,
    billingInterval,
    amountIls,
}) {
    return [
        tenantId != null ? String(tenantId) : 'legacy',
        platformId,
        resourceId,
        signingId,
        normalizeBillingInterval(billingInterval),
        Number(amountIls).toFixed(2),
    ].join('|');
}

function upgradePackageSnapshot({ targetPackage, interval, operationKey }) {
    return {
        platformId: targetPackage.platformId,
        resourceId: targetPackage.resourceId,
        signingId: targetPackage.signingId,
        billingInterval: normalizeBillingInterval(interval),
        upgradeOperationKey: operationKey,
    };
}

function billingRowMatchesPackage(row, target) {
    if (!row || !target) return false;
    return row.platformId === target.platformId
        && row.resourceId === target.resourceId
        && row.signingId === target.signingId;
}

function upgradeAdvisoryLockKey(operationKey) {
    return crypto.createHash('sha256').update(`lw-upgrade:${operationKey}`).digest().readInt32BE(0);
}

async function withUpgradeOperationLock(operationKey, fn) {
    const client = await pool.connect();
    const lockKey = upgradeAdvisoryLockKey(operationKey);
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

async function findSucceededUnappliedUpgradeIntent(operationKey, dbClient) {
    const q = dbClient?.query?.bind(dbClient) || pool.query.bind(pool);
    const res = await q(
        `SELECT * FROM firm_payment_intents
         WHERE status = 'succeeded'
           AND kind IN ('upgrade', 'annual')
           AND package_snapshot->>'upgradeOperationKey' = $1
           AND created_at >= $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [operationKey, new Date(Date.now() - UPGRADE_RECOVERY_MAX_AGE_MS)]
    );
    const intent = res.rows?.[0];
    if (!intent) return null;
    const target = parseIntentPackageSnapshot(intent.package_snapshot);
    if (!target) return null;
    const row = await getBillingRow();
    if (billingRowMatchesPackage(row, target)) return null;
    return intent;
}

async function findPendingUpgradeIntentForUpdate(operationKey, dbClient) {
    const q = dbClient?.query?.bind(dbClient) || pool.query.bind(pool);
    const res = await q(
        `SELECT * FROM firm_payment_intents
         WHERE status = 'pending'
           AND kind IN ('upgrade', 'annual')
           AND package_snapshot->>'upgradeOperationKey' = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [operationKey]
    );
    return res.rows?.[0] || null;
}

async function recoverPaidUpgradeIntent(intent, logContext = {}) {
    const target = parseIntentPackageSnapshot(intent?.package_snapshot);
    console.error('[billing] UPGRADE_PACKAGE_RECOVERED', {
        code: 'UPGRADE_PACKAGE_RECOVERED',
        intentId: intent?.id || null,
        orderReference: intent?.order_reference || null,
        transactionId: intent?.takbull_transaction_id || null,
        platformId: target?.platformId || null,
        resourceId: target?.resourceId || null,
        signingId: target?.signingId || null,
        upgradeOperationKey: logContext.upgradeOperationKey || null,
    });
    await applyIntentPackageSnapshot(intent);
    const row = await ensureBillingRow();
    const flags = computeFlags(row);
    await updateBilling({
        status: flags.stillComplimentary ? 'complimentary' : 'active',
        grace_until: null,
        last_payment_error: null,
        last_failed_at: null,
        last_paid_at: intent?.settled_at || new Date(),
    });
    await recordEvent(intent.id, 'upgrade_package_recovered', {});
    return {
        ok: true,
        recovered: true,
        charged: false,
        intentId: intent.id,
        snapshot: await getBillingSnapshot(),
    };
}

async function findIntentByUniqId(uniqId) {
    if (!uniqId) return null;
    const res = await pool.query(
        `SELECT * FROM firm_payment_intents WHERE takbull_uniq_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [uniqId]
    );
    return res.rows[0] || null;
}

async function findIntentByOrderReference(orderReference) {
    if (!orderReference) return null;
    const res = await pool.query(
        `SELECT * FROM firm_payment_intents WHERE order_reference = $1 LIMIT 1`,
        [orderReference]
    );
    return res.rows[0] || null;
}

async function findIntentById(id) {
    if (!id) return null;
    const res = await pool.query(`SELECT * FROM firm_payment_intents WHERE id = $1 LIMIT 1`, [id]);
    return res.rows[0] || null;
}

async function markPaymentFailed({ intent, errorMessage, skipEmail } = {}) {
    const row = await ensureBillingRow();
    const now = new Date();
    const alreadyPastDue = row.status === 'past_due' || row.status === 'suspended';
    const graceUntil = alreadyPastDue && row.graceUntil
        ? row.graceUntil
        : new Date(now.getTime() + GRACE_MS);

    if (intent?.id) {
        await pool.query(
            `UPDATE firm_payment_intents
             SET status = 'failed', error_message = $2, updated_at = now()
             WHERE id = $1 AND status = 'pending'`,
            [intent.id, String(errorMessage || 'payment_failed').slice(0, 500)]
        );
        await recordEvent(intent.id, 'payment_failed', { errorMessage });
    }

    const flags = computeFlags(row, now);
    const setupIntent = String(intent?.kind || '') === 'setup';
    if (!flags.billingEnabled || flags.stillComplimentary || setupIntent) {
        await updateBilling({ last_payment_error: String(errorMessage || '').slice(0, 500) });
        return getBillingSnapshot();
    }

    const nextStatus = row.status === 'suspended' ? 'suspended' : 'past_due';
    await updateBilling({
        status: nextStatus,
        grace_until: graceUntil,
        last_failed_at: now,
        last_payment_error: String(errorMessage || '').slice(0, 500),
    });

    // Notify once when entering past_due — not on every scheduler retry.
    if (!skipEmail && !alreadyPastDue) {
        const card = await getActiveCard();
        try {
            await sendFailedPaymentEmails({
                amountIls: intent ? Number(intent.amount_ils) : row.priceMonthlyIls,
                last4: card?.last4,
                graceUntil,
                errorMessage,
            });
        } catch (e) {
            console.error('[billing] failed payment email error:', e?.message);
        }
    }

    return getBillingSnapshot();
}

function parseIntentPackageSnapshot(raw) {
    if (!raw) return null;
    let snap = raw;
    if (typeof snap === 'string') {
        try {
            snap = JSON.parse(snap);
        } catch {
            return null;
        }
    }
    if (!snap || typeof snap !== 'object') return null;
    const platformId = snap.platformId || snap.platform_id;
    const resourceId = snap.resourceId || snap.resource_id;
    const signingId = snap.signingId || snap.signing_id;
    if (!platformId || !resourceId || !signingId) return null;
    return { platformId, resourceId, signingId, billingInterval: snap.billingInterval };
}

async function applyIntentPackageSnapshot(intent) {
    const pending = parseIntentPackageSnapshot(intent?.package_snapshot);
    if (!pending) return false;
    const priced = resolvePricingLineItems(pending);
    const api = module.exports;
    await api.updateBilling({
        platform_id: pending.platformId,
        resource_id: pending.resourceId,
        signing_id: pending.signingId,
        price_monthly_ils: priced.total,
        billing_interval: normalizeBillingInterval(pending.billingInterval),
    });
    await api.syncTenantSubscription(priced);
    return true;
}

async function hasSelfServiceAgreement() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return false;
    return (await pool.query(`SELECT 1 FROM signup_intents WHERE law_firm_tenant_id=$1 AND status='completed'
        AND consent_version IN ('signup-1ils-3months-v1','signup-1ils-3months-v2') LIMIT 1`, [tenantId])).rowCount > 0;
}

async function settleSuccessfulPayment({ intent, tokenInfo, transactionId } = {}) {
    if (intent?.signup_intent_id) {
        if (intent?.id) {
            await pool.query(
                `UPDATE firm_payment_intents
                 SET status = 'succeeded',
                     takbull_transaction_id = COALESCE($2, takbull_transaction_id),
                     settled_at = now(),
                     updated_at = now(),
                     error_message = NULL
                 WHERE id = $1`,
                [intent.id, transactionId || null]
            );
        }
        const { completeSignupFromPaymentIntent } = require('../tenant/signupService');
        const provisioned = await completeSignupFromPaymentIntent(intent.id, tokenInfo);
        return { signup: true, provisioned };
    }

    // A card-verification fee is never payment for an overdue subscription.
    // Save the replacement card and receipt atomically, without changing access,
    // grace, the agreed price, the renewal date or other unresolved payments.
    if (intent?.kind === 'setup' && await hasSelfServiceAgreement()) {
        if (Number(intent.amount_ils) !== 1 || !tokenInfo?.token || !encryptSecret(tokenInfo.token).startsWith('enc:v1:')) {
            throw new Error('CARD_VERIFICATION_REQUIRED');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT id FROM firm_billing WHERE law_firm_tenant_id=$1 FOR UPDATE', [getCurrentTenantId()]);
            const existing = (await client.query('SELECT status FROM firm_payment_intents WHERE id=$1 FOR UPDATE', [intent.id])).rows[0];
            if (!existing) throw new Error('PAYMENT_NOT_FOUND');
            if (existing.status !== 'succeeded') {
                await saveCardFromToken(tokenInfo, client);
                await client.query(`UPDATE firm_payment_intents SET status='succeeded',takbull_transaction_id=$2,
                    settled_at=now(),updated_at=now(),error_message=null WHERE id=$1`, [intent.id, transactionId]);
                await client.query(`INSERT INTO firm_payment_events(intent_id,event_type,payload)
                    VALUES($1,'card_verified','{}'::jsonb)`, [intent.id]);
            }
            await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
        return getBillingSnapshot();
    }

    if (intent?.id) {
        const updated = await pool.query(
            `UPDATE firm_payment_intents
             SET status = 'succeeded',
                 takbull_transaction_id = COALESCE($2, takbull_transaction_id),
                 settled_at = now(),
                 updated_at = now(),
                 error_message = NULL
             WHERE id = $1 AND status <> 'succeeded'
             RETURNING id`,
            [intent.id, transactionId || null]
        );
        if (updated.rowCount === 0) {
            return getBillingSnapshot();
        }
        await recordEvent(intent.id, 'payment_succeeded', { transactionId: transactionId || null });
        await pool.query(
            `UPDATE firm_payment_intents
             SET status = 'cancelled', updated_at = now()
             WHERE status = 'pending' AND id <> $1
               AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid
               AND signup_intent_id IS NULL AND signup_cycle_at IS NULL`,
            [intent.id, getCurrentTenantId()]
        );
    }

    if (tokenInfo?.token) {
        try {
            await saveCardFromToken(tokenInfo);
        } catch (e) {
            console.error('[billing] save card failed:', e?.message);
        }
    }

    await applyIntentPackageSnapshot(intent);

    const row = await ensureBillingRow();
    const pkg = resolvePricingLineItems({
        platformId: row.platformId,
        resourceId: row.resourceId,
        signingId: row.signingId,
    });
    const flags = computeFlags(row);
    const interval = normalizeBillingInterval(
        intent?.kind === 'annual' ? 'yearly' : row.billingInterval
    );
    const paidAnnual = Boolean(
        intent && (intent.kind === 'annual' || (interval === 'yearly' && intent.kind !== 'setup'))
    );
    let renewsAt;
    if (paidAnnual) {
        const times = [Date.now()];
        if (row.renewsAt) times.push(new Date(row.renewsAt).getTime());
        if (row.complimentaryUntil) times.push(new Date(row.complimentaryUntil).getTime());
        const start = new Date(Math.max(...times.filter((n) => Number.isFinite(n))));
        renewsAt = addCalendarYear(start);
    } else if (flags.stillComplimentary) {
        renewsAt = row.complimentaryUntil || addCalendarMonth(new Date());
    } else {
        renewsAt = addCalendarMonth(new Date());
    }

    await updateBilling({
        status: flags.stillComplimentary ? 'complimentary' : 'active',
        billing_interval: interval,
        grace_until: null,
        last_payment_error: null,
        last_failed_at: null,
        last_paid_at: new Date(),
        renews_at: renewsAt,
        price_monthly_ils: pkg.total,
    });

    return getBillingSnapshot();
}

async function createCheckout({ kind, customer, pendingPackage } = {}) {
    const creds = getTakbullCredentialsFromEnv();
    if (!creds) {
        const err = new Error('סליקת Takbull לא הוגדרה');
        err.code = 'TAKBULL_NOT_CONFIGURED';
        throw err;
    }

    const snap = await getBillingSnapshot();
    const interval = normalizeBillingInterval(
        pendingPackage?.billingInterval
            || (kind === 'annual' ? 'yearly' : snap.billingInterval)
    );
    const pendingSelection = pendingPackage?.platformId
        ? {
            platformId: pendingPackage.platformId,
            resourceId: pendingPackage.resourceId,
            signingId: pendingPackage.signingId,
        }
        : null;
    const pricedPending = pendingSelection
        ? resolvePricingLineItems(pendingSelection)
        : null;
    let isSetup = !pendingSelection && (kind === 'setup' || (snap.stillComplimentary && kind !== 'annual'));
    const amount = pendingSelection
        ? (interval === 'yearly' ? yearlyTotalIls(pricedPending.total) : pricedPending.total)
        : (isSetup
            ? SETUP_AMOUNT_ILS
            : (interval === 'yearly' ? Number(snap.priceYearlyIls || 0) : Number(snap.priceMonthlyIls ?? snap.package.total ?? 0)));
    if (!isSetup && amount <= 0) {
        const err = new Error('אין סכום לחיוב');
        err.code = 'NO_AMOUNT';
        throw err;
    }

    const intentKind = isSetup ? 'setup' : (kind === 'annual' ? 'annual' : (kind === 'retry' ? 'retry' : 'renewal'));
    const purpose = isSetup
        ? 'אימות כרטיס אשראי — מנוי מערכת'
        : (interval === 'yearly' ? 'מנוי שנתי — מערכת עורכי דין (10% הנחה)' : 'מנוי חודשי — מערכת עורכי דין');
    const checkoutIntent = {
        kind: intentKind,
        amountIls: amount,
        purpose,
        packageSnapshot: pendingSelection
            ? { ...pricedPending, billingInterval: interval }
            : { ...snap.package, billingInterval: interval },
    };
    let intent;
    if (!isSetup && await hasSelfServiceAgreement()) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT id FROM firm_billing WHERE law_firm_tenant_id=$1 FOR UPDATE', [getCurrentTenantId()]);
            const unresolved = await client.query(`SELECT id FROM firm_payment_intents WHERE law_firm_tenant_id=$1
                AND status='pending' AND kind<>'setup' AND signup_intent_id IS NULL LIMIT 1`, [getCurrentTenantId()]);
            if (unresolved.rowCount) throw Object.assign(new Error('תשלום קודם עדיין בבדיקה. אין לשלם שוב עד לבירור.'), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
            intent = await createIntent(checkoutIntent, client);
            await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    } else intent = await createIntent(checkoutIntent);

    const page = await createTakbullPaymentPage({
        credentials: creds,
        orderReference: intent.order_reference,
        amount,
        currency: 'ILS',
        redirectAddress: `${returnAddress()}?intentId=${encodeURIComponent(intent.id)}`,
        cancelReturnAddress: `${cancelAddress()}?intentId=${encodeURIComponent(intent.id)}`,
        ipnAddress: ipnAddress(),
        purpose,
        saveToken: true,
        customerFullName: customer?.name || null,
        customerPhone: customer?.phone || null,
        customerEmail: customer?.email || null,
    });

    await pool.query(
        `UPDATE firm_payment_intents SET takbull_uniq_id = $2, updated_at = now() WHERE id = $1`,
        [intent.id, page.uniqId]
    );
    await recordEvent(intent.id, 'checkout_created', { uniqId: page.uniqId, amount });

    return {
        intentId: intent.id,
        uniqId: page.uniqId,
        redirectUrl: page.redirectUrl,
        amount,
        kind: intentKind,
    };
}

async function chargeSavedCard({ kind, amountOverride, skipEmail, upgradeOperation, automatic = false } = {}) {
    if (getCurrentTenantId() && !upgradeOperation?.targetPackage) {
        const result=await require('./selfServiceRenewal').signupRenewal.renew(getCurrentTenantId(), { retryFailed: !automatic && kind === 'retry' });
        if(result.handled)return {ok:result.status==='succeeded',...result,snapshot:await getBillingSnapshot()};
    }
    if (upgradeOperation?.targetPackage) {
        return chargeSavedCardForPackageUpgrade({
            kind,
            amountOverride,
            skipEmail,
            upgradeOperation,
        });
    }

    const creds = getTakbullCredentialsFromEnv();
    const snap = await getBillingSnapshot();
    const card = await getActiveCard();

    if (!snap.billingEnabled) {
        return { skipped: true, reason: 'billing_disabled', snapshot: snap };
    }
    if (snap.stillComplimentary && kind !== 'setup' && kind !== 'annual') {
        return { skipped: true, reason: 'complimentary', snapshot: snap };
    }
    if (!creds) {
        return markPaymentFailed({ errorMessage: 'סליקת Takbull לא הוגדרה', skipEmail });
    }
    if (!card?.tokenEncrypted) {
        return markPaymentFailed({ errorMessage: 'לא שמור כרטיס אשראי', skipEmail });
    }

    const interval = normalizeBillingInterval(
        kind === 'annual' ? 'yearly' : snap.billingInterval
    );
    const amount = Number(
        amountOverride != null
            ? amountOverride
            : (interval === 'yearly' ? snap.priceYearlyIls : snap.package.total || 0)
    );
    if (amount <= 0) {
        return { skipped: true, reason: 'zero_amount', snapshot: snap };
    }

    let token;
    try {
        token = decryptSecret(card.tokenEncrypted);
    } catch (e) {
        return markPaymentFailed({ errorMessage: 'לא ניתן לפענח את הכרטיס השמור', skipEmail });
    }

    const intent = await createIntent({
        kind: kind === 'annual' ? 'annual' : (kind || 'renewal'),
        amountIls: amount,
        purpose: interval === 'yearly' ? 'מנוי שנתי — מערכת עורכי דין (10% הנחה)' : 'מנוי חודשי — מערכת עורכי דין',
        packageSnapshot: { ...snap.package, billingInterval: interval },
    });

    const dispatch = () => chargeTakbullTokenFn({
        credentials: creds,
        orderReference: intent.order_reference,
        amount,
        currency: 'ILS',
        cardExternalToken: token,
        ipnAddress: ipnAddress(),
        redirectAddress: returnAddress(),
        cancelReturnAddress: cancelAddress(),
        purpose: interval === 'yearly' ? 'מנוי שנתי — מערכת עורכי דין (10% הנחה)' : 'מנוי חודשי — מערכת עורכי דין',
    });

    let charged;
    if (automatic) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const scope = billingScopeSql();
            const current = (await client.query(`SELECT billing_enabled,auto_renew FROM firm_billing WHERE ${scope.clause} FOR UPDATE`, scope.param ? [scope.param] : [])).rows[0];
            if (!current?.billing_enabled || current.auto_renew === false) {
                await client.query("UPDATE firm_payment_intents SET status='cancelled',updated_at=now() WHERE id=$1", [intent.id]);
                await client.query('COMMIT');
                return { skipped: true, reason: 'renewal_cancelled' };
            }
            charged = await dispatch();
            await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    } else charged = await dispatch();

    await pool.query(
        `UPDATE firm_payment_intents
         SET takbull_transaction_id = $2, updated_at = now()
         WHERE id = $1`,
        [intent.id, charged.transactionInternalNumber]
    );

    if (!charged.ok) {
        const msg = charged.internalDescription || `Takbull ${charged.internalCode}`;
        await markPaymentFailed({ intent, errorMessage: msg, skipEmail });
        return { ok: false, errorMessage: msg, snapshot: await getBillingSnapshot() };
    }

    const snapshot = await settleSuccessfulPayment({
        intent,
        tokenInfo: charged.token,
        transactionId: charged.transactionInternalNumber,
    });
    return { ok: true, snapshot };
}

async function chargeSavedCardForPackageUpgrade({
    kind,
    amountOverride,
    skipEmail,
    upgradeOperation,
} = {}) {
    const creds = getTakbullCredentialsFromEnv();
    const snap = await getBillingSnapshot();
    const card = await getActiveCard();

    if (!snap.billingEnabled) {
        return { skipped: true, reason: 'billing_disabled', snapshot: snap };
    }
    if (snap.stillComplimentary && kind !== 'setup' && kind !== 'annual') {
        return { skipped: true, reason: 'complimentary', snapshot: snap };
    }
    if (!creds) {
        return markPaymentFailed({ errorMessage: 'סליקת Takbull לא הוגדרה', skipEmail });
    }
    if (!card?.tokenEncrypted) {
        return markPaymentFailed({ errorMessage: 'לא שמור כרטיס אשראי', skipEmail });
    }

    const target = upgradeOperation.targetPackage;
    const interval = normalizeBillingInterval(
        upgradeOperation.interval || (kind === 'annual' ? 'yearly' : snap.billingInterval)
    );
    const amount = Number(amountOverride);
    if (amount <= 0) {
        return { skipped: true, reason: 'zero_amount', snapshot: snap };
    }

    let token;
    try {
        token = decryptSecret(card.tokenEncrypted);
    } catch (e) {
        return markPaymentFailed({ errorMessage: 'לא ניתן לפענח את הכרטיס השמור', skipEmail });
    }

    const operationKey = buildUpgradeOperationKey({
        tenantId: getCurrentTenantId(),
        platformId: target.platformId,
        resourceId: target.resourceId,
        signingId: target.signingId,
        billingInterval: interval,
        amountIls: amount,
    });

    const rowBefore = await getBillingRow();
    if (billingRowMatchesPackage(rowBefore, target)) {
        return {
            ok: true,
            alreadyApplied: true,
            charged: false,
            snapshot: await getBillingSnapshot(),
        };
    }

    const purpose = interval === 'yearly'
        ? 'מנוי שנתי — מערכת עורכי דין (10% הנחה)'
        : 'מנוי חודשי — מערכת עורכי דין';
    const intentKind = kind === 'annual' ? 'annual' : 'upgrade';

    return withUpgradeOperationLock(operationKey, async (client) => {
        const rowLocked = await getBillingRow();
        if (billingRowMatchesPackage(rowLocked, target)) {
            return {
                ok: true,
                alreadyApplied: true,
                charged: false,
                snapshot: await getBillingSnapshot(),
            };
        }

        const paidUnapplied = await findSucceededUnappliedUpgradeIntent(operationKey, client);
        if (paidUnapplied) {
            return recoverPaidUpgradeIntent(paidUnapplied, { upgradeOperationKey: operationKey });
        }

        let intent = await findPendingUpgradeIntentForUpdate(operationKey, client);

        if (intent?.status === 'pending' && intent.takbull_transaction_id) {
            const snapshot = await settleSuccessfulPayment({
                intent,
                transactionId: intent.takbull_transaction_id,
            });
            return {
                ok: true,
                charged: false,
                finalizedPending: true,
                intentId: intent.id,
                snapshot,
            };
        }

        if (!intent || intent.status === 'failed' || intent.status === 'cancelled') {
            const snapshotPayload = upgradePackageSnapshot({
                targetPackage: target,
                interval,
                operationKey,
            });
            intent = await createIntent({
                kind: intentKind,
                amountIls: amount,
                purpose,
                packageSnapshot: snapshotPayload,
            }, client);
        } else if (intent.status === 'succeeded') {
            return recoverPaidUpgradeIntent(intent, { upgradeOperationKey: operationKey });
        }

        chargeProviderCallCount += 1;
        const charged = await chargeTakbullTokenFn({
            credentials: creds,
            orderReference: intent.order_reference,
            amount,
            currency: 'ILS',
            cardExternalToken: token,
            ipnAddress: ipnAddress(),
            redirectAddress: returnAddress(),
            cancelReturnAddress: cancelAddress(),
            purpose,
        });

        const q = client.query.bind(client);
        await q(
            `UPDATE firm_payment_intents
             SET takbull_transaction_id = $2, updated_at = now()
             WHERE id = $1`,
            [intent.id, charged.transactionInternalNumber]
        );

        if (!charged.ok) {
            const msg = charged.internalDescription || `Takbull ${charged.internalCode}`;
            await markPaymentFailed({ intent, errorMessage: msg, skipEmail });
            return { ok: false, errorMessage: msg, snapshot: await getBillingSnapshot() };
        }

        const snapshot = await settleSuccessfulPayment({
            intent,
            tokenInfo: charged.token,
            transactionId: charged.transactionInternalNumber,
        });
        return { ok: true, charged: true, intentId: intent.id, snapshot };
    });
}

async function savePackage({ platformId, resourceId, signingId, billingInterval, usage, customer } = {}) {
    const api = module.exports;
    const row = await api.ensureBillingRow();
    const current = {
        platformId: row.platformId,
        resourceId: row.resourceId,
        signingId: row.signingId,
    };
    const next = { platformId, resourceId, signingId };
    const evaluation = evaluatePackageChange({ current, next, usage });
    if (!evaluation.allowed) {
        const err = new Error(evaluation.blocks.map((b) => b.message).join(' '));
        err.code = 'PACKAGE_DOWNGRADE_BLOCKED';
        err.blocks = evaluation.blocks;
        throw err;
    }

    const pkg = evaluation.next;
    const interval = billingInterval != null
        ? normalizeBillingInterval(billingInterval)
        : normalizeBillingInterval(row.billingInterval);
    const packChanged = current.platformId !== pkg.platformId
        || current.resourceId !== pkg.resourceId
        || current.signingId !== pkg.signingId;

    const flags = computeFlags(await api.getBillingRow());
    const requiresPaymentBeforePersist = packChanged
        && flags.billingEnabled
        && !flags.stillComplimentary
        && evaluation.priceIncreased;

    async function persistPackageRow() {
        await api.updateBilling({
            platform_id: pkg.platformId,
            resource_id: pkg.resourceId,
            signing_id: pkg.signingId,
            price_monthly_ils: pkg.total,
            billing_interval: interval,
        });
        await api.syncTenantSubscription(pkg);
    }

    if (requiresPaymentBeforePersist) {
        const card = await api.getActiveCard();
        if (!card) {
            const checkout = await api.createCheckout({
                kind: interval === 'yearly' ? 'annual' : 'retry',
                customer,
                pendingPackage: {
                    platformId: pkg.platformId,
                    resourceId: pkg.resourceId,
                    signingId: pkg.signingId,
                    billingInterval: interval,
                },
            });
            return {
                saved: true,
                charged: false,
                checkout,
                snapshot: await api.getBillingSnapshot(),
                evaluation,
            };
        }
        const charged = await api.chargeSavedCard({
            kind: interval === 'yearly' ? 'annual' : 'upgrade',
            amountOverride: interval === 'yearly' ? yearlyTotalIls(pkg.total) : pkg.total,
            skipEmail: false,
            upgradeOperation: {
                targetPackage: {
                    platformId: pkg.platformId,
                    resourceId: pkg.resourceId,
                    signingId: pkg.signingId,
                },
                interval,
            },
        });
        if (charged?.ok === false || charged?.snapshot?.status === 'past_due') {
            const checkout = await api.createCheckout({
                kind: interval === 'yearly' ? 'annual' : 'retry',
                customer,
            });
            return {
                saved: true,
                charged: false,
                checkout,
                snapshot: await api.getBillingSnapshot(),
                evaluation,
            };
        }
        if (charged?.alreadyApplied) {
            try {
                await persistPackageRow();
            } catch (persistErr) {
                console.error('[billing] PACKAGE_PERSIST_AFTER_CHARGE', {
                    code: 'PACKAGE_PERSIST_AFTER_CHARGE',
                    platformId: pkg.platformId,
                    resourceId: pkg.resourceId,
                    signingId: pkg.signingId,
                    billingInterval: interval,
                    message: persistErr?.message,
                });
                const err = new Error('החיוב בוצע אך עדכון החבילה נכשל. פנו לתמיכה.');
                err.code = 'PACKAGE_PERSIST_AFTER_CHARGE';
                throw err;
            }
            return {
                saved: true,
                charged: false,
                snapshot: charged.snapshot || await api.getBillingSnapshot(),
                evaluation,
            };
        }
        if (charged?.recovered || charged?.finalizedPending) {
            try {
                await persistPackageRow();
            } catch (persistErr) {
                console.error('[billing] PACKAGE_PERSIST_AFTER_CHARGE', {
                    code: 'PACKAGE_PERSIST_AFTER_CHARGE',
                    platformId: pkg.platformId,
                    resourceId: pkg.resourceId,
                    signingId: pkg.signingId,
                    billingInterval: interval,
                    message: persistErr?.message,
                });
                const err = new Error('החיוב בוצע אך עדכון החבילה נכשל. פנו לתמיכה.');
                err.code = 'PACKAGE_PERSIST_AFTER_CHARGE';
                throw err;
            }
            return {
                saved: true,
                charged: false,
                recovered: true,
                snapshot: charged.snapshot || await api.getBillingSnapshot(),
                evaluation,
            };
        }
        try {
            await persistPackageRow();
        } catch (persistErr) {
            console.error('[billing] PACKAGE_PERSIST_AFTER_CHARGE', {
                code: 'PACKAGE_PERSIST_AFTER_CHARGE',
                platformId: pkg.platformId,
                resourceId: pkg.resourceId,
                signingId: pkg.signingId,
                billingInterval: interval,
                message: persistErr?.message,
            });
            const err = new Error('החיוב בוצע אך עדכון החבילה נכשל. פנו לתמיכה.');
            err.code = 'PACKAGE_PERSIST_AFTER_CHARGE';
            throw err;
        }
        return {
            saved: true,
            charged: true,
            snapshot: charged.snapshot || await api.getBillingSnapshot(),
            evaluation,
        };
    }

    await persistPackageRow();

    if (!packChanged) {
        return { saved: true, charged: false, snapshot: await api.getBillingSnapshot(), evaluation };
    }

    return { saved: true, charged: false, snapshot: await api.getBillingSnapshot(), evaluation };
}

async function handleTakbullNotification({ uniqId, query } = {}) {
    const creds = getTakbullCredentialsFromEnv();
    if (!creds || !uniqId) {
        return { ok: false, reason: 'missing_creds_or_uniq' };
    }

    const validated = await validateTakbullNotification(creds, uniqId);
    let intent = await findIntentByUniqId(uniqId);
    if (!intent && query?.order_reference) {
        intent = await findIntentByOrderReference(query.order_reference);
    }
    if(!intent)return {ok:false,paid:false,reason:'unknown_order'};

    if(intent?.signup_intent_id) {
        if(!validated.ok||!validated.paid) return {ok:true,paid:false};
        if(intent.takbull_uniq_id!==uniqId)throw new Error('SIGNUP_PAYMENT_IDENTITY_MISMATCH');
        const verified=await require('../payments/verifySignupPayment').verifySignupPayment(creds,uniqId,intent.order_reference);
        await settleSuccessfulPayment({intent,tokenInfo:verified.tokenInfo,transactionId:verified.transactionId});
        return {ok:true,paid:true};
    }

    // New self-service renewal cycles settle only their durable scoped reservation.
    if(intent?.signup_cycle_at)return {ok:true,paid:false,reason:'renewal_server_settlement'};
    if(intent.law_firm_tenant_id && getCurrentTenantId()!==intent.law_firm_tenant_id){
        const {runWithTenant}=require('../tenant/tenantContext');
        return runWithTenant({id:intent.law_firm_tenant_id},()=>handleTakbullNotification({uniqId,query}));
    }

    if (intent.kind === 'setup' && await hasSelfServiceAgreement()) {
        if (!validated.ok || !validated.paid) return { ok: true, paid: false };
        if (intent.takbull_uniq_id !== uniqId) throw new Error('SIGNUP_PAYMENT_IDENTITY_MISMATCH');
        const verified = await require('../payments/verifySignupPayment').verifySignupPayment(creds, uniqId, intent.order_reference);
        await settleSuccessfulPayment({ intent, tokenInfo: verified.tokenInfo, transactionId: verified.transactionId });
        return { ok: true, paid: true, cardVerified: true };
    }

    const tokenInfo = validated.token
        ? {
            token: validated.token,
            last4Digits: validated.last4Digits,
            expMonth: validated.expMonth,
            expYear: validated.expYear,
            cardBrand: validated.cardBrand,
        }
        : extractTokenFromValidated(validated.raw);

    if (validated.paid) {
        const txId = validated.raw?.TransactionId
            || validated.raw?.transactionInternalNumber
            || validated.raw?.TransactionInternalNumber
            || validated.raw?.transaction?.transactionInternalNumber
            || null;
        await settleSuccessfulPayment({
            intent,
            tokenInfo,
            transactionId: txId,
        });
        return { ok: true, paid: true };
    }

    if (intent && intent.status === 'pending') {
        await markPaymentFailed({
            intent,
            errorMessage: validated.internalDescription || 'התשלום לא אושר',
        });
    }
    return { ok: true, paid: false };
}

async function handleTakbullReturn({ uniqId, intentId } = {}) {
    if (uniqId) {
        await handleTakbullNotification({ uniqId });
    } else if (intentId) {
        const intent = await findIntentById(intentId);
        if (intent?.takbull_uniq_id) {
            await handleTakbullNotification({ uniqId: intent.takbull_uniq_id });
        }
    }
    const snap = await getBillingSnapshot();
    const paid = snap.status === 'active' || snap.status === 'complimentary';
    const dest = `${getFrontendBaseUrl()}/AdminStack/PlanUsage?paid=${paid ? '1' : '0'}`;
    return { snapshot: snap, redirectUrl: dest };
}

async function handleTakbullCancel({ intentId } = {}) {
    if (intentId) {
        const intent = await findIntentById(intentId);
        if (intent && intent.status === 'pending') {
            await pool.query(
                `UPDATE firm_payment_intents SET status = 'cancelled', updated_at = now() WHERE id = $1`,
                [intentId]
            );
        }
    }
    return { redirectUrl: `${getFrontendBaseUrl()}/AdminStack/PlanUsage?paid=0` };
}

async function runBillingMaintenance({ now = new Date() } = {}) {
    if(getCurrentTenantId()){
        const result=await require('./selfServiceRenewal').signupRenewal.renew(getCurrentTenantId());
        if(result.handled)return result;
    }
    const row = await ensureBillingRow();
    if (!row) return { skipped: true, reason: 'no_table' };

    const flags = computeFlags(row, now);
    if (!flags.billingEnabled) {
        return { skipped: true, reason: 'billing_disabled' };
    }
    if (row.autoRenew === false) return { skipped: true, reason: 'renewal_cancelled' };

    await expireGraceIfNeeded(row, now);

    if (flags.stillComplimentary) {
        return { skipped: true, reason: 'complimentary' };
    }

    const latest = await getBillingRow();
    const latestFlags = computeFlags(latest, now);
    if (latest.autoRenew === false) return { skipped: true, reason: 'renewal_cancelled' };

    if (latest.status === 'suspended') {
        return { skipped: true, reason: 'suspended' };
    }

    const due = !latest.renewsAt || new Date(latest.renewsAt).getTime() <= now.getTime();
    const pastDueRetry =
        latest.status === 'past_due' &&
        (!latest.lastFailedAt || now.getTime() - new Date(latest.lastFailedAt).getTime() >= RETRY_GAP_MS);

    const shouldRenew = latest.status === 'active' && due;
    const shouldRetryPastDue = latest.status === 'past_due' && pastDueRetry;

    if (!shouldRenew && !shouldRetryPastDue) {
        if (latest.status === 'past_due') {
            return { skipped: true, reason: 'past_due_waiting_retry' };
        }
        if (latest.status === 'active' && !due) {
            return { skipped: true, reason: 'not_due' };
        }
        return { skipped: true, reason: 'noop', flags: latestFlags };
    }

    const yearly = normalizeBillingInterval(latest.billingInterval) === 'yearly';
    const result = await chargeSavedCard({
        automatic: true,
        kind: shouldRetryPastDue ? 'retry' : (yearly ? 'annual' : 'renewal'),
        skipEmail: shouldRetryPastDue,
    });
    return { charged: true, result };
}

async function getDisabledOptions(usage) {
    const row = await ensureBillingRow();
    return disabledOptionsForUsage({
        current: {
            platformId: row?.platformId,
            resourceId: row?.resourceId,
            signingId: row?.signingId,
        },
        usage,
    });
}

async function cancelSubscription() {
    const row = await ensureBillingRow();
    if (!row) {
        const err = new Error('לא נמצא מנוי');
        err.code = 'NO_BILLING';
        throw err;
    }
    // This row update serializes with the final self-service renewal dispatch.
    // Keep the paid period, saved card and data intact; cancelling is not free access.
    await updateBilling({ auto_renew: false });

    return getBillingSnapshot();
}

module.exports = {
    GRACE_MS,
    SETUP_AMOUNT_ILS,
    ensureBillingRow,
    getBillingRow,
    getBillingSnapshot,
    listPaymentHistory,
    getActiveCard,
    savePackage,
    createCheckout,
    chargeSavedCard,
    handleTakbullNotification,
    handleTakbullReturn,
    handleTakbullCancel,
    runBillingMaintenance,
    getDisabledOptions,
    cancelSubscription,
    computeFlags,
    findIntentById,
    updateBilling,
    syncTenantSubscription,
    parseIntentPackageSnapshot,
    applyIntentPackageSnapshot,
    buildUpgradeOperationKey,
    resetChargeProviderCallCountForTests,
    getChargeProviderCallCountForTests,
    setChargeTakbullTokenForTests,
};
