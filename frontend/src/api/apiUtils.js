import axios from "axios";
import { getDemoModeToken } from "../utils/demoMode";

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
    const demoToken = getDemoModeToken();
    const token = demoToken || localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    // config.headers["ngrok-skip-browser-warning"] = "true";
    config.headers["x-client-platform"] = "web";

    // Dev-only diagnostics (never log secrets)
    try {
        if (process.env.NODE_ENV !== 'production') {
            const url = String(config?.url || '');
            if (url.includes('SigningFiles/lawyer-files')) {
                // eslint-disable-next-line no-console
                console.debug('[api] SigningFiles/lawyer-files', {
                    hasAuth: Boolean(token),
                    demoMode: Boolean(demoToken),
                });
            }
        }
    } catch {
        // no-op
    }

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
