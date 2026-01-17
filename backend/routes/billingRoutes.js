const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const billingController = require('../controllers/billingController');

// Tenant-visible, read-only.
router.get('/plan', authMiddleware, billingController.getCurrentPlan);
router.get('/usage', authMiddleware, billingController.getCurrentUsage);

module.exports = router;
