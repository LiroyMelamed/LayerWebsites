const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') })

const pool = require("./config/db");

const authRoutes = require("./routes/auth");
const customerRoutes = require("./routes/customerRoutes");
const caseRoutes = require("./routes/caseRoutes");
const adminRoutes = require("./routes/adminRoutes");
const caseTypeRoutes = require("./routes/caseTypeRoutes");
const dataRoutes = require("./routes/dataRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 5000;

const isProduction = process.env.IS_PRODUCTION === 'true';

function selectMode(forProduction, forStage) {
    return isProduction ? forProduction : forStage;
}

const productionOrigin = [
    "https://client.melamedlaw.co.il/",
    "https://client.melamedlaw.co.il",
];
const stageOrigin = [
    "http://localhost:3000",
    "https://client.melamedlaw.co.il",
];

const allowedOrigins = selectMode(productionOrigin, stageOrigin);

app.use(
    cors({
        // Allow only configured origins. If no origin (e.g. same-origin or curl), allow it.
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            // Reject unknown origin
            return callback(new Error('Not allowed by CORS'));
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);

app.use(express.json());

async function getPublicIp() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        console.log('Public IP:', response.data.ip);
    } catch (error) {
        console.error('Error getting public IP:', error);
    }
}


app.use("/api/Auth", authRoutes);
app.use("/api/Customers", customerRoutes);
app.use("/api/Cases", caseRoutes);
app.use("/api/Admins", adminRoutes);
app.use("/api/CaseTypes", caseTypeRoutes);
app.use("/api/Data", dataRoutes);
app.use("/api/Notifications", notificationRoutes);

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await getPublicIp();
});

app.get("/", (req, res) => {
    res.send("MelamedLaw API is running!");
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await pool.end();
    console.log('Database pool closed.');
    process.exit(0);
});
