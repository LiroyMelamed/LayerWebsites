const axios = require("axios");
const sql = require("../config/dbConfig");

async function sendAndStoreNotification(userId, title, message) {
    const pool = await sql.connect();

    const tokensResult = await pool.request()
        .input("UserId", sql.Int, userId)
        .query("SELECT FcmToken FROM UserDevices WHERE UserId = @UserId");

    const tokens = tokensResult.recordset.map(row => row.FcmToken).filter(Boolean);

    for (const token of tokens) {
        try {
            await axios.post("https://exp.host/--/api/v2/push/send", {
                to: token,
                sound: "default",
                title,
                body: message,
            });
        } catch (err) {
            console.error("❌ Push error:", err?.response?.data || err.message);
        }
    }

    await pool.request()
        .input("UserId", sql.Int, userId)
        .input("Title", sql.NVarChar, title)
        .input("Message", sql.NVarChar, message)
        .query(`
            INSERT INTO UserNotifications (UserId, Title, Message)
            VALUES (@UserId, @Title, @Message)
        `);
}

module.exports = sendAndStoreNotification;
