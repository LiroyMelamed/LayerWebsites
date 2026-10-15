const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/SaveDeviceToken", authMiddleware, notificationController.saveDeviceToken);

router.get("/", authMiddleware, notificationController.getNotifications);

router.put("/:id/read", authMiddleware, notificationController.markNotificationAsRead);

module.exports = router;
