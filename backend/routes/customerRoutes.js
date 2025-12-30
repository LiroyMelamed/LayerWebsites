const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");

// Customer APIs
router.get("/GetCustomers", authMiddleware, requireAdmin, customerController.getCustomers);
router.post("/AddCustomer", authMiddleware, requireAdmin, customerController.addCustomer);
router.put("/UpdateCustomer/:customerId", authMiddleware, requireAdmin, customerController.updateCustomerById);
router.get("/GetCustomerByName", authMiddleware, requireAdmin, customerController.getCustomerByName);

// Current User Profile APIs
router.get("/GetCurrentCustomer", authMiddleware, customerController.getCurrentCustomer);
router.put("/UpdateCurrentCustomer", authMiddleware, customerController.updateCurrentCustomer);
router.delete("/DeleteCustomer/:userId", authMiddleware, requireAdmin, customerController.deleteCustomer);
router.delete("/DeleteMyAccount", authMiddleware, customerController.deleteMyAccount);

module.exports = router;
