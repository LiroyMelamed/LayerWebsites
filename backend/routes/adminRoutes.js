const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/GetAdmins", authMiddleware, adminController.getAdmins);
router.get("/GetAdminByName", authMiddleware, adminController.getAdminByName);
router.put("/UpdateAdmin/:adminId", authMiddleware, adminController.updateAdmin);
router.delete("/DeleteAdmin/:adminId", authMiddleware, adminController.deleteAdmin);
router.post("/AddAdmin", authMiddleware, adminController.addAdmin);

module.exports = router;
