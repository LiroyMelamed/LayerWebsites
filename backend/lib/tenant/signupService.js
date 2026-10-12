const { saveSignupLogo } = require('./signupLogo');
const { assertSignupAvailable } = require('./signupAvailability');
const crypto = require('node:crypto');
const pool = require('../../config/db');
const { formatPhoneNumber } = require('../../utils/phoneUtils');
const { encryptSecret, getProviderSecretsKey } = require('../billing/secrets');
const {
    createTakbullPaymentPage,
    getTakbullCredentialsFromEnv,
    paymentGatewayUrl,
} = require('../payments/takbullClient');
const { getPublicApiBaseUrl, getFrontendBaseUrl } = require('../billing/tenantBillingDefaults');
const { createTenant, slugAvailable } = require('./tenantService');
const { isValidSlug, normalizeSlug } = require('./tenantContext');
const { sendMessage } = require('../../utils/sendMessage');

const TRIAL_DAYS = 90; // Legacy response compatibility; entitlement uses three calendar months.
const SETUP_AMOUNT_ILS = 1;
const { CONSENT_VERSION, SUPPORTED_CONSENT_VERSIONS, quoteSignup } = require('../billing/signupQuote');

function trialEnd(from) { return require('../billing/calendarMonths').addIsraelCalendarMonths(from,3); }

function mapSignupRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        slug: row.slug,
        firmName: row.firm_name,
        adminName: row.admin_name,
        adminPhone: row.admin_phone,
        adminEmail: row.admin_email,
        lawyerCount: row.lawyer_count,
        practiceAreas: row.practice_areas || [],
        platformId: row.platform_id,
        resourceId: row.resource_id,
        signingId: row.signing_id,
        billingInterval: row.billing_interval,
        priceMonthlyIls: Number(row.price_monthly_ils || 0),
        recurringAmountIls: row.recurring_amount_ils == null ? null : Number(row.recurring_amount_ils),
        status: row.status,
        tenantId: row.law_firm_tenant_id,
        paymentIntentId: row.payment_intent_id,
        createdAt: row.created_at,
    };
}

async function createSignupIntent(payload) {
    assertSignupAvailable();
    if (payload.billingConsent !== true || payload.consentVersion !== CONSENT_VERSION) {
        throw Object.assign(new Error('יש לאשר חיוב שקל ושמירת כרטיס לחידוש לאחר שלושה חודשים'), { code: 'CONSENT_REQUIRED' });
    }
    if (!getTakbullCredentialsFromEnv() || !getProviderSecretsKey()) {
        throw Object.assign(new Error('ההרשמה בתשלום עדיין אינה זמינה'), { code: 'TAKBULL_NOT_CONFIGURED' });
    }
    const slug = normalizeSlug(payload.slug);
    const firmName = String(payload.firmName || '').trim();
    const adminName = String(payload.adminName || '').trim();
    const adminPhone = formatPhoneNumber(payload.adminPhone) || String(payload.adminPhone || '').trim();
    const adminEmail = String(payload.adminEmail || '').trim() || null;
    const platformId = payload.platformId || 'site_app';
    const resourceId = payload.resourceId || 'pro';
    const signingId = payload.signingId || '500';
    const billingInterval = payload.billingInterval || 'monthly';
    const lawyerCount = payload.lawyerCount != null ? Number(payload.lawyerCount) : null;
    const practiceAreas = Array.isArray(payload.practiceAreas) ? payload.practiceAreas : [];

    if (!isValidSlug(slug)) {
        const err = new Error('כתובת משרד לא תקינה');
        err.code = 'INVALID_SLUG';
        throw err;
    }
    if (!firmName || !adminName || !adminPhone) {
        const err = new Error('חסרים שדות חובה');
        err.code = 'MISSING_FIELDS';
        throw err;
    }

    const pkg = quoteSignup({ platformId, resourceId, signingId, billingInterval });
    const quoted = pkg.recurringAmountIls;
    if (Number(payload.expectedPriceIls) !== quoted) throw Object.assign(new Error('המחיר השתנה; יש לרענן ולאשר מחדש'), {code:'PRICE_CHANGED'});
    const id = String(payload.idempotencyKey || '');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) throw Object.assign(new Error('INVALID_IDEMPOTENCY_KEY'), {code:'INVALID_IDEMPOTENCY_KEY'});
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({slug,firmName,adminName,adminPhone,adminEmail,platformId,resourceId,signingId,billingInterval,quoted,...(payload.logoDataUrl ? {logoSourceSha256:crypto.createHash('sha256').update(String(payload.logoDataUrl)).digest('hex')} : {})})).digest('hex');
    const c = await pool.connect();
    try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['signup:' + id]);
    const previous = (await c.query('SELECT * FROM signup_intents WHERE id=$1', [id])).rows[0];
    if (previous) {
        if (previous.request_hash !== requestHash) throw Object.assign(new Error('פרטי ההרשמה השתנו. יש להשלים את ההרשמה הקודמת'), {code:'IDEMPOTENCY_CONFLICT'});
        await c.query('COMMIT');
        return mapSignupRow(previous);
    }
    if (!(await slugAvailable(slug))) throw Object.assign(new Error('כתובת המשרד כבר תפוסה'), {code:'SLUG_TAKEN'});
    const logo = await saveSignupLogo(payload.logoDataUrl, id);
    const res = await c.query(
        `INSERT INTO signup_intents (
            id, request_hash, slug, firm_name, admin_name, admin_phone, admin_email,
            lawyer_count, practice_areas,
            platform_id, resource_id, signing_id, billing_interval, price_monthly_ils, consent_version, consented_at, recurring_amount_ils, vat_percent, logo
         ) VALUES ($13,$14,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$15,now(),$16,$17,$18)
         RETURNING *`,
        [
            slug,
            firmName,
            adminName,
            adminPhone,
            adminEmail,
            lawyerCount,
            practiceAreas,
            platformId,
            resourceId,
            signingId,
            billingInterval,
            pkg.total, id, requestHash, CONSENT_VERSION, quoted, pkg.vatPercent, logo,
        ]
    );
    await c.query('COMMIT');
    return mapSignupRow(res.rows[0]);
    } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();}
}

async function getSignupIntent(id) {
    if (!/^[a-f0-9-]{36}$/i.test(String(id || ''))) return null;
    const res = await pool.query(`SELECT * FROM signup_intents WHERE id = $1 LIMIT 1`, [id]);
    return mapSignupRow(res.rows?.[0] || null);
}

function signupReturnUrl(intentId) {
    return `${getPublicApiBaseUrl()}/api/public/signup/takbull/return?intentId=${encodeURIComponent(intentId)}`;
}

function signupCancelUrl(intentId) {
    return `${getPublicApiBaseUrl()}/api/public/signup/takbull/cancel?intentId=${encodeURIComponent(intentId)}`;
}

function signupIpnUrl() {
    return `${getPublicApiBaseUrl()}/api/webhooks/payments/takbull`;
}

async function createSignupCheckout(intentId) {
    assertSignupAvailable();
    const creds = getTakbullCredentialsFromEnv();
    if (!creds || !getProviderSecretsKey()) throw Object.assign(new Error('ההרשמה בתשלום עדיין אינה זמינה'), { code: 'TAKBULL_NOT_CONFIGURED' });
    const c = await pool.connect();
    let intent, paymentIntentId, orderReference;
    try {
        await c.query('BEGIN');
        const row = (await c.query('SELECT * FROM signup_intents WHERE id=$1 FOR UPDATE', [intentId])).rows[0];
        if (!row) throw Object.assign(new Error('SIGNUP_NOT_FOUND'), {code:'SIGNUP_NOT_FOUND'});
        intent = mapSignupRow(row);
        if (intent.status === 'completed') {await c.query('COMMIT');return {intentId,status:'completed',slug:intent.slug,amount:1};}
        if (intent.status !== 'pending_payment' || !SUPPORTED_CONSENT_VERSIONS.includes(row.consent_version)) throw Object.assign(new Error('SIGNUP_NOT_PENDING'), {code:'SIGNUP_NOT_PENDING'});
        if (row.payment_intent_id) {
            const previous = (await c.query('SELECT * FROM firm_payment_intents WHERE id=$1', [row.payment_intent_id])).rows[0];
            await c.query('COMMIT');
            if (!previous?.takbull_uniq_id) throw Object.assign(new Error('התשלום בבדיקה; אין ליצור חיוב נוסף'), {code:'PAYMENT_RECONCILIATION_REQUIRED'});
            return {intentId, paymentIntentId:previous.id, redirectUrl:paymentGatewayUrl(previous.takbull_uniq_id), amount:1};
        }
        paymentIntentId = crypto.randomUUID();
        orderReference = `signup-${intentId}`;
        await c.query(`INSERT INTO firm_payment_intents (id,kind,status,amount_ils,purpose,order_reference,signup_intent_id,package_snapshot)
            VALUES ($1,'setup','pending',1,$2,$3,$4,$5)`, [paymentIntentId,'אימות כרטיס — 3 חודשים חינם',orderReference,intentId,
            JSON.stringify({platformId:intent.platformId,resourceId:intent.resourceId,signingId:intent.signingId,billingInterval:intent.billingInterval})]);
        await c.query('UPDATE signup_intents SET payment_intent_id=$2,updated_at=now() WHERE id=$1',[intentId,paymentIntentId]);
        await c.query('COMMIT');
    } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    // Durable reservation precedes provider contact. An unknown result must never trigger another charge.
    const page = await createTakbullPaymentPage({credentials:creds,orderReference,amount:1,currency:'ILS',
        redirectAddress:signupReturnUrl(intentId),cancelReturnAddress:signupCancelUrl(intentId),ipnAddress:signupIpnUrl(),
        purpose:'MelaMedia — אימות כרטיס ופתיחת משרד',saveToken:true,customerFullName:intent.adminName,customerPhone:intent.adminPhone,customerEmail:intent.adminEmail});
    await pool.query('UPDATE firm_payment_intents SET takbull_uniq_id=$2,updated_at=now() WHERE id=$1',[paymentIntentId,page.uniqId]);
    return {intentId,paymentIntentId,redirectUrl:page.redirectUrl,amount:1};
}

async function provisionTenantFromSignup(signupIntentId, { tokenInfo } = {}) {
    assertSignupAvailable();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const signupRes = await client.query(
            `SELECT * FROM signup_intents WHERE id = $1 FOR UPDATE`,
            [signupIntentId]
        );
        const signup = signupRes.rows?.[0];
        if (!signup) {
            const err = new Error('SIGNUP_NOT_FOUND');
            err.code = 'SIGNUP_NOT_FOUND';
            throw err;
        }
        if (signup.status === 'completed' && signup.law_firm_tenant_id) {
            await client.query('COMMIT');
            return { tenantId: signup.law_firm_tenant_id, slug: signup.slug, alreadyProvisioned: true };
        }
        if (signup.status !== 'pending_payment' && signup.status !== 'provisioning') {
            const err = new Error('SIGNUP_INVALID_STATUS');
            err.code = 'SIGNUP_INVALID_STATUS';
            throw err;
        }

        const paid = (await client.query(
            'SELECT * FROM firm_payment_intents WHERE id=$1 AND signup_intent_id=$2 FOR UPDATE',
            [signup.payment_intent_id, signupIntentId])).rows[0];
        if (paid?.status !== 'succeeded' || Number(paid.amount_ils) !== 1 || !tokenInfo?.token || !SUPPORTED_CONSENT_VERSIONS.includes(signup.consent_version)) {
            throw Object.assign(new Error('נדרש חיוב שקל מאומת וכרטיס שמור'), {code:'PAYMENT_REQUIRED'});
        }
        const encrypted = encryptSecret(tokenInfo.token);
        if (!encrypted.startsWith('enc:v1:')) throw new Error('TOKEN_ENCRYPTION_REQUIRED');

        await client.query(
            `UPDATE signup_intents SET status = 'provisioning', updated_at = now() WHERE id = $1`,
            [signupIntentId]
        );

        const tenantRes = await client.query(
            `INSERT INTO law_firm_tenants (slug, name, admin_phone, admin_email, practice_areas, lawyer_count, branding)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING *`,
            [
                signup.slug,
                signup.firm_name,
                signup.admin_phone,
                signup.admin_email,
                signup.practice_areas || [],
                signup.lawyer_count,
                { firmDisplayName: signup.firm_name, ...(signup.logo ? { logoUrl:signup.logo.url, logoAsset:signup.logo } : {}) },
            ]
        );
        const tenant = tenantRes.rows[0];
        const complimentaryUntil = trialEnd(new Date());

        await client.query(
            `INSERT INTO firm_billing (
                platform_id, resource_id, signing_id, price_monthly_ils,
                status, billing_enabled, complimentary_until, renews_at, law_firm_tenant_id, billing_interval
             ) VALUES ($1,$2,$3,$4,'complimentary',true,$5,$5,$6,$7)`,
            [
                signup.platform_id,
                signup.resource_id,
                signup.signing_id,
                signup.price_monthly_ils,
                complimentaryUntil,
                tenant.id,
                signup.billing_interval || 'monthly',
            ]
        );

        const adminRes = await client.query(
            `INSERT INTO users (name, phonenumber, email, role, law_firm_tenant_id)
             VALUES ($1, $2, $3, 'Admin', $4)
             RETURNING userid`,
            [signup.admin_name, signup.admin_phone, signup.admin_email, tenant.id]
        );
        const adminUserId = adminRes.rows[0].userid;

        await client.query(
            `INSERT INTO platform_admins (user_id, is_active) VALUES ($1, true)
             ON CONFLICT (user_id) DO UPDATE SET is_active = true`,
            [adminUserId]
        );

        if (tokenInfo?.token) {
            await client.query(
                `UPDATE firm_payment_methods SET is_active = false, updated_at = now()
                 WHERE law_firm_tenant_id = $1 AND is_active = true`,
                [tenant.id]
            );
            await client.query(
                `INSERT INTO firm_payment_methods (
                    provider, token_encrypted, last4, exp_month, exp_year, card_brand, is_active, law_firm_tenant_id
                 ) VALUES ('takbull', $1, $2, $3, $4, $5, true, $6)`,
                [
                    encrypted,
                    tokenInfo.last4Digits || tokenInfo.last4 || null,
                    tokenInfo.expMonth || null,
                    tokenInfo.expYear || null,
                    tokenInfo.cardBrand || null,
                    tenant.id,
                ]
            );
        }

        await client.query(
            `UPDATE signup_intents
             SET status = 'completed', law_firm_tenant_id = $2, completed_at = now(), updated_at = now()
             WHERE id = $1`,
            [signupIntentId, tenant.id]
        );

        await client.query('COMMIT');

        const loginUrl = `${getFrontendBaseUrl()}/${tenant.slug}/admin`;
        try {
            await sendMessage(
                signup.admin_phone,
                `ברוכים הבאים למערכת המשפטית של MelaMedia! המשרד שלכם מוכן. התחברות: ${loginUrl}`
            );
        } catch (e) {
            console.warn('[signup] SMS failed:', e?.message);
        }

        return { tenantId: tenant.id, slug: tenant.slug, adminUserId, loginUrl };
    } catch (e) {
        await client.query('ROLLBACK');
        // Leave a verified payment retryable after an atomic provisioning rollback.
        await pool.query("UPDATE signup_intents SET error_message=$2,updated_at=now() WHERE id=$1 AND status<>'completed'",
            [signupIntentId, 'השלמת ההרשמה דורשת בדיקה']).catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

async function completeSignupFromPaymentIntent(paymentIntentId, tokenInfo) {
    const res = await pool.query(
        `SELECT signup_intent_id FROM firm_payment_intents WHERE id = $1 LIMIT 1`,
        [paymentIntentId]
    );
    const signupIntentId = res.rows?.[0]?.signup_intent_id;
    if (!signupIntentId) return null;
    return provisionTenantFromSignup(signupIntentId, { tokenInfo });
}

async function syncSignup(intentId) {
    const intent = await getSignupIntent(intentId);
    if (!intent) throw Object.assign(new Error('SIGNUP_NOT_FOUND'), {code:'SIGNUP_NOT_FOUND'});
    if (intent.status === 'completed') return intent;
    const payment = (await pool.query('SELECT takbull_uniq_id FROM firm_payment_intents WHERE id=$1 AND signup_intent_id=$2',[intent.paymentIntentId,intentId])).rows[0];
    if (!payment?.takbull_uniq_id) throw Object.assign(new Error('התשלום עדיין לא אומת'),{code:'PAYMENT_NOT_VERIFIED'});
    await require('../billing/firmBillingService').handleTakbullNotification({uniqId:payment.takbull_uniq_id});
    return getSignupIntent(intentId);
}

async function completeSignupWithoutPayment(intentId) {
    throw Object.assign(new Error('נדרש חיוב שקל מאומת וכרטיס שמור'), {code:'PAYMENT_REQUIRED'});
}

module.exports = {
    TRIAL_DAYS,
    CONSENT_VERSION,
    trialEnd,
    createSignupIntent,
    getSignupIntent,
    createSignupCheckout,
    provisionTenantFromSignup,
    completeSignupFromPaymentIntent,
    syncSignup,
    completeSignupWithoutPayment,
    mapSignupRow,
};
