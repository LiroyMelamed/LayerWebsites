const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const authMiddleware = require("../middlewares/authMiddleware");

// Customer APIs
router.get("/GetCustomers", authMiddleware, customerController.getCustomers);
router.post("/AddCustomer", authMiddleware, customerController.addCustomer);
router.put("/UpdateCustomer/:customerId", authMiddleware, customerController.updateCustomerById);
router.get("/GetCustomerByName", authMiddleware, customerController.getCustomerByName);

// Current User Profile APIs
router.get("/GetCurrentCustomer", authMiddleware, customerController.getCurrentCustomer);
router.put("/UpdateCurrentCustomer", authMiddleware, customerController.updateCurrentCustomer);
router.delete("/DeleteCustomer/:userId", authMiddleware, customerController.deleteCustomer);
router.delete("/DeleteMyAccount", authMiddleware, customerController.deleteMyAccount);

module.exports = router;
