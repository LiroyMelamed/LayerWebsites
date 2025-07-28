import ApiUtils from "./apiUtils";

const REQUEST_API_DATA_ENDPOINT = 'Auth/RequestOtp';
const VERIFY_OTP_DATA_ENDPOINT = 'Auth/VerifyOtp';
const ADMIN_LOGIN_OTP_DATA_ENDPOINT = 'Auth/Login';

const loginApi = {
    sendOtp: async (phoneNumber) => {
        return await ApiUtils.post(REQUEST_API_DATA_ENDPOINT, { phoneNumber });
    },

    verifyOtp: async (phoneNumber, otp) => {
        const data = {
            phoneNumber,
            otp
        }
        return await ApiUtils.post(VERIFY_OTP_DATA_ENDPOINT, data);;
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
