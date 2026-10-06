const requireCaseWriteReferences = require('../middlewares/requireCaseWriteReferences');
const express = require("express");
const router = express.Router();
const caseController = require("../controllers/caseController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");
const requireLawyerOrAdmin = require("../middlewares/requireLawyerOrAdmin");
const requireFirmAction = require("../middlewares/requireFirmAction");

// Case APIs
router.get("/GetCases", authMiddleware, caseController.getCases);
router.get("/my", authMiddleware, requireFirmAction('cases', 'view', { legacy: 'lawyerOrAdmin' }), caseController.getMyCases);
router.get("/GetCase/:caseId", authMiddleware, caseController.getCaseById);
router.get("/GetCaseByName", authMiddleware, caseController.getCaseByName);
router.post("/AddCase", authMiddleware, requireFirmAction('cases', 'create'), requireCaseWriteReferences, caseController.addCase);
router.put("/UpdateCase/:caseId", authMiddleware, requireFirmAction('cases', 'edit'), requireCaseWriteReferences, caseController.updateCase);
router.put("/UpdateStage/:caseId", authMiddleware, requireFirmAction('cases', 'edit'), caseController.updateStage);
router.delete("/DeleteCase/:caseId", authMiddleware, requireFirmAction('cases', 'delete'), caseController.deleteCase);
router.put("/TagCase/:caseId", authMiddleware, requireFirmAction('cases', 'tag'), caseController.tagCase);
router.get("/TaggedCases", authMiddleware, requireFirmAction('cases', 'view', { legacy: 'lawyerOrAdmin' }), caseController.getTaggedCases);
router.get("/TaggedCasesByName", authMiddleware, requireFirmAction('cases', 'view', { legacy: 'lawyerOrAdmin' }), caseController.getTaggedCasesByName);
router.put("/LinkWhatsappGroup/:caseId", authMiddleware, requireFirmAction('cases', 'edit'), caseController.linkWhatsappGroup);
router.post("/CreateLicenseReminders", authMiddleware, requireFirmAction('cases', 'edit'), caseController.createLicenseReminders);

module.exports = router;
