import axios from "axios";

const isProduction = false;

function selectMode(forProduction, forStage) {
    return isProduction ? forProduction : forStage;
}

const prodURL = "https://api.calls.melamedlaw.co.il/api";
const stageURL = "http://localhost:3000/api";

const ApiUtils = axios.create({
    baseURL: selectMode(prodURL, stageURL),
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
