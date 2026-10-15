const express = require("express");
const router = express.Router();
const dataController = require("../controllers/dataController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");

router.get("/GetMainScreenData", authMiddleware, requireAdmin, dataController.getMainScreenData);
router.get("/GetClientDashboardData", authMiddleware, dataController.getClientDashboardData);

module.exports = router;
