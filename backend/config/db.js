const sql = require("mssql");
require("dotenv").config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER_NAME,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
        trustedConnection: false
    },
};

let pool;

async function connectDb() {
    try {
        if (pool && pool.connected) {
            console.log("Database pool already connected.");
            return pool;
        }
        pool = await sql.connect(dbConfig);
        console.log("Connected to the database");
        return pool;
    } catch (err) {
        console.error("Error connecting to the database:", err);
        process.exit(1);
    }
}

module.exports = {
    connectDb,
    sql,
    dbConfig
};
