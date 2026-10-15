const crypto = require('node:crypto');
const pool = require('../../config/db');
const { formatPhoneNumber } = require('../../utils/phoneUtils');
const {
    resolvePricingLineItems,
    normalizeBillingInterval,
} = require('../billing/pricingPackage');
const { encryptSecret } = require('../billing/secrets');
const {
    createTakbullPaymentPage,
    getTakbullCredentialsFromEnv,
} = require('../payments/takbullClient');
const { getPublicApiBaseUrl, getFrontendBaseUrl } = require('../billing/tenantBillingDefaults');
const { createTenant, slugAvailable } = require('./tenantService');
const { isValidSlug, normalizeSlug } = require('./tenantContext');
const { sendMessage } = require('../../utils/sendMessage');

const TRIAL_DAYS = Number(process.env.SIGNUP_TRIAL_DAYS || 90);
const SETUP_AMOUNT_ILS = 1;

function addDays(from, days) {
    const d = new Date(from.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

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
        status: row.status,
        tenantId: row.law_firm_tenant_id,
        paymentIntentId: row.payment_intent_id,
        createdAt: row.created_at,
    };
}

async function createSignupIntent(payload) {
    const slug = normalizeSlug(payload.slug);
    const firmName = String(payload.firmName || '').trim();
    const adminName = String(payload.adminName || '').trim();
    const adminPhone = formatPhoneNumber(payload.adminPhone) || String(payload.adminPhone || '').trim();
    const adminEmail = String(payload.adminEmail || '').trim() || null;
    const platformId = payload.platformId || 'site_app';
    const resourceId = payload.resourceId || 'pro';
    const signingId = payload.signingId || '500';
    const billingInterval = normalizeBillingInterval(payload.billingInterval || 'monthly');
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
    if (!(await slugAvailable(slug))) {
        const err = new Error('כתובת המשרד כבר תפוסה');
        err.code = 'SLUG_TAKEN';
        throw err;
    }

    const pkg = resolvePricingLineItems({ platformId, resourceId, signingId });

    const res = await pool.query(
        `INSERT INTO signup_intents (
            slug, firm_name, admin_name, admin_phone, admin_email,
            lawyer_count, practice_areas,
            platform_id, resource_id, signing_id, billing_interval, price_monthly_ils
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
            pkg.total,
        ]
    );
    return mapSignupRow(res.rows[0]);
}

async function getSignupIntent(id) {
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
    const intent = await getSignupIntent(intentId);
    if (!intent) {
        const err = new Error('SIGNUP_NOT_FOUND');
        err.code = 'SIGNUP_NOT_FOUND';
        throw err;
    }
    if (intent.status !== 'pending_payment') {
        const err = new Error('SIGNUP_NOT_PENDING');
        err.code = 'SIGNUP_NOT_PENDING';
        throw err;
    }

    const creds = getTakbullCredentialsFromEnv();
    if (!creds) {
        const err = new Error('TAKBULL_NOT_CONFIGURED');
        err.code = 'TAKBULL_NOT_CONFIGURED';
        throw err;
    }

    const orderReference = `signup-${intent.id}-${Date.now()}`;
    const intentRes = await pool.query(
        `INSERT INTO firm_payment_intents (id, kind, status, amount_ils, purpose, order_reference, signup_intent_id, package_snapshot)
         VALUES ($1, 'setup', 'pending', $2, $3, $4, $5, $6)
         RETURNING id`,
        [
            crypto.randomUUID(),
            SETUP_AMOUNT_ILS,
            'אימות כרטיס — פתיחת משרד (3 חודשים חינם)',
            orderReference,
            intent.id,
            JSON.stringify({
                platformId: intent.platformId,
                resourceId: intent.resourceId,
                signingId: intent.signingId,
                billingInterval: intent.billingInterval,
            }),
        ]
    );
    const paymentIntentId = intentRes.rows[0].id;

    const page = await createTakbullPaymentPage({
        credentials: creds,
        orderReference,
        amount: SETUP_AMOUNT_ILS,
        currency: 'ILS',
        redirectAddress: signupReturnUrl(intent.id),
        cancelReturnAddress: signupCancelUrl(intent.id),
        ipnAddress: signupIpnUrl(),
        purpose: 'אימות כרטיס אשראי — MelamedLaw',
        saveToken: true,
        customerFullName: intent.adminName,
        customerPhone: intent.adminPhone,
        customerEmail: intent.adminEmail,
    });

    await pool.query(
        `UPDATE firm_payment_intents SET takbull_uniq_id = $2, updated_at = now() WHERE id = $1`,
        [paymentIntentId, page.uniqId]
    );
    await pool.query(
        `UPDATE signup_intents SET payment_intent_id = $2, updated_at = now() WHERE id = $1`,
        [intent.id, paymentIntentId]
    );

    return {
        intentId: intent.id,
        paymentIntentId,
        redirectUrl: page.redirectUrl,
        amount: SETUP_AMOUNT_ILS,
    };
}

async function provisionTenantFromSignup(signupIntentId, { tokenInfo } = {}) {
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
                { firmDisplayName: signup.firm_name },
            ]
        );
        const tenant = tenantRes.rows[0];
        const complimentaryUntil = addDays(new Date(), TRIAL_DAYS);

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
            const encrypted = encryptSecret(tokenInfo.token);
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
                `ברוכים הבאים ל-MelamedLaw! המשרד שלכם מוכן. התחברות: ${loginUrl}`
            );
        } catch (e) {
            console.warn('[signup] SMS failed:', e?.message);
        }

        return { tenantId: tenant.id, slug: tenant.slug, adminUserId, loginUrl };
    } catch (e) {
        await client.query('ROLLBACK');
        await pool.query(
            `UPDATE signup_intents SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1`,
            [signupIntentId, String(e?.message || e)]
        ).catch(() => {});
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

module.exports = {
    TRIAL_DAYS,
    createSignupIntent,
    getSignupIntent,
    createSignupCheckout,
    provisionTenantFromSignup,
    completeSignupFromPaymentIntent,
    mapSignupRow,
};
