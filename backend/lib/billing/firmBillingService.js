const crypto = require('node:crypto');
const pool = require('../../config/db');
const { encryptSecret, decryptSecret } = require('./secrets');
const {
    resolvePricingLineItems,
    quotasForPackage,
    evaluatePackageChange,
    disabledOptionsForUsage,
    DEFAULT_SELECTION,
} = require('./pricingPackage');
const {
    getTenantSlug,
    defaultComplimentaryUntil,
    defaultBillingEnabled,
    isDateInFuture,
    addCalendarMonth,
    getPublicApiBaseUrl,
    getFrontendBaseUrl,
} = require('./tenantBillingDefaults');
const {
    createTakbullPaymentPage,
    validateTakbullNotification,
    chargeTakbullToken,
    getTakbullCredentialsFromEnv,
    extractTokenFromValidated,
} = require('../payments/takbullClient');
const { sendFailedPaymentEmails } = require('./billingEmails');

const GRACE_MS = 72 * 60 * 60 * 1000;
const SETUP_AMOUNT_ILS = 1;
const RETRY_GAP_MS = 12 * 60 * 60 * 1000;

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
        status: row.status,
        billingEnabled: row.billing_enabled !== false,
        complimentaryUntil: row.complimentary_until,
        renewsAt: row.renews_at,
        graceUntil: row.grace_until,
        lastPaymentError: row.last_payment_error,
        lastFailedAt: row.last_failed_at,
        lastPaidAt: row.last_paid_at,
        updatedAt: row.updated_at,
    };
}

async function getBillingRow() {
    try {
        const res = await pool.query(`SELECT * FROM firm_billing WHERE id = 1 LIMIT 1`);
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
    const complimentaryUntil = defaultComplimentaryUntil(slug);
    const billingEnabled = defaultBillingEnabled(slug);
    const pkg = resolvePricingLineItems(DEFAULT_SELECTION);
    const status = billingEnabled && !isDateInFuture(complimentaryUntil) ? 'active' : 'complimentary';
    const renewsAt = complimentaryUntil || addCalendarMonth(new Date());

    try {
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
    await pool.query(`UPDATE firm_billing SET ${sets.join(', ')} WHERE id = 1`, vals);
    return getBillingRow();
}

async function getActiveCard() {
    try {
        const res = await pool.query(
            `SELECT id, last4, exp_month, exp_year, card_brand, token_encrypted, is_active
             FROM firm_payment_methods
             WHERE is_active = true
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

async function saveCardFromToken(tokenInfo) {
    if (!tokenInfo?.token) return null;
    const encrypted = encryptSecret(tokenInfo.token);
    await pool.query(`UPDATE firm_payment_methods SET is_active = false, updated_at = now() WHERE is_active = true`);
    const res = await pool.query(
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

function computeFlags(row, now = new Date()) {
    const billingEnabled = row?.billingEnabled !== false;
    const complimentaryUntil = row?.complimentaryUntil || null;
    const stillComplimentary = !billingEnabled || isDateInFuture(complimentaryUntil, now);
    const graceUntil = row?.graceUntil ? new Date(row.graceUntil) : null;
    const graceExpired = Boolean(
        row?.status === 'past_due' && graceUntil && graceUntil.getTime() <= now.getTime()
    );
    const locked = Boolean(
        billingEnabled && !stillComplimentary && (row?.status === 'suspended' || graceExpired)
    );
    return { billingEnabled, stillComplimentary, graceExpired, locked, complimentaryUntil };
}

async function expireGraceIfNeeded(row, now = new Date()) {
    const flags = computeFlags(row, now);
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
             ORDER BY created_at DESC
             LIMIT $1`,
            [Math.min(Math.max(Number(limit) || 25, 1), 100)]
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
    const upcomingPayment = row.renewsAt
        ? {
            id: 'upcoming',
            kind: 'upcoming',
            status: 'scheduled',
            amountIls: Number(pkg.total || 0),
            currency: 'ILS',
            purpose: flags.stillComplimentary
                ? 'חיוב חודשי ראשון אחרי תקופת ההמתנה'
                : 'חיוב חודשי הבא',
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
        priceMonthlyIls: pkg.total,
        nextChargeIls: Number(pkg.total || 0),
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
             WHERE u.role = 'Admin'
             ORDER BY u.userid
             LIMIT 1
             ON CONFLICT (tenant_id) DO UPDATE
             SET plan_key = EXCLUDED.plan_key, status = 'active', updated_at = now()`,
            [quotas.planKey]
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

async function createIntent({ kind, amountIls, purpose, packageSnapshot }) {
    const id = crypto.randomUUID();
    const orderReference = `lw-${kind}-${id.replace(/-/g, '').slice(0, 18)}`;
    const res = await pool.query(
        `INSERT INTO firm_payment_intents (
            id, kind, status, amount_ils, currency, order_reference, purpose, package_snapshot
         ) VALUES ($1, $2, 'pending', $3, 'ILS', $4, $5, $6::jsonb)
         RETURNING *`,
        [id, kind, amountIls, orderReference, purpose || null, JSON.stringify(packageSnapshot || {})]
    );
    return res.rows[0];
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
    if (!flags.billingEnabled || flags.stillComplimentary) {
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

    if (!skipEmail) {
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

async function settleSuccessfulPayment({ intent, tokenInfo, transactionId } = {}) {
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
             WHERE status = 'pending' AND id <> $1`,
            [intent.id]
        );
    }

    if (tokenInfo?.token) {
        try {
            await saveCardFromToken(tokenInfo);
        } catch (e) {
            console.error('[billing] save card failed:', e?.message);
        }
    }

    const row = await ensureBillingRow();
    const pkg = resolvePricingLineItems({
        platformId: row.platformId,
        resourceId: row.resourceId,
        signingId: row.signingId,
    });
    const flags = computeFlags(row);
    const renewsAt = flags.stillComplimentary
        ? (row.complimentaryUntil || addCalendarMonth(new Date()))
        : addCalendarMonth(new Date());

    await updateBilling({
        status: flags.stillComplimentary ? 'complimentary' : 'active',
        grace_until: null,
        last_payment_error: null,
        last_failed_at: null,
        last_paid_at: new Date(),
        renews_at: renewsAt,
        price_monthly_ils: pkg.total,
    });

    return getBillingSnapshot();
}

async function createCheckout({ kind, customer } = {}) {
    const creds = getTakbullCredentialsFromEnv();
    if (!creds) {
        const err = new Error('סליקת Takbull לא הוגדרה');
        err.code = 'TAKBULL_NOT_CONFIGURED';
        throw err;
    }

    const snap = await getBillingSnapshot();
    const isSetup = snap.stillComplimentary || kind === 'setup';
    const amount = isSetup ? SETUP_AMOUNT_ILS : Number(snap.package.total || 0);
    if (!isSetup && amount <= 0) {
        const err = new Error('אין סכום לחיוב');
        err.code = 'NO_AMOUNT';
        throw err;
    }

    const intentKind = isSetup ? 'setup' : (kind === 'retry' ? 'retry' : 'renewal');
    const purpose = isSetup ? 'אימות כרטיס אשראי — מנוי מערכת' : 'מנוי חודשי — מערכת עורכי דין';
    const intent = await createIntent({
        kind: intentKind,
        amountIls: amount,
        purpose,
        packageSnapshot: snap.package,
    });

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

async function chargeSavedCard({ kind, amountOverride, skipEmail } = {}) {
    const creds = getTakbullCredentialsFromEnv();
    const snap = await getBillingSnapshot();
    const card = await getActiveCard();

    if (!snap.billingEnabled) {
        return { skipped: true, reason: 'billing_disabled', snapshot: snap };
    }
    if (snap.stillComplimentary && kind !== 'setup') {
        return { skipped: true, reason: 'complimentary', snapshot: snap };
    }
    if (!creds) {
        return markPaymentFailed({ errorMessage: 'סליקת Takbull לא הוגדרה', skipEmail });
    }
    if (!card?.tokenEncrypted) {
        return markPaymentFailed({ errorMessage: 'לא שמור כרטיס אשראי', skipEmail });
    }

    const amount = Number(amountOverride != null ? amountOverride : snap.package.total || 0);
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
        kind: kind || 'renewal',
        amountIls: amount,
        purpose: 'מנוי חודשי — מערכת עורכי דין',
        packageSnapshot: snap.package,
    });

    const charged = await chargeTakbullToken({
        credentials: creds,
        orderReference: intent.order_reference,
        amount,
        currency: 'ILS',
        cardExternalToken: token,
        ipnAddress: ipnAddress(),
        redirectAddress: returnAddress(),
        cancelReturnAddress: cancelAddress(),
        purpose: 'מנוי חודשי — מערכת עורכי דין',
    });

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

async function savePackage({ platformId, resourceId, signingId, usage, customer } = {}) {
    const row = await ensureBillingRow();
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
    await updateBilling({
        platform_id: pkg.platformId,
        resource_id: pkg.resourceId,
        signing_id: pkg.signingId,
        price_monthly_ils: pkg.total,
    });
    await syncTenantSubscription(pkg);

    const flags = computeFlags(await getBillingRow());
    const card = await getActiveCard();
    if (!card) {
        const checkout = await createCheckout({ kind: 'setup', customer });
        return { saved: true, charged: false, checkout, snapshot: await getBillingSnapshot(), evaluation };
    }
    if (flags.billingEnabled && !flags.stillComplimentary && evaluation.priceIncreased) {
        const charged = await chargeSavedCard({
            kind: 'upgrade',
            amountOverride: pkg.total,
            skipEmail: false,
        });
        if (charged?.ok === false || charged?.snapshot?.status === 'past_due') {
            const checkout = await createCheckout({ kind: 'retry', customer });
            return { saved: true, charged: false, checkout, snapshot: await getBillingSnapshot(), evaluation };
        }
        return { saved: true, charged: true, snapshot: charged.snapshot || await getBillingSnapshot(), evaluation };
    }

    return { saved: true, charged: false, snapshot: await getBillingSnapshot(), evaluation };
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
        await settleSuccessfulPayment({
            intent,
            tokenInfo,
            transactionId: query?.transactionInternalNumber || null,
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
    const row = await ensureBillingRow();
    if (!row) return { skipped: true, reason: 'no_table' };

    const flags = computeFlags(row, now);
    if (!flags.billingEnabled) {
        return { skipped: true, reason: 'billing_disabled' };
    }

    await expireGraceIfNeeded(row, now);

    if (flags.stillComplimentary) {
        return { skipped: true, reason: 'complimentary' };
    }

    const latest = await getBillingRow();
    const latestFlags = computeFlags(latest, now);

    if (latest.status === 'suspended') {
        return { skipped: true, reason: 'suspended' };
    }

    const due = !latest.renewsAt || new Date(latest.renewsAt).getTime() <= now.getTime();
    const pastDueRetry =
        latest.status === 'past_due' &&
        (!latest.lastFailedAt || now.getTime() - new Date(latest.lastFailedAt).getTime() >= RETRY_GAP_MS);

    if (!due && !pastDueRetry && latest.status === 'active') {
        return { skipped: true, reason: 'not_due' };
    }

    if (latest.status === 'complimentary' || due || pastDueRetry) {
        const result = await chargeSavedCard({
            kind: latest.status === 'past_due' ? 'retry' : 'renewal',
        });
        return { charged: true, result };
    }

    return { skipped: true, reason: 'noop', flags: latestFlags };
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
    computeFlags,
    findIntentById,
    updateBilling,
    syncTenantSubscription,
};
