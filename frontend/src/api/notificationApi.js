import ApiUtils from "./apiUtils";
import { isDemoModeEnabled } from "../utils/demoMode";
import { demoOk, demoNotFound, demoListNotifications, demoMarkNotificationAsRead } from "../demo/demoStore";

const GET_NOTIFICATIONS = "Notifications";
const MARK_NOTIFICATION_AS_READ = "Notifications/";

export const notificationApi = {

    getNotifications: async () => {
        if (isDemoModeEnabled()) {
            return demoOk(demoListNotifications(), GET_NOTIFICATIONS);
        }
        return await ApiUtils.get(GET_NOTIFICATIONS);
    },

    markNotificationAsRead: async (notificationId) => {
        if (isDemoModeEnabled()) {
            const updated = demoMarkNotificationAsRead(notificationId);
            return updated
                ? demoOk(updated, `${MARK_NOTIFICATION_AS_READ}${notificationId}/read`)
                : demoNotFound("notification not found", `${MARK_NOTIFICATION_AS_READ}${notificationId}/read`);
        }
        return await ApiUtils.put(`${MARK_NOTIFICATION_AS_READ}${notificationId}/read`);
    },
};
