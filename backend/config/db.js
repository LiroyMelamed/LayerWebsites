const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: Number.parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: Number.parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: Number.parseInt(process.env.DB_POOL_CONN_TIMEOUT_MS || '5000', 10),
});

// Test the connection
pool.connect((err, client, done) => {
    if (err) {
        console.error('Error connecting to PostgreSQL database:', err.message);
        return;
    }
    console.log('Connected to PostgreSQL database:', process.env.DB_NAME);
    client.release();
});

module.exports = pool;