const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') })

// Direct import of the pg pool instance from a local configuration file
const pool = require("./config/db");

// Import all route handlers for the different parts of the API
const authRoutes = require("./routes/auth");
const customerRoutes = require("./routes/customerRoutes");
const caseRoutes = require("./routes/caseRoutes");
const adminRoutes = require("./routes/adminRoutes");
const caseTypeRoutes = require("./routes/caseTypeRoutes");
const dataRoutes = require("./routes/dataRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

// Initialize the Express application
const app = express();

// Configure body parsers to handle large request payloads
// This is useful for things like image uploads (e.g., base64 strings for profile pictures)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Set the port from environment variables or default to 5000
const PORT = process.env.PORT || 5000;

// Determine if the application is in production mode
const isProduction = process.env.IS_PRODUCTION === 'true';

/**
 * A utility function to select a value based on the application's environment.
 * @param {any} forProduction - The value to use in production.
 * @param {any} forStage - The value to use in development/staging.
 * @returns {any} The selected value.
 */
function selectMode(forProduction, forStage) {
    return isProduction ? forProduction : forStage;
}

// Define allowed origins for CORS
const productionOrigin = [
    "https://client.melamedlaw.co.il/",
    "https://client.melamedlaw.co.il",
];
const stageOrigin = [
    "http://localhost:3001",
    "https://client.melamedlaw.co.il",
];

// The list of origins allowed to access the API.
// Note: Using `origin: "*"` in the code below might override this dynamic list
const allowedOrigins = selectMode(productionOrigin, stageOrigin);

// Use the CORS middleware to enable cross-origin requests
// The current configuration allows requests from any origin (`*`).
// For security, it's highly recommended to use the `allowedOrigins` variable here.
app.use(
    cors({
        origin: "*", // Consider changing this to `allowedOrigins` for production
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);

// This line is a duplicate of the bodyParser.json() above, but is a common practice
// for simple JSON handling. It can be removed if bodyParser is already configured.
app.use(express.json());

/**
 * Fetches and logs the public IP address of the server.
 * This is a useful utility for debugging and monitoring.
 */
async function getPublicIp() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        console.log('Public IP:', response.data.ip);
    } catch (error) {
        console.error('Error getting public IP:', error);
    }
}

// Route registration
// The `app.use` calls associate a base path with a specific router file,
// effectively organizing the API into logical sections.
app.use("/api/Auth", authRoutes);
app.use("/api/Customers", customerRoutes);
app.use("/api/Cases", caseRoutes);
app.use("/api/Admins", adminRoutes);
app.use("/api/CaseTypes", caseTypeRoutes);
app.use("/api/Data", dataRoutes);
app.use("/api/Notifications", notificationRoutes);

// Start the server and listen on the specified port.
// The `getPublicIp` function is called once the server has started.
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await getPublicIp();
});

// A simple root route to confirm the API is running
app.get("/", (req, res) => {
    res.send("MelamedLaw API is running!");
});

// Global error handling middleware
// This will catch any unhandled errors from the routes and send a 500 response.
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Handle graceful server shutdown on a SIGINT signal (e.g., Ctrl+C)
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // Close the database connection pool gracefully
    await pool.end();
    console.log('Database pool closed.');
    // Exit the process
    process.exit(0);
});
