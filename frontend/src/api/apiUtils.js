import axios from "axios";

const ApiUtils = axios.create({
    baseURL: "https://railway.com/project/2d09abdf-bf17-4230-87fe-2c575c3d0adf/service/548c481f-e69c-4082-b37f-61680bf5d916?environmentId=3c793587-1a37-44e9-9996-e9c43d53116e&id=5b078e25-bb6a-44bb-b21f-853221c74738#deploy",
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
