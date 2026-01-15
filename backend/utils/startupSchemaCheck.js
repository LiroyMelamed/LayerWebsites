const pool = require('../config/db');

async function checkColumnExists({ tableSchema = 'public', tableName, columnName }) {
    const res = await pool.query(
        `select 1
         from information_schema.columns
         where table_schema = $1
           and table_name = $2
           and column_name = $3
         limit 1`,
        [tableSchema, tableName, columnName]
    );
    return res.rows.length > 0;
}

async function signingSchemaStartupCheck() {
    // Keep this light: log only. No mutations.
    // In production, missing columns should be handled via migrations.
    try {
        const hasFieldType = await checkColumnExists({ tableName: 'signaturespots', columnName: 'fieldtype' });
        const hasFieldValue = await checkColumnExists({ tableName: 'signaturespots', columnName: 'fieldvalue' });

        if (hasFieldType && !hasFieldValue) {
            console.error(
                '[schema] signaturespots.fieldvalue is missing. Non-signature signing fields (date/text/phone/etc) will not persist/return until migration is applied.\n' +
                'Apply migration: backend/migrations/2026-01-15_02_signing_spot_fieldvalue.sql'
            );
        }
    } catch (e) {
        console.warn('[schema] startup schema check failed:', e?.message || e);
    }
}

module.exports = {
    signingSchemaStartupCheck,
};
