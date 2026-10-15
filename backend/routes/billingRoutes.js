const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requirePlatformAdmin = require('../middlewares/requirePlatformAdmin');
const billingController = require('../controllers/billingController');

router.get('/lock-status', authMiddleware, billingController.getLockStatus);
router.get('/takbull/return', billingController.takbullReturn);
router.get('/takbull/cancel', billingController.takbullCancel);

router.get('/plan', authMiddleware, requirePlatformAdmin, billingController.getCurrentPlan);
router.get('/usage', authMiddleware, requirePlatformAdmin, billingController.getCurrentUsage);
router.get('/plans', authMiddleware, requirePlatformAdmin, billingController.listPlans);
router.post('/package', authMiddleware, requirePlatformAdmin, billingController.savePackage);
router.post('/checkout', authMiddleware, requirePlatformAdmin, billingController.createCheckout);
router.post('/charge', authMiddleware, requirePlatformAdmin, billingController.chargeNow);

module.exports = router;
