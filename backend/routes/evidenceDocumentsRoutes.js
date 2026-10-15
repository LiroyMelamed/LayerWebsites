const express = require('express');

const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requireFirmAreaVisible = require('../middlewares/requireFirmAreaVisible');
const requireFirmAction = require('../middlewares/requireFirmAction');
const evidenceDocumentsController = require('../controllers/evidenceDocumentsController');

// Read-only evidence documents list (signed only)
router.get(
    '/',
    authMiddleware,
    requireFirmAreaVisible('evidenceDocuments'),
    requireFirmAction('evidenceDocuments', 'view', { legacy: 'lawyerOrAdmin' }),
    evidenceDocumentsController.listEvidenceDocuments,
);

module.exports = router;
