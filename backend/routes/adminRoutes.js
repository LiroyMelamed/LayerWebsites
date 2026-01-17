const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");

router.get("/GetAdmins", authMiddleware, requireAdmin, adminController.getAdmins);
router.get("/GetAdminByName", authMiddleware, requireAdmin, adminController.getAdminByName);
router.put("/UpdateAdmin/:adminId", authMiddleware, requireAdmin, adminController.updateAdmin);
router.delete("/DeleteAdmin/:adminId", authMiddleware, requireAdmin, adminController.deleteAdmin);
router.post("/AddAdmin", authMiddleware, requireAdmin, adminController.addAdmin);

// Platform-owned plans (tenant = lawyer userId)
router.post("/tenants/:tenantId/plan", authMiddleware, requireAdmin, adminController.setTenantPlan);

module.exports = router;
