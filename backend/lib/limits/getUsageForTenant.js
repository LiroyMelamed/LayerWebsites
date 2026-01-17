const pool = require('../../config/db');

async function getUsageForTenant(tenantId) {
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum <= 0) {
        throw new Error('getUsageForTenant: tenantId must be a positive number');
    }

    // Documents usage (SigningFiles) - calendar month (UTC on DB side).
    const monthStartRes = await pool.query(`select date_trunc('month', now()) as "MonthStart"`);
    const monthStart = monthStartRes.rows?.[0]?.MonthStart || null;

    const docsRes = await pool.query(
        `select
        count(*)::int as "TotalDocuments",
        count(*) filter (where status = 'signed')::int as "SignedDocuments",
        count(*) filter (where createdat >= date_trunc('month', now()))::int as "DocumentsCreatedThisMonth",
        count(*) filter (where createdat >= date_trunc('month', now()) and status = 'signed')::int as "SignedDocumentsThisMonth"
     from signingfiles
     where lawyerid = $1`,
        [tenantIdNum]
    );

    const docs = docsRes.rows?.[0] || {
        TotalDocuments: 0,
        SignedDocuments: 0,
        DocumentsCreatedThisMonth: 0,
        SignedDocumentsThisMonth: 0,
    };

    return {
        tenantId: tenantIdNum,
        period: {
            monthStartUtc: monthStart ? new Date(monthStart).toISOString() : null,
        },
        documents: {
            total: docs.TotalDocuments,
            signed: docs.SignedDocuments,
            createdThisMonth: docs.DocumentsCreatedThisMonth,
            signedThisMonth: docs.SignedDocumentsThisMonth,
        },

        // Placeholders for future usage types.
        cases: null,
        clients: null,
        users: null,
        storageGb: null,
        notifications: null,
    };
}

module.exports = { getUsageForTenant };
