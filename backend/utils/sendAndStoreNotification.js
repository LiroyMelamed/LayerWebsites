const axios = require("axios");
const pool = require("../config/db"); // Direct import of the pg pool

function isExpoPushToken(token) {
    const t = String(token || "").trim();
    return /^ExponentPushToken\[[^\]]+\]$/.test(t) || /^ExpoPushToken\[[^\]]+\]$/.test(t);
}

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
async function sendAndStoreNotification(userId, title, message, data = {}, options = {}) {
    try {
        const sendPush = options?.sendPush !== false;

        // Fetch all FCM tokens for the given user from the database
        if (sendPush) {
            const tokensResult = await pool.query(
                "SELECT FcmToken FROM UserDevices WHERE UserId = $1 AND FcmToken IS NOT NULL",
                [userId]
            );

            // Extract the tokens from the query result (be tolerant of casing)
            const tokens = tokensResult.rows
                .map((row) => row?.FcmToken ?? row?.fcmtoken ?? row?.fcmToken)
                .filter(Boolean);
            const expoTokens = tokens.map(t => String(t).trim()).filter(isExpoPushToken);

            // Add a Unicode Right-to-Left marker for proper text display in notifications
            const rtlTitle = `\u200F${title}`;
            const rtlMessage = `\u200F${message}`;

            if (tokens.length > 0) {
                if (expoTokens.length === 0) {
                    console.warn(
                        `UserId ${userId} has push tokens, but none are valid Expo push tokens. Skipping push send.`
                    );
                } else {
                    // Expo supports sending an array of messages in a single request.
                    const messages = expoTokens.map((token) => ({
                        to: token,
                        sound: "default",
                        title: rtlTitle,
                        body: rtlMessage,
                        data,
                    }));

                    try {
                        const resp = await axios.post(
                            "https://exp.host/--/api/v2/push/send",
                            messages,
                            { headers: { "Content-Type": "application/json" } }
                        );
                        const dataResp = resp?.data;
                        if (dataResp?.data?.length) {
                            const failures = dataResp.data.filter((r) => r?.status !== "ok");
                            if (failures.length) {
                                console.error(
                                    `❌ Expo push failures for UserId ${userId}:`,
                                    failures
                                );
                            }
                        }
                    } catch (err) {
                        console.error(
                            "❌ Expo push send error:",
                            err?.response?.data || err.message,
                            "UserId:",
                            userId
                        );
                    }
                }
            } else {
                console.log(`No push tokens found for UserId: ${userId}. Skipping push notification.`);
            }
        }

        const dedupeWindowSeconds = 10;
        const insertSql = `
            INSERT INTO UserNotifications (UserId, Title, Message, CreatedAt, IsRead)
            SELECT $1, $2::text, $3::text, NOW(), FALSE
            WHERE NOT EXISTS (
                SELECT 1
                FROM UserNotifications
                WHERE UserId = $1
                  AND Title = $4::text
                  AND Message = $5::text
                  AND CreatedAt > (NOW() - ($6 * INTERVAL '1 second'))
            )
        `;

        try {
            await pool.query(insertSql, [userId, title, message, title, message, dedupeWindowSeconds]);
        } catch (err) {
            if (isDuplicateNotificationPkError(err)) {
                console.warn(
                    "Duplicate NotificationId detected; attempting to repair sequence and retry insert once..."
                );
                await repairUserNotificationsSequence();
                await pool.query(insertSql, [userId, title, message, title, message, dedupeWindowSeconds]);
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
