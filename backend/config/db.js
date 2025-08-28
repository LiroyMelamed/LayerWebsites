const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config(); // Load environment variables from .env

const pool = new Pool({
    user: process.env.DB_USER,        // liroym
    host: process.env.DB_HOST || 'localhost', // Usually 'localhost' for local dev
    database: process.env.DB_NAME,    // MelamedLaw
    password: process.env.DB_PASSWORD, // Lm@@062025!!
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
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