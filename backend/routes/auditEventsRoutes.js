const express = require('express');

const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requireLawyerOrAdmin = require('../middlewares/requireLawyerOrAdmin');
const auditEventsController = require('../controllers/auditEventsController');

// Read-only audit trail API
router.get('/', authMiddleware, requireLawyerOrAdmin, auditEventsController.listAuditEvents);

module.exports = router;
