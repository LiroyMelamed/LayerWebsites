// Schema inspection utility for pp-cleanup-customers-preserve-phone.js
const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

let dbConfig = {};
if (process.env.DATABASE_URL) {
    dbConfig.connectionString = process.env.DATABASE_URL;
} else {
    dbConfig = {
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT),
        ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true',
    };
}
const pool = new Pool(dbConfig);

async function getSchemaInfo() {
    const tables = [
        'users',
        'cases',
        'signingfiles',
        'audit_events',
        'signaturespots',
        'signing_consents',
        'signing_otp_challenges'
    ];
    const schema = {};
    for (const table of tables) {
        const { rows } = await pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table]);
        schema[table] = rows.map(r => r.column_name);
    }
    console.log(JSON.stringify(schema, null, 2));
    await pool.end();
}
getSchemaInfo().catch(console.error);
