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


// ── Request interceptor — attach token ──
ApiUtils.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers["x-client-platform"] = "web";
    return config;
});


// ── Refresh token logic ──
let _refreshPromise = null;

async function tryRefreshToken() {
    if (_refreshPromise) return _refreshPromise;

    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return null;

    _refreshPromise = axios
        .post(`${resolveApiBaseUrl()}/Auth/Refresh`, { refreshToken }, { headers: { "x-client-platform": "web" } })
        .then((res) => {
            if (res.status === 200 && res.data?.token) {
                localStorage.setItem("token", res.data.token);
                if (res.data.refreshToken) localStorage.setItem("refreshToken", res.data.refreshToken);
                return res.data.token;
            }
            return null;
        })
        .catch(() => null)
        .finally(() => { _refreshPromise = null; });

    return _refreshPromise;
}

function clearAuthAndRedirect() {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
    localStorage.removeItem("isPlatformAdmin");

    if (window.ReactNativeWebView?.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOGOUT' }));
    }

    if (!window.location.pathname.includes('/LoginStack')) {
        window.location.href = '/LoginStack/LoginScreen';
    }
}


// ── Response helpers ──
function formatSuccess(response) {
    return { status: response.status, data: response.data || null, requestLink: response.config.url, success: true };
}

function formatError(error) {
    return { status: error.response?.status || 500, data: error.response?.data || null, requestLink: error.config?.url, success: false, message: error.message };
}


// ── Response interceptor — handle 401 with silent refresh ──
ApiUtils.interceptors.response.use(
    (response) => formatSuccess(response),
    async (error) => {
        const status = error.response?.status || 500;
        const originalRequest = error.config;

        if (status !== 401 || originalRequest._retried) {
            return formatError(error);
        }

        // Try refreshing the token once
        originalRequest._retried = true;
        const newToken = await tryRefreshToken();

        if (!newToken) {
            clearAuthAndRedirect();
            return formatError(error);
        }

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        try {
            return formatSuccess(await axios(originalRequest));
        } catch (retryErr) {
            if (retryErr.response?.status === 401) clearAuthAndRedirect();
            return formatError(retryErr);
        }
    }
);

export default ApiUtils;
