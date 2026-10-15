'use strict';
const crypto = require('node:crypto');
const pool = require('../../config/db');
const { decryptSecret } = require('./secrets');
const { resolvePricingLineItems, quotasForPackage, yearlyTotalIls } = require('./pricingPackage');
const { getTakbullCredentialsFromEnv } = require('../payments/takbullClient');
const { verifyChargedTransaction } = require('../payments/verifySignupPayment');
const { addIsraelCalendarMonths } = require('./calendarMonths');
const { getPublicApiBaseUrl } = require('./tenantBillingDefaults');

const pendingError = () => Object.assign(new Error('תשלום קודם עדיין בבדיקה. אין לשלם שוב עד לבירור.'), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
async function assertNoPendingPayment(client, tenantId) {
    const pending = await client.query(`SELECT id FROM firm_payment_intents WHERE law_firm_tenant_id=$1
        AND status='pending' AND kind<>'setup' AND signup_intent_id IS NULL LIMIT 1`, [tenantId]);
    if (pending.rowCount) throw pendingError();
}

// Shared self-service agreements use a durable reservation before calling the
// provider. Legacy dedicated-account billing remains on its existing path.
async function chargeSelfServiceUpgrade({ tenantId, target, interval, amount, charge }) {
    const priced = resolvePricingLineItems(target);
    const expected = interval === 'yearly' ? yearlyTotalIls(priced.total) : priced.total;
    if (!Number.isFinite(amount) || amount !== expected || amount <= 0) throw Error('UPGRADE_AMOUNT_MISMATCH');
    const credentials = getTakbullCredentialsFromEnv();
    if (!credentials) throw Object.assign(new Error('סליקה אינה זמינה כרגע'), { code: 'TAKBULL_NOT_CONFIGURED' });
    const client = await pool.connect();
    let intent, account, card;
    try {
        await client.query('BEGIN');
        account = (await client.query('SELECT * FROM firm_billing WHERE law_firm_tenant_id=$1 FOR UPDATE', [tenantId])).rows[0];
        await assertNoPendingPayment(client, tenantId);
        if (account?.platform_id === target.platformId && account.resource_id === target.resourceId &&
            account.signing_id === target.signingId && account.billing_interval === interval) {
            await client.query('COMMIT');
            return { ok: true, alreadyApplied: true, appliedAtomically: true, charged: false };
        }
        if (!account?.billing_enabled || ['past_due', 'suspended'].includes(account.status) ||
            (account.renews_at && new Date(account.renews_at) <= new Date())) {
            throw Object.assign(new Error('יש להסדיר את החיוב הקיים לפני שינוי החבילה.'), { code: 'BILLING_RECOVERY_REQUIRED' });
        }
        card = (await client.query('SELECT token_encrypted FROM firm_payment_methods WHERE law_firm_tenant_id=$1 AND is_active', [tenantId])).rows[0];
        if (!card) throw Object.assign(new Error('נדרש כרטיס שמור'), { code: 'CARD_REQUIRED' });
        const snapshot = { ...target, billingInterval: interval, selfServiceOperation: 'upgrade' };
        intent = (await client.query(`INSERT INTO firm_payment_intents
            (id,law_firm_tenant_id,kind,status,amount_ils,order_reference,purpose,package_snapshot)
            VALUES($1,$2,$3,'pending',$4,$5,$6,$7) RETURNING *`, [crypto.randomUUID(), tenantId,
            interval === 'yearly' ? 'annual' : 'upgrade', amount, 'signup-upgrade-' + crypto.randomUUID(),
            'שינוי חבילה — מערכת משפטית', JSON.stringify(snapshot)])).rows[0];
        await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }

    try {
        const result = await charge({ credentials, orderReference: intent.order_reference, amount, currency: 'ILS',
            cardExternalToken: decryptSecret(card.token_encrypted),
            ipnAddress: getPublicApiBaseUrl() + '/api/webhooks/payments/takbull', purpose: intent.purpose });
        if (!result.ok) {
            await pool.query("UPDATE firm_payment_intents SET status='failed',error_message='החיוב נדחה; החבילה הקיימת נשמרה',updated_at=now() WHERE id=$1 AND status='pending'", [intent.id]);
            throw Object.assign(new Error('החיוב נדחה. החבילה הקיימת נשמרה ולא בוצע שינוי.'), { code: 'PAYMENT_DECLINED' });
        }
        if (!result.transactionInternalNumber) throw Error('UPGRADE_OUTCOME_UNKNOWN');
        await pool.query('UPDATE firm_payment_intents SET takbull_transaction_id=$2,updated_at=now() WHERE id=$1', [intent.id, result.transactionInternalNumber]);
        await verifyChargedTransaction(credentials, result.transactionInternalNumber, amount);
        const settle = await pool.connect();
        try {
            await settle.query('BEGIN');
            await settle.query('SELECT id FROM firm_billing WHERE law_firm_tenant_id=$1 FOR UPDATE', [tenantId]);
            const current = (await settle.query('SELECT status FROM firm_payment_intents WHERE id=$1 FOR UPDATE', [intent.id])).rows[0];
            if (current?.status !== 'pending') throw Error('UPGRADE_RESERVATION_CHANGED');
            const now = new Date();
            const from = interval === 'yearly' ? new Date(Math.max(+now, +new Date(account.renews_at || 0))) : now;
            const renewsAt = addIsraelCalendarMonths(from, interval === 'yearly' ? 12 : 1);
            await settle.query(`UPDATE firm_billing SET platform_id=$2,resource_id=$3,signing_id=$4,
                price_monthly_ils=$5,billing_interval=$6,status='active',renews_at=$7,last_paid_at=now(),
                grace_until=null,last_failed_at=null,last_payment_error=null,updated_at=now() WHERE law_firm_tenant_id=$1`,
            [tenantId, target.platformId, target.resourceId, target.signingId, priced.total, interval, renewsAt]);
            await settle.query(`INSERT INTO tenant_subscriptions(tenant_id,plan_key,status,starts_at,updated_at,created_at)
                SELECT userid,$2,'active',now(),now(),now() FROM users WHERE law_firm_tenant_id=$1 AND role='Admin'
                ORDER BY userid LIMIT 1 ON CONFLICT(tenant_id) DO UPDATE SET plan_key=EXCLUDED.plan_key,status='active',updated_at=now()`,
            [tenantId, quotasForPackage(priced).planKey]);
            await settle.query("UPDATE firm_payment_intents SET status='succeeded',settled_at=now(),error_message=null,updated_at=now() WHERE id=$1", [intent.id]);
            await settle.query("INSERT INTO firm_payment_events(intent_id,event_type,payload) VALUES($1,'payment_succeeded','{}'::jsonb)", [intent.id]);
            await settle.query('COMMIT');
        } catch (error) { await settle.query('ROLLBACK'); throw error; }
        finally { settle.release(); }
        return { ok: true, charged: true, appliedAtomically: true, intentId: intent.id };
    } catch (error) {
        await pool.query("UPDATE firm_payment_intents SET error_message='תוצאת החיוב דורשת בירור; אין לחייב שוב',updated_at=now() WHERE id=$1 AND status='pending'", [intent.id]);
        throw error;
    }
}
module.exports = { chargeSelfServiceUpgrade, assertNoPendingPayment };
