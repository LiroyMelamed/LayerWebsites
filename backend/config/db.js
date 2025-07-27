const sql = require("mssql");

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER_NAME,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};

let pool;

const connectToDatabase = async () => {
    if (!pool) {
        pool = await sql.connect(dbConfig);
        console.log("✅ Connected to database");
    }
    return pool;
};

const getDbPool = () => pool;

module.exports = {
    connectToDatabase,
    getDbPool,
    sql,
};
