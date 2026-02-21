/**
 * Compliance routes.
 *
 * Public – no authentication required.
 * The compliance posture (aligned vs certified) is driven by
 * the COMPLIANCE_BADGES_MODE environment variable, not by any
 * request payload.
 */

const express = require('express');
const router = express.Router();
const { getStatus } = require('../controllers/complianceController');

// GET /api/compliance/status
router.get('/status', getStatus);

module.exports = router;
