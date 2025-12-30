// Direct import of the pg pool instance from a local configuration file
const pool = require("../config/db");
const { optionalInt, requireInt } = require("../utils/paramValidation");

// Required for authentication logic (if used elsewhere in this file)
const jwt = require("jsonwebtoken");
require("dotenv").config();

/**
 * Saves a user's FCM (Firebase Cloud Messaging) device token.
 * This is used to send push notifications to their device.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
const saveDeviceToken = async (req, res) => {
    const { fcmToken, pushToken, expoPushToken, deviceType } = req.body;
    // Assuming the user ID is attached to the request object by a middleware
    const userId = req.user?.UserId;

    const token = (fcmToken || pushToken || expoPushToken || "").trim();

    if (!userId || !token) {
        return res.status(400).json({ message: "Missing user ID or push token" });
    }

    try {
        // If token exists for the same user, update deviceType (if provided)
        const updateSameUser = await pool.query(
            `
            UPDATE UserDevices
            SET DeviceType = COALESCE($3, DeviceType)
            WHERE UserId = $1 AND FcmToken = $2
            `,
            [userId, token, deviceType || null]
        );

        if (updateSameUser.rowCount === 0) {
            // If the same device token was previously associated to another user,
            // re-associate it to the current user (common after logout/login).
            const reassociate = await pool.query(
                `
                UPDATE UserDevices
                SET UserId = $1, DeviceType = COALESCE($3, DeviceType)
                WHERE FcmToken = $2
                `,
                [userId, token, deviceType || null]
            );

            if (reassociate.rowCount === 0) {
                await pool.query(
                    `
                    INSERT INTO UserDevices (UserId, FcmToken, DeviceType)
                    VALUES ($1, $2, $3)
                    `,
                    [userId, token, deviceType || null]
                );
            }
        }

        res.status(200).json({ message: "Device token saved successfully" });
    } catch (error) {
        console.error("Error saving device token:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Retrieves all notifications for the authenticated user, ordered by creation date.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
const getNotifications = async (req, res) => {
    const userId = req.user.UserId;

    const limit = optionalInt(req, res, {
        source: 'query',
        name: 'limit',
        min: 1,
        max: 200,
        defaultValue: 50,
    });
    if (limit === null) return;

    const offset = optionalInt(req, res, {
        source: 'query',
        name: 'offset',
        min: 0,
        defaultValue: 0,
    });
    if (offset === null) return;

    try {
        const result = await pool.query(
            `
            SELECT NotificationId, Title, Message, IsRead, CreatedAt
            FROM UserNotifications
            WHERE UserId = $1
            ORDER BY CreatedAt DESC
            LIMIT $2
            OFFSET $3
            `,
            [userId, limit, offset]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ message: "שגיאה בקבלת ההתראות" });
    }
};

/**
 * Marks a specific notification as read for the authenticated user.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
const markNotificationAsRead = async (req, res) => {
    const notificationId = requireInt(req, res, { source: 'params', name: 'id' });
    if (notificationId === null) return;
    const userId = req.user.UserId;

    try {
        // Update the notification's status in the database
        const result = await pool.query(
            `
            UPDATE UserNotifications
            SET IsRead = TRUE
            WHERE NotificationId = $1 AND UserId = $2
            `,
            [notificationId, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Notification not found or not authorized to update." });
        }

        res.status(200).json({ NotificationId: notificationId });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).json({ message: "שגיאה בעדכון התראה" });
    }
};

// Export the functions for use in routes
module.exports = {
    saveDeviceToken,
    getNotifications,
    markNotificationAsRead,
};
