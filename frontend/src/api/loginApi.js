import ApiUtils from "./apiUtils";

const REQUEST_API_DATA_ENDPOINT = 'Auth/RequestOtp';
const VERIFY_OTP_DATA_ENDPOINT = 'Auth/VerifyOtp';
const ADMIN_LOGIN_OTP_DATA_ENDPOINT = 'Auth/Login';

const loginApi = {
    sendOtp: async (payload) => {
        const body = typeof payload === "string"
            ? { phoneNumber: payload }
            : payload;
        return await ApiUtils.post(REQUEST_API_DATA_ENDPOINT, body);
    },

    verifyOtp: async (phoneNumberOrPayload, otp) => {
        const body = typeof phoneNumberOrPayload === "object" && phoneNumberOrPayload !== null
            ? { ...phoneNumberOrPayload, otp }
            : { phoneNumber: phoneNumberOrPayload, otp };
        return await ApiUtils.post(VERIFY_OTP_DATA_ENDPOINT, body);
    },

    login: async (username, password) => {
        const data = {
            username,
            passwordHash: password,
        }
        return await ApiUtils.post(ADMIN_LOGIN_OTP_DATA_ENDPOINT, data);;
    },
};

export default loginApi;
