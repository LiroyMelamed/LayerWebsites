import axios from "axios";

const ApiUtils = axios.create({
    baseURL: "http://localhost:5000",
});

// Add a request interceptor to include the token
ApiUtils.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
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
