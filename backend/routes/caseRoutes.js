const express = require("express");
const router = express.Router();
const caseController = require("../controllers/caseController");
const authMiddleware = require("../middlewares/authMiddleware");

// Case APIs
router.get("/GetCases", authMiddleware, caseController.getCases);
router.get("/GetCase/:caseId", authMiddleware, caseController.getCaseById);
router.get("/GetCaseByName", authMiddleware, caseController.getCaseByName);
router.post("/AddCase", authMiddleware, caseController.addCase);
router.put("/UpdateCase/:caseId", authMiddleware, caseController.updateCase);
router.put("/UpdateStage/:caseId", authMiddleware, caseController.updateStage);
router.delete("/DeleteCase/:caseId", authMiddleware, caseController.deleteCase);
router.put("/TagCase/:CaseId", authMiddleware, caseController.tagCase);
router.get("/TaggedCases", authMiddleware, caseController.getTaggedCases);
router.get("/TaggedCasesByName", authMiddleware, caseController.getTaggedCasesByName);
router.put("/LinkWhatsappGroup/:CaseId", authMiddleware, caseController.linkWhatsappGroup);

module.exports = router;
