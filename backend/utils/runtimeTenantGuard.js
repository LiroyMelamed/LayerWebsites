const { execSync } = require('child_process');
const path = require('path');

const BRANCH_TENANT_HINTS = {
    MelamedLaw: ['melamed', 'ליאב מלמד'],
    MorLevi: ['mor levy', 'מור לוי'],
    AshrafEssa: ['ashraf', 'עאשרף', 'אשרף'],
};

function detectCurrentBranch() {
    if (process.env.GIT_BRANCH) return String(process.env.GIT_BRANCH).trim();
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: path.join(__dirname, '..'),
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString()
            .trim();
    } catch (_) {
        return null;
    }
}

function tenantLooksValid(branch, companyName, lawFirmName) {
    const hints = BRANCH_TENANT_HINTS[branch];
    if (!hints || !hints.length) return true;

    const haystack = `${String(companyName || '').toLowerCase()} ${String(lawFirmName || '').toLowerCase()}`;
    return hints.some((h) => haystack.includes(String(h).toLowerCase()));
}

async function assertRuntimeTenantMatchesBranch(pool) {
    const enabled = String(process.env.BRANCH_TENANT_GUARD_ENABLED || 'true').toLowerCase();
    if (enabled === 'false' || enabled === '0') return;

    const branch = detectCurrentBranch();
    if (!branch) return;
    if (!BRANCH_TENANT_HINTS[branch]) return;

    try {
        const { rows } = await pool.query(
            `SELECT setting_key, setting_value
             FROM platform_settings
             WHERE category = 'firm'
               AND setting_key IN ('COMPANY_NAME', 'LAW_FIRM_NAME')`
        );

        const byKey = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
        const companyName = byKey.COMPANY_NAME || '';
        const lawFirmName = byKey.LAW_FIRM_NAME || '';

        if (tenantLooksValid(branch, companyName, lawFirmName)) {
            console.log(`[tenant-guard] OK. branch=${branch} tenant=${companyName || lawFirmName || 'unknown'}`);
            return;
        }

        const err = new Error(
            `[tenant-guard] Branch/DB mismatch detected. branch=${branch}, COMPANY_NAME=${companyName || '<empty>'}, LAW_FIRM_NAME=${lawFirmName || '<empty>'}. Update backend/.env DB_* to the correct tenant DB.`
        );
        err.code = 'TENANT_BRANCH_MISMATCH';
        throw err;
    } catch (err) {
        if (err?.code === '42P01') {
            // platform_settings not migrated yet; skip guard for fresh DBs
            return;
        }
        throw err;
    }
}

module.exports = { assertRuntimeTenantMatchesBranch };
