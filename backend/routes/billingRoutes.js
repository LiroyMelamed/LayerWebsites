const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requireOfficeOwner = require('../middlewares/requireOfficeOwner');
const billingController = require('../controllers/billingController');

router.get('/lock-status', authMiddleware, billingController.getLockStatus);
router.get('/takbull/return', require('../middlewares/publicOfficeScope').paymentReturn, billingController.takbullReturn);
router.get('/takbull/cancel', require('../middlewares/publicOfficeScope').paymentReturn, billingController.takbullCancel);

router.get('/plan', authMiddleware, requireOfficeOwner, billingController.getCurrentPlan);
router.get('/usage', authMiddleware, requireOfficeOwner, billingController.getCurrentUsage);
router.get('/plans', authMiddleware, requireOfficeOwner, billingController.listPlans);
router.post('/package', authMiddleware, requireOfficeOwner, billingController.savePackage);
router.post('/checkout', authMiddleware, requireOfficeOwner, billingController.createCheckout);
router.post('/checkout/confirm', authMiddleware, requireOfficeOwner, billingController.confirmCheckout);
router.post('/charge', authMiddleware, requireOfficeOwner, billingController.chargeNow);
router.post('/cancel-subscription', authMiddleware, requireOfficeOwner, billingController.cancelSubscription);

module.exports = router;
