const express = require("express");
const router = express.Router();
const dataController = require("../controllers/dataController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");
const requireFirmAreaVisible = require("../middlewares/requireFirmAreaVisible");
const requireFirmAction = require("../middlewares/requireFirmAction");

router.get("/GetMainScreenData", authMiddleware, requireFirmAreaVisible('main'), requireFirmAction('cases', 'view', { legacy: 'admin' }), dataController.getMainScreenData);
router.get("/GetManagerHomeData", authMiddleware, requireFirmAreaVisible('main'), requireFirmAction('cases', 'view', { legacy: 'admin' }), dataController.getManagerHomeData);
router.get("/GetManagerHomeAiBrief", authMiddleware, requireFirmAreaVisible('main'), requireFirmAction('cases', 'view', { legacy: 'admin' }), dataController.getManagerHomeAiBrief);
router.get("/GetClientDashboardData", authMiddleware, dataController.getClientDashboardData);

module.exports = router;
