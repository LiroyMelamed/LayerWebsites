import axios from "axios";

const prodURL = "https://api.calls.melamedlaw.co.il/api";
const stageURL = "http://localhost:5000/api";

function normalizeBaseUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
    // CRA exposes REACT_APP_* env vars at build time.
    const fromEnv = normalizeBaseUrl(process.env.REACT_APP_API_BASE_URL);
    if (fromEnv) return fromEnv;

    // Backwards-compatible defaults:
    // - Dev: localhost backend
    // - Prod build: production API
    return process.env.NODE_ENV === "production" ? prodURL : stageURL;
}

const ApiUtils = axios.create({
    baseURL: resolveApiBaseUrl(),
});

// Add a request interceptor to include the token
ApiUtils.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    // config.headers["ngrok-skip-browser-warning"] = "true";

    return config;
});

// Format the API responses
ApiUtils.interceptors.response.use(
    (response) => ({
        status: response.status,
        data: response.data || null,
        requestLink: response.config.url,
        success: true,
    }),
    (error) => ({
        status: error.response?.status || 500,
        data: error.response?.data || null,
        requestLink: error.config?.url,
        success: false,
        message: error.message,
    })
);

export default ApiUtils;
