const axios = require("axios");
const { sql, connectDb } = require("../config/db"); // Use connectDb and sql from your db config

async function sendAndStoreNotification(userId, title, message, data = {}) {
    try {
        const pool = await connectDb(); // Ensure database connection

        const tokensResult = await pool.request()
            .input("UserId", sql.Int, userId)
            .query("SELECT FcmToken FROM UserDevices WHERE UserId = @UserId AND FcmToken IS NOT NULL");

        const tokens = tokensResult.recordset.map(row => row.FcmToken).filter(Boolean);

        if (tokens.length > 0) {
            for (const token of tokens) {
                try {
                    await axios.post("https://exp.host/--/api/v2/push/send", {
                        to: token,
                        sound: "default",
                        title,
                        body: message,
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

        await pool.request()
            .input("UserId", sql.Int, userId)
            .input("Title", sql.NVarChar, title)
            .input("Message", sql.NVarChar, message)
            .query(`
                INSERT INTO UserNotifications (UserId, Title, Message)
                VALUES (@UserId, @Title, @Message)
            `);
        console.log(`Notification stored in DB for UserId: ${userId} - Title: ${title}`);

    } catch (error) {
        console.error("Error in sendAndStoreNotification:", error);
    }
}

module.exports = sendAndStoreNotification;
