const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require("cors");
const express = require("express");
require("dotenv").config(); // Load environment variables

const { connectDb } = require("./config/db"); // Import the database connection function

// Import route modules
const authRoutes = require("./routes/auth");
const customerRoutes = require("./routes/customerRoutes");
const caseRoutes = require("./routes/caseRoutes");
const adminRoutes = require("./routes/adminRoutes"); // New
const caseTypeRoutes = require("./routes/caseTypeRoutes"); // New
const dataRoutes = require("./routes/dataRoutes"); // New
const notificationRoutes = require("./routes/notificationRoutes"); // New

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 5000;

// Environment specific settings (from your original file)
const isProduction = false;
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
        origin: "https://client.melamedlaw.co.il", // Replace with the allowed domain
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

// Connect to the database and then start the server
connectDb()
    .then(() => {
        // Use the route modules
        app.use("/api/auth", authRoutes);
        app.use("/api/customers", customerRoutes);
        app.use("/api/cases", caseRoutes);
        app.use("/api/admins", adminRoutes); // New
        app.use("/api/case-types", caseTypeRoutes); // New
        app.use("/api/data", dataRoutes); // New
        app.use("/api/notifications", notificationRoutes); // New

        // Start the Express server
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            getPublicIp();
        });
    })
    .catch((err) => {
        console.error("Failed to start server due to database connection error:", err);
        process.exit(1); // Exit if DB connection fails
    });

// Basic root route
app.get("/", (req, res) => {
    res.send("MelamedLaw API is running!");
});

// Global error handler (optional, but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});
