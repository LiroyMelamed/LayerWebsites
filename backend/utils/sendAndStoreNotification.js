const axios = require("axios");
const pool = require("../config/db"); // Direct import of the pg pool

/**
 * Sends a push notification to a user's registered devices and stores the notification
 * in the database for later retrieval.
 * @param {number} userId - The ID of the user to notify.
 * @param {string} title - The title of the notification.
 * @param {string} message - The message body of the notification.
 * @param {object} data - Optional data payload to send with the notification.
 */
async function sendAndStoreNotification(userId, title, message, data = {}) {
    try {
        // Fetch all FCM tokens for the given user from the database
        const tokensResult = await pool.query(
            "SELECT FcmToken FROM UserDevices WHERE UserId = $1 AND FcmToken IS NOT NULL",
            [userId]
        );

        // Extract the tokens from the query result
        const tokens = tokensResult.rows.map(row => row.FcmToken).filter(Boolean);

        // Add a Unicode Right-to-Left marker for proper text display in notifications
        const rtlTitle = `\u200F${title}`;
        const rtlMessage = `\u200F${message}`;

        if (tokens.length > 0) {
            // Send a push notification to each token found
            for (const token of tokens) {
                try {
                    await axios.post("https://exp.host/--/api/v2/push/send", {
                        to: token,
                        sound: "default",
                        title: rtlTitle,
                        body: rtlMessage,
                        data: data,
                    });
                    console.log(`Push notification sent to token: ${token}`);
                } catch (err) {
                    console.error("❌ Push error for token:", token, err?.response?.data || err.message, "UserId: ", userId);
                }
            }
        } else {
            console.log(`No FCM tokens found for UserId: ${userId}. Skipping push notification.`);
        }

        // Store the notification in the database
        await pool.query(
            `
            INSERT INTO UserNotifications (UserId, Title, Message, CreatedAt, IsRead)
            VALUES ($1, $2, $3, NOW(), FALSE)
            `,
            [userId, title, message]
        );
        console.log(`Notification stored in DB for UserId: ${userId} - Title: ${title}`);

    } catch (error) {
        console.error("Error in sendAndStoreNotification:", error);
    }
}

module.exports = sendAndStoreNotification;
