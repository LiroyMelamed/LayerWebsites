const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireOfficeUserAction = require('../middlewares/requireOfficeUserAction');
const requirePlatformAdmin = require('../middlewares/requirePlatformAdmin');
const requireFirmStaffLookup = require("../middlewares/requireFirmStaffLookup");

router.get("/GetAdmins", authMiddleware, requireOfficeUserAction('view'), adminController.getAdmins);
router.get("/GetAdminByName", authMiddleware, requireOfficeUserAction('view'), adminController.getAdminByName);
router.get("/GetStaffByName", authMiddleware, requireFirmStaffLookup, adminController.getStaffByName);
router.put("/UpdateAdmin/:adminId", authMiddleware, requireOfficeUserAction('manage'), adminController.updateAdmin);
router.delete("/DeleteAdmin/:adminId", authMiddleware, requireOfficeUserAction('manage'), adminController.deleteAdmin);
router.post("/AddAdmin", authMiddleware, requireOfficeUserAction('manage'), adminController.addAdmin);

// Platform-owned plans (tenant = lawyer userId)
router.post("/tenants/:tenantId/plan", authMiddleware, requirePlatformAdmin, adminController.setTenantPlan);

module.exports = router;
