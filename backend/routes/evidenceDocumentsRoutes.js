const express = require('express');

const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requireLawyerOrAdmin = require('../middlewares/requireLawyerOrAdmin');
const evidenceDocumentsController = require('../controllers/evidenceDocumentsController');

// Read-only evidence documents list (signed only)
router.get('/', authMiddleware, requireLawyerOrAdmin, evidenceDocumentsController.listEvidenceDocuments);

module.exports = router;
