// Direct import of the pg pool instance from a local configuration file
const pool = require("../config/db");

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
    const { fcmToken, deviceType } = req.body;
    // Assuming the user ID is attached to the request object by a middleware
    const userId = req.user?.UserId;

    if (!userId || !fcmToken) {
        return res.status(400).json({ message: "Missing user ID or FCM token" });
    }

    try {
        // Check if the token already exists for this user
        const existing = await pool.query(
            `
            SELECT DeviceId FROM UserDevices
            WHERE UserId = $1 AND FcmToken = $2
            `,
            [userId, fcmToken]
        );

        // If it doesn't exist, insert a new record
        if (existing.rows.length === 0) {
            await pool.query(
                `
                INSERT INTO UserDevices (UserId, FcmToken, DeviceType)
                VALUES ($1, $2, $3)
                `,
                [userId, fcmToken, deviceType || null]
            );
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

    try {
        const result = await pool.query(
            `
            SELECT NotificationId, Title, Message, IsRead, CreatedAt
            FROM UserNotifications
            WHERE UserId = $1
            ORDER BY CreatedAt DESC
            `,
            [userId]
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
    const { id } = req.params;
    const userId = req.user.UserId;

    try {
        // Update the notification's status in the database
        const result = await pool.query(
            `
            UPDATE UserNotifications
            SET IsRead = TRUE
            WHERE NotificationId = $1 AND UserId = $2
            `,
            [id, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Notification not found or not authorized to update." });
        }

        res.status(200).json({ NotificationId: parseInt(id, 10) });
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
