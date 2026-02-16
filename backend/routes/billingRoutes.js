const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requirePlatformAdmin = require('../middlewares/requirePlatformAdmin');
const billingController = require('../controllers/billingController');

// Platform admin only — billing endpoints.
router.get('/plan', authMiddleware, requirePlatformAdmin, billingController.getCurrentPlan);
router.get('/usage', authMiddleware, requirePlatformAdmin, billingController.getCurrentUsage);
router.get('/plans', authMiddleware, requirePlatformAdmin, billingController.listPlans);

module.exports = router;
