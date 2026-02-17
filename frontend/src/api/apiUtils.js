import axios from "axios";

const prodURL = "https://api.calls.melamedlaw.co.il/api";
const stageURL = "http://localhost:5000/api";

function normalizeBaseUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
    const fromEnv = normalizeBaseUrl(process.env.REACT_APP_API_BASE_URL);
    if (fromEnv) return fromEnv;

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
    config.headers["x-client-platform"] = "web";

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
    (error) => {
        const status = error.response?.status || 500;

        // Session expired / invalid token — if inside native app, tell it to log out
        if (status === 401) {
            localStorage.removeItem("token");
            if (window.ReactNativeWebView?.postMessage) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOGOUT' }));
            }
        }

        return {
            status,
            data: error.response?.data || null,
            requestLink: error.config?.url,
            success: false,
            message: error.message,
        };
    }
);

export default ApiUtils;
