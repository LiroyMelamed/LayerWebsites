const axios = require("axios");
const pool = require("../config/db"); // Direct import of the pg pool

function isDuplicateNotificationPkError(err) {
    return (
        err?.code === "23505" &&
        (err?.constraint === "usernotifications_pkey" ||
            String(err?.detail || "").toLowerCase().includes("notificationid"))
    );
}

async function repairUserNotificationsSequence() {
    // Attempt to repair the sequence backing usernotifications.notificationid.
    const seqRes = await pool.query(
        "SELECT pg_get_serial_sequence('usernotifications','notificationid') AS seq"
    );
    const seqName = seqRes.rows?.[0]?.seq;

    if (!seqName) {
        throw new Error(
            "Could not determine sequence for usernotifications.notificationid (no serial/identity default?)"
        );
    }

    const maxRes = await pool.query(
        "SELECT COALESCE(MAX(notificationid), 0) AS max_id FROM usernotifications"
    );
    const maxId = Number(maxRes.rows?.[0]?.max_id || 0);
    const nextId = maxId + 1;

    await pool.query("SELECT setval($1::regclass, $2, false)", [seqName, nextId]);
    console.log(`Repaired notification sequence ${seqName} -> next id ${nextId}`);
}

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
        const insertSql = `
            INSERT INTO UserNotifications (UserId, Title, Message, CreatedAt, IsRead)
            VALUES ($1, $2, $3, NOW(), FALSE)
        `;

        try {
            await pool.query(insertSql, [userId, title, message]);
        } catch (err) {
            if (isDuplicateNotificationPkError(err)) {
                console.warn(
                    "Duplicate NotificationId detected; attempting to repair sequence and retry insert once..."
                );
                await repairUserNotificationsSequence();
                await pool.query(insertSql, [userId, title, message]);
            } else {
                throw err;
            }
        }
        console.log(`Notification stored in DB for UserId: ${userId} - Title: ${title}`);

    } catch (error) {
        console.error("Error in sendAndStoreNotification:", error);
    }
}

module.exports = sendAndStoreNotification;
