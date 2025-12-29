const express = require("express");
const router = express.Router();
const caseTypeController = require("../controllers/caseTypeController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");

router.get("/GetCasesType", authMiddleware, caseTypeController.getCaseTypes);
router.get("/GetCasesTypeForFilter", authMiddleware, caseTypeController.getCaseTypesForFilter);
router.get("/GetCaseType/:caseTypeId", authMiddleware, caseTypeController.getCaseTypeById);
router.get("/GetCaseTypeByName", authMiddleware, caseTypeController.getCaseTypeByName);
router.delete("/DeleteCaseType/:CaseTypeId", authMiddleware, requireAdmin, caseTypeController.deleteCaseType);
router.post("/AddCaseType", authMiddleware, requireAdmin, caseTypeController.addCaseType);
router.put("/UpdateCaseType/:caseTypeId", authMiddleware, requireAdmin, caseTypeController.updateCaseType);

module.exports = router;
