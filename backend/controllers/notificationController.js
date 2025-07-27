const { sql, connectDb } = require("../config/db");

const saveDeviceToken = async (req, res) => {
    const { fcmToken, deviceType } = req.body;
    const userId = req.user?.UserId;

    if (!userId || !fcmToken) {
        return res.status(400).json({ message: "Missing user ID or FCM token" });
    }

    try {
        const pool = await connectDb();
        const checkTokenRequest = pool.request();
        checkTokenRequest.input("userId", sql.Int, userId);
        checkTokenRequest.input("fcmToken", sql.NVarChar, fcmToken);

        const existing = await checkTokenRequest.query(`
            SELECT DeviceId FROM UserDevices
            WHERE UserId = @userId AND FcmToken = @fcmToken
        `);

        if (existing.recordset.length === 0) {
            const insertRequest = pool.request();
            insertRequest.input("userId", sql.Int, userId);
            insertRequest.input("fcmToken", sql.NVarChar, fcmToken);
            insertRequest.input("deviceType", sql.NVarChar, deviceType || null);

            await insertRequest.query(`
                INSERT INTO UserDevices (UserId, FcmToken, DeviceType)
                VALUES (@userId, @fcmToken, @deviceType)
            `);
        }

        res.status(200).json({ message: "Device token saved successfully" });
    } catch (error) {
        console.error("Error saving device token:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    saveDeviceToken,
};
