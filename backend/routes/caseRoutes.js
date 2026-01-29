const express = require("express");
const router = express.Router();
const caseController = require("../controllers/caseController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");
const requireLawyerOrAdmin = require("../middlewares/requireLawyerOrAdmin");

// Case APIs
router.get("/GetCases", authMiddleware, caseController.getCases);
router.get("/my", authMiddleware, requireLawyerOrAdmin, caseController.getMyCases);
router.get("/GetCase/:caseId", authMiddleware, caseController.getCaseById);
router.get("/GetCaseByName", authMiddleware, caseController.getCaseByName);
router.post("/AddCase", authMiddleware, requireAdmin, caseController.addCase);
router.put("/UpdateCase/:caseId", authMiddleware, requireAdmin, caseController.updateCase);
router.put("/UpdateStage/:caseId", authMiddleware, requireAdmin, caseController.updateStage);
router.delete("/DeleteCase/:caseId", authMiddleware, requireAdmin, caseController.deleteCase);
router.put("/TagCase/:CaseId", authMiddleware, requireAdmin, caseController.tagCase);
router.get("/TaggedCases", authMiddleware, caseController.getTaggedCases);
router.get("/TaggedCasesByName", authMiddleware, caseController.getTaggedCasesByName);
router.put("/LinkWhatsappGroup/:CaseId", authMiddleware, requireAdmin, caseController.linkWhatsappGroup);

module.exports = router;
