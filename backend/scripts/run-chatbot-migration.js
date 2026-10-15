// Temporary script to run the chatbot migration
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const tls = require('tls');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

// Trim \r from env vars (Windows-style line endings in .env)
const trimEnv = (key) => (process.env[key] || '').trim().replace(/\r/g, '');
const sslCfg = trimEnv('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false;
const dbHost = trimEnv('DB_HOST') || 'localhost';

// Resolve hostname to IPv4 first, then connect using IP (workaround for macOS getaddrinfo ENOTFOUND)
async function run() {
    let host = dbHost;
    try {
        const addrs = await dns.promises.resolve4(dbHost);
        if (addrs && addrs.length > 0) {
            host = addrs[0];
            console.log(`Resolved ${dbHost} -> ${host}`);
        }
    } catch (e) { console.error('DNS resolve failed:', e.message); }

    console.log('Connecting to:', host, 'port:', process.env.DB_PORT || 5432, 'db:', process.env.DB_NAME, 'ssl:', !!sslCfg);

    const pool = new Pool({
        user: trimEnv('DB_USER'),
        host: host,
        database: trimEnv('DB_NAME'),
        password: trimEnv('DB_PASSWORD'),
        port: trimEnv('DB_PORT') || 5432,
        ssl: sslCfg ? { rejectUnauthorized: false, servername: dbHost } : false,
        connectionTimeoutMillis: 15000,
    });

    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '2026-03-14_00_chatbot_sessions_and_messages.sql'), 'utf8');

    try {
        await pool.query(sql);
        console.log('Migration completed successfully');
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

run();
