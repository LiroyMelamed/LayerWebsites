const express = require("express");
const router = express.Router();
const multer = require("multer");
const customerController = require("../controllers/customerController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");
const requireLawyerOrAdmin = require("../middlewares/requireLawyerOrAdmin");

// Multer configuration for Excel file uploads (memory storage, 5 MB limit)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv',                 // .csv
        ];
        if (allowed.includes(file.mimetype) || /\.(xlsx|xls|csv)$/i.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
        }
    },
});

// Customer APIs
router.get("/GetCustomers", authMiddleware, requireAdmin, customerController.getCustomers);
router.post("/AddCustomer", authMiddleware, requireAdmin, customerController.addCustomer);
router.put("/UpdateCustomer/:customerId", authMiddleware, requireAdmin, customerController.updateCustomerById);
router.get("/GetCustomerByName", authMiddleware, requireAdmin, customerController.getCustomerByName);
router.post("/import", authMiddleware, requireAdmin, upload.single('file'), customerController.importCustomers);

// Current User Profile APIs
router.get("/GetCurrentCustomer", authMiddleware, customerController.getCurrentCustomer);
router.put("/UpdateCurrentCustomer", authMiddleware, customerController.updateCurrentCustomer);
router.delete("/DeleteCustomer/:userId", authMiddleware, requireLawyerOrAdmin, customerController.deleteCustomer);
router.delete("/DeleteMyAccount", authMiddleware, customerController.deleteMyAccount);

module.exports = router;
