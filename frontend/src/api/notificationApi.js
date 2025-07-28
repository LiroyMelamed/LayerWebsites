import ApiUtils from "./apiUtils";

const GET_NOTIFICATIONS = "Notifications/notifications";
const MARK_NOTIFICATION_AS_READ = "Notifications/notifications/";

export const notificationApi = {

    getNotifications: async () => {
        return await ApiUtils.get(GET_NOTIFICATIONS);
    },

    markNotificationAsRead: async (notificationId) => {
        return await ApiUtils.put(`${MARK_NOTIFICATION_AS_READ}${notificationId}/read`);
    },
};
