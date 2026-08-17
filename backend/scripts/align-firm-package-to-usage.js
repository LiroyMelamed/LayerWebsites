#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Align this tenant's commercial pack to the cheapest pack that fits live usage.
 *
 * Dry-run by default. Writes only with --apply. SMS only with --sms.
 * Melamedia is left as-is (QA demo). Idm is updated but never SMS'd (charges off).
 *
 * Usage:  cd <tenant>/backend && node scripts/align-firm-package-to-usage.js [--apply] [--sms]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../config/db');
const { getUsageForFirm } = require('../lib/limits/getUsageForFirm');
const { recommendCheapestPackage } = require('../lib/billing/pricingPackage');
const {
    ensureBillingRow,
    updateBilling,
    syncTenantSubscription,
} = require('../lib/billing/firmBillingService');
const { getTenantSlug, defaultBillingEnabled } = require('../lib/billing/tenantBillingDefaults');
const { nationalLast9 } = require('../lib/limits/seatExclusions');
const { formatPhoneNumber } = require('../utils/phoneUtils');
const { sendMessage } = require('../utils/sendMessage');
const settingsService = require('../services/settingsService');

const APPLY = process.argv.includes('--apply');
const SEND_SMS = process.argv.includes('--sms');
const EXCLUDED_LAST9 = '507299064';

function formatIls(amount) {
    return Number(amount || 0).toLocaleString('he-IL');
}

function formatDateHe(value) {
    if (!value) return '';
    try {
        return new Intl.DateTimeFormat('he-IL', {
            timeZone: 'Asia/Jerusalem',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }).format(new Date(value));
    } catch {
        return String(value);
    }
}

function buildSms({ displayName, total, complimentaryUntil }) {
    const date = formatDateHe(complimentaryUntil);
    const dateLine = date
        ? `מחיר: ₪${formatIls(total)} לחודש (חיוב מלא מ-${date})`
        : `מחיר: ₪${formatIls(total)} לחודש`;
    return [
        'שלום, עדכנו את חבילת המשרד לפי השימוש בפועל.',
        `חבילה: ${displayName}`,
        dateLine,
        'פרטים במערכת: תוכנית ושימוש',
    ].join('\n');
}

async function uniqueAdminPhones() {
    const admins = await settingsService.getPlatformAdmins();
    const seen = new Set();
    const out = [];
    for (const admin of admins || []) {
        const e164 = formatPhoneNumber(admin.phone);
        if (!e164) continue;
        const last9 = nationalLast9(e164);
        if (last9 === EXCLUDED_LAST9) continue;
        if (seen.has(last9)) continue;
        seen.add(last9);
        out.push({ name: admin.user_name || admin.name || '', phone: e164, last9 });
    }
    return out;
}

async function main() {
    const slug = getTenantSlug();
    const usage = await getUsageForFirm();
    const row = await ensureBillingRow();
    if (!row) {
        console.error('No firm_billing row');
        process.exit(1);
    }

    const rec = recommendCheapestPackage({
        current: {
            platformId: row.platformId,
            resourceId: row.resourceId,
            signingId: row.signingId,
        },
        usage: usage || {},
    });

    const billingEnabled = row.billingEnabled !== false && defaultBillingEnabled(slug);
    const skipApply = slug === 'melamedia';
    const skipSms = !billingEnabled || slug === 'idm' || slug === 'melamedia';

    const seats = Number(usage?.seats?.used || 0);
    const storageMb = (Number(usage?.storage?.bytesTotal || 0) / (1024 * 1024)).toFixed(1);
    const docs = Number(usage?.documents?.createdThisMonth || 0);
    const sms = Number(usage?.sms?.sentThisMonth || 0);

    console.log(JSON.stringify({
        slug,
        apply: APPLY,
        sms: SEND_SMS,
        skipApply,
        skipSms,
        billingEnabled,
        complimentaryUntil: row.complimentaryUntil,
        usage: { seats, storageMb, docs, sms },
        current: {
            platformId: rec.current.platformId,
            resourceId: rec.current.resourceId,
            signingId: rec.current.signingId,
            total: rec.current.total,
            displayName: rec.current.displayName,
        },
        recommended: {
            platformId: rec.recommended.platformId,
            resourceId: rec.recommended.resourceId,
            signingId: rec.recommended.signingId,
            total: rec.recommended.total,
            displayName: rec.recommended.displayName,
        },
        changed: rec.changed,
    }, null, 2));

    if (skipApply) {
        console.log('Skip apply: Melamedia QA demo stays on current pack');
        return;
    }

    if (!APPLY) {
        console.log('Dry-run. Re-run with --apply to write, --sms to notify platform admins.');
        return;
    }

    if (rec.changed) {
        await updateBilling({
            platform_id: rec.recommended.platformId,
            resource_id: rec.recommended.resourceId,
            signing_id: rec.recommended.signingId,
            price_monthly_ils: rec.recommended.total,
        });
        console.log('Updated firm_billing');
    } else {
        console.log('Pack already matches usage; still syncing tenant_subscriptions');
    }
    await syncTenantSubscription(rec.recommended);
    console.log('Synced tenant_subscriptions to', rec.recommended.resource?.planKey);

    if (!SEND_SMS) {
        console.log('No SMS (pass --sms to send)');
        return;
    }
    if (skipSms) {
        console.log('Skip SMS: unbilled tenant or QA');
        return;
    }
    if (!rec.changed) {
        console.log('Skip SMS: pack unchanged');
        return;
    }

    const recipients = await uniqueAdminPhones();
    if (recipients.length === 0) {
        console.log('Skip SMS: no unique platform-admin phone besides excluded owner');
        return;
    }

    const body = buildSms({
        displayName: rec.recommended.displayName,
        total: rec.recommended.total,
        complimentaryUntil: row.complimentaryUntil,
    });
    for (const r of recipients) {
        const result = await sendMessage(body, r.phone);
        console.log('SMS', r.name, 'last9', r.last9, result?.ok ? 'ok' : result);
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        try { await pool.end(); } catch { /* ignore */ }
    });
