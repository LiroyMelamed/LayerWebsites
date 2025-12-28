import ApiUtils from "./apiUtils";

const GET_NOTIFICATIONS = "Notifications";
const MARK_NOTIFICATION_AS_READ = "Notifications/";

export const notificationApi = {

    getNotifications: async () => {
        return await ApiUtils.get(GET_NOTIFICATIONS);
    },

    markNotificationAsRead: async (notificationId) => {
        return await ApiUtils.put(`${MARK_NOTIFICATION_AS_READ}${notificationId}/read`);
    },
};
