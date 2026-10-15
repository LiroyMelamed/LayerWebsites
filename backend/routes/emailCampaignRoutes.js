const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requireAdmin = require('../middlewares/requireAdmin');
const emailCampaignController = require('../controllers/emailCampaignController');

router.post('/test', authMiddleware, requireAdmin, emailCampaignController.testSendEmailCampaign);

module.exports = router;
