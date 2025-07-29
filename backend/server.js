const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require("cors");
const express = require("express");
require("dotenv").config();

const { connectDb } = require("./config/db");

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

const isProduction = false;
module.exports.isProduction = isProduction;

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
        origin: "*",
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

connectDb()
    .then(() => {
        app.use("/api/Auth", authRoutes);
        app.use("/api/Customers", customerRoutes);
        app.use("/api/Cases", caseRoutes);
        app.use("/api/Admins", adminRoutes);
        app.use("/api/CaseTypes", caseTypeRoutes);
        app.use("/api/Data", dataRoutes);
        app.use("/api/Notifications", notificationRoutes);

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            getPublicIp();
        });
    })
    .catch((err) => {
        console.error("Failed to start server due to database connection error:", err);
        process.exit(1);
    });

app.get("/", (req, res) => {
    res.send("MelamedLaw API is running!");
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});
