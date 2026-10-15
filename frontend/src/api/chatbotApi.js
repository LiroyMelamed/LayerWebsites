import ApiUtils from './apiUtils';

const chatbotApi = {
    sendMessage: async (message, sessionId) => {
        return await ApiUtils.post('chatbot/message', { message, sessionId });
    },

    requestOtp: async (phoneNumber, sessionId) => {
        return await ApiUtils.post('chatbot/request-otp', { phoneNumber, sessionId });
    },

    verifyOtp: async (phoneNumber, otp, sessionId) => {
        return await ApiUtils.post('chatbot/verify-otp', { phoneNumber, otp, sessionId });
    },

    getContext: async (sessionId) => {
        return await ApiUtils.get(`chatbot/context?sessionId=${sessionId}`);
    },
};

export default chatbotApi;
