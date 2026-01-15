const axios = require('axios');
const app = require('./app');
const { signingSchemaStartupCheck } = require('./utils/startupSchemaCheck');

const PORT = process.env.PORT || 5000;

const SERVER_REQUEST_TIMEOUT_MS = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 60_000);
const SERVER_HEADERS_TIMEOUT_MS = Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 65_000);
const SERVER_KEEPALIVE_TIMEOUT_MS = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 5_000);

async function getPublicIp() {
    try {
        const { data } = await axios.get('https://api.ipify.org?format=json', {
            timeout: 5000,
        });
        if (data?.ip) {
            console.log(`Public IP: ${data.ip}`);
        }
    } catch (e) {
        console.warn('Public IP check failed:', e?.message);
    }
}

const server = app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await getPublicIp();
    await signingSchemaStartupCheck();
});

// Hard timeouts at the Node server layer (useful behind Nginx).
// These defaults are conservative and can be tuned via env.
if (Number.isFinite(SERVER_REQUEST_TIMEOUT_MS) && SERVER_REQUEST_TIMEOUT_MS > 0) {
    server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;
}
if (Number.isFinite(SERVER_HEADERS_TIMEOUT_MS) && SERVER_HEADERS_TIMEOUT_MS > 0) {
    server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
}
if (Number.isFinite(SERVER_KEEPALIVE_TIMEOUT_MS) && SERVER_KEEPALIVE_TIMEOUT_MS > 0) {
    server.keepAliveTimeout = SERVER_KEEPALIVE_TIMEOUT_MS;
}
