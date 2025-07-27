const express = require("express");
const router = express.Router();
const caseTypeController = require("../controllers/caseTypeController");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/GetCasesType", authMiddleware, caseTypeController.getCaseTypes);
router.get("/GetCasesTypeForFilter", authMiddleware, caseTypeController.getCaseTypesForFilter);
router.get("/GetCaseType/:caseTypeId", authMiddleware, caseTypeController.getCaseTypeById);
router.get("/GetCaseTypeByName", authMiddleware, caseTypeController.getCaseTypeByName);
router.delete("/DeleteCaseType/:CaseTypeId", authMiddleware, caseTypeController.deleteCaseType);
router.post("/AddCaseType", authMiddleware, caseTypeController.addCaseType);
router.put("/UpdateCaseType/:caseTypeId", authMiddleware, caseTypeController.updateCaseType);

module.exports = router;
