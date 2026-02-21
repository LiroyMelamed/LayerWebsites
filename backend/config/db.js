const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function buildSslConfig() {
    if (process.env.DB_SSL !== 'true') return false;
    const cfg = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
    // Optional: path to a PEM CA certificate (e.g. for RDS / self-signed certs)
    if (process.env.DB_SSL_CA_PATH) {
        cfg.ca = fs.readFileSync(path.resolve(process.env.DB_SSL_CA_PATH), 'utf8');
    }
    return cfg;
}

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: buildSslConfig(),
    max: Number.parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: Number.parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: Number.parseInt(process.env.DB_POOL_CONN_TIMEOUT_MS || '5000', 10),
});

// Test the connection (skip in tests to avoid noisy timeouts when DB isn't configured)
const shouldTestConnection =
    process.env.NODE_ENV !== 'test' &&
    String(process.env.DB_DISABLE_CONNECT_TEST || '').toLowerCase() !== 'true';

if (shouldTestConnection) {
    pool.connect((err, client) => {
        if (err) {
            console.error('Error connecting to PostgreSQL database:', err.message);
            return;
        }
        console.log('Connected to PostgreSQL database:', process.env.DB_NAME);
        client.release();
    });
}

module.exports = pool;