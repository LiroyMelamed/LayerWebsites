#!/usr/bin/env node
/**
 * Seed lawyer multi-tenant platform: showcase tenant + global master admin.
 *
 * Usage (on LawyerPlatform server):
 *   cd backend && node scripts/seed-lawyer-platform.js
 *
 * Env:
 *   SEED_TENANT_SLUG=melamedia (default)
 *   SEED_MASTER_PHONE=0507299064 (optional — platform master for /admin/master)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const pool = require('../config/db');
const { createTenant } = require('../lib/tenant/tenantService');
const { formatPhoneNumber } = require('../utils/phoneUtils');

const TENANT_SLUG = process.env.SEED_TENANT_SLUG || 'melamedia';
const MASTER_PHONE = formatPhoneNumber(process.env.SEED_MASTER_PHONE || process.env.PLATFORM_ADMIN_PHONES?.split(',')[0]?.trim() || '');
const TRIAL_DAYS = Number(process.env.SIGNUP_TRIAL_DAYS || 90);

function addDays(from, days) {
    const d = new Date(from.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

async function ensureShowcaseTenant() {
    const existing = await pool.query(
        `SELECT id, slug FROM law_firm_tenants WHERE lower(slug) = $1 LIMIT 1`,
        [TENANT_SLUG.toLowerCase()]
    );
    if (existing.rows[0]) {
        console.log('[seed-lawyer] showcase tenant exists:', existing.rows[0].slug);
        return existing.rows[0].id;
    }

    const tenant = await createTenant({
        slug: TENANT_SLUG,
        name: 'Melamedia Demo',
        adminPhone: '0501234567',
        adminEmail: 'demo@melamedia.co.il',
        practiceAreas: ['נזיקין', 'משפחה'],
        lawyerCount: 3,
        branding: {
            firmDisplayName: 'Melamedia Demo',
            logoUrl: '/tenants/lawyer/logo.png',
        },
    });

    const complimentaryUntil = addDays(new Date(), TRIAL_DAYS);
    await pool.query(
        `INSERT INTO firm_billing (
            platform_id, resource_id, signing_id, price_monthly_ils,
            status, billing_enabled, complimentary_until, renews_at,
            law_firm_tenant_id, billing_interval
         ) VALUES ('site_app','pro','500',296,'complimentary',true,$1,$1,$2,'monthly')
         ON CONFLICT DO NOTHING`,
        [complimentaryUntil, tenant.id]
    );

    let adminRes = await pool.query(
        `SELECT userid FROM users WHERE phonenumber = '0501234567' AND law_firm_tenant_id = $1 LIMIT 1`,
        [tenant.id]
    );
    if (!adminRes.rows[0]) {
        adminRes = await pool.query(
            `INSERT INTO users (name, phonenumber, email, role, law_firm_tenant_id)
             VALUES ('מנהל דמו', '0501234567', 'demo@melamedia.co.il', 'Admin', $1)
             RETURNING userid`,
            [tenant.id]
        );
    }
    const adminUserId = adminRes.rows[0]?.userid;
    if (adminUserId) {
        await pool.query(
            `INSERT INTO platform_admins (user_id, is_active) VALUES ($1, true)
             ON CONFLICT (user_id) DO UPDATE SET is_active = true`,
            [adminUserId]
        );
    }

    console.log('[seed-lawyer] created showcase tenant:', tenant.slug);
    return tenant.id;
}

async function ensureGlobalMaster() {
    if (!MASTER_PHONE) {
        console.warn('[seed-lawyer] skip global master — set SEED_MASTER_PHONE or PLATFORM_ADMIN_PHONES');
        return;
    }

    let userRes = await pool.query(
        `SELECT userid, name FROM users WHERE phonenumber = $1 LIMIT 1`,
        [MASTER_PHONE]
    );
    let userId = userRes.rows[0]?.userid;

    if (!userId) {
        const ins = await pool.query(
            `INSERT INTO users (name, phonenumber, role)
             VALUES ('Platform Master', $1, 'Admin')
             RETURNING userid`,
            [MASTER_PHONE]
        );
        userId = ins.rows[0].userid;
        console.log('[seed-lawyer] created master user for', MASTER_PHONE);
    }

    await pool.query(
        `INSERT INTO global_platform_masters (userid, is_active)
         VALUES ($1, true)
         ON CONFLICT (userid) DO UPDATE SET is_active = true`,
        [userId]
    );
    await pool.query(
        `INSERT INTO platform_admins (user_id, is_active) VALUES ($1, true)
         ON CONFLICT (user_id) DO UPDATE SET is_active = true`,
        [userId]
    );
    console.log('[seed-lawyer] global platform master ready for', MASTER_PHONE);
}

async function main() {
    const dbName = process.env.DB_NAME || process.env.PGDATABASE || '';
    if (!String(process.env.MULTI_TENANT_MODE || '').toLowerCase().includes('true')) {
        console.warn('[seed-lawyer] MULTI_TENANT_MODE is not true — continuing anyway');
    }
    console.log('[seed-lawyer] database:', dbName);

    const tableCheck = await pool.query(
        `SELECT to_regclass('public.law_firm_tenants') AS tenants`
    );
    if (!tableCheck.rows[0]?.tenants) {
        throw new Error('law_firm_tenants missing — run migrations first');
    }

    await ensureShowcaseTenant();
    await ensureGlobalMaster();
    console.log('[seed-lawyer] done');
}

main()
    .catch((err) => {
        console.error('[seed-lawyer] FAILED', err);
        process.exit(1);
    })
    .finally(() => pool.end());
