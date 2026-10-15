/**
 * Production tenants run PostgreSQL on the VPS (localhost / 127.0.0.1).
 * Neon (*.neon.tech) is for local dev / test DB clones only — never production PM2.
 */

function isProductionRuntime() {
    if (process.env.NODE_ENV === 'test') return false;
    return (
        process.env.NODE_ENV === 'production'
        || String(process.env.IS_PRODUCTION || '').toLowerCase() === 'true'
    );
}

function databaseEnvFingerprint() {
    return [
        process.env.DB_HOST,
        process.env.DATABASE_URL,
        process.env.PGHOST,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function looksLikeNeonDatabaseEnv() {
    return databaseEnvFingerprint().includes('neon.tech');
}

function assertProductionDatabaseNotNeon() {
    if (!isProductionRuntime() || !looksLikeNeonDatabaseEnv()) return;
    throw new Error(
        '[db] Production must not use Neon Postgres. Use on-VPS PostgreSQL (DB_HOST=localhost or 127.0.0.1). '
        + 'Neon is for local testing via backend/scripts/sync-prod-to-*-neon.sh only.'
    );
}

module.exports = {
    isProductionRuntime,
    looksLikeNeonDatabaseEnv,
    assertProductionDatabaseNotNeon,
};
