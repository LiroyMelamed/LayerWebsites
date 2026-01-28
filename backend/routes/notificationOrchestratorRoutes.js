const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requireAdmin = require('../middlewares/requireAdmin');
const notificationOrchestratorController = require('../controllers/notificationOrchestratorController');

router.post('/test', authMiddleware, requireAdmin, notificationOrchestratorController.testNotifyOrchestrator);

module.exports = router;
