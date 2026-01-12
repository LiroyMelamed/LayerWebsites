async function hasColumn(db, { table, column }) {
    const res = await db.query(
        `select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = $1
           and column_name = $2
         limit 1`,
        [table, column]
    );
    return res.rowCount > 0;
}

async function userHasLegalData(db, userId) {
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) return false;

    const signerUserIdSupported = await hasColumn(db, { table: 'signaturespots', column: 'signeruserid' });

    const res = await db.query(
        `select
            exists (select 1 from audit_events where actor_userid = $1) as has_audit_events,
            exists (select 1 from signingfiles where lawyerid = $1 or clientid = $1) as has_signing_files,
            exists (select 1 from cases where userid = $1) as has_cases,
            ${signerUserIdSupported
            ? 'exists (select 1 from signaturespots where signeruserid = $1) as has_signatures'
            : 'false as has_signatures'
        }`,
        [uid]
    );

    const row = res.rows?.[0] || {};
    return Boolean(row.has_audit_events || row.has_signing_files || row.has_cases || row.has_signatures);
}

module.exports = {
    userHasLegalData,
};
