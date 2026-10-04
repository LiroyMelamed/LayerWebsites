const express = require("express");
const router = express.Router();
const caseTypeController = require("../controllers/caseTypeController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireFirmAction = require("../middlewares/requireFirmAction");
const requireFirmAreaVisible = require("../middlewares/requireFirmAreaVisible");
<<<<<<< HEAD
=======
const requireCaseTypePickerAccess = require("../middlewares/requireCaseTypePickerAccess");
>>>>>>> origin/main

router.get("/GetCasesType", authMiddleware, requireFirmAreaVisible('caseTypes'), caseTypeController.getCaseTypes);
router.get("/GetCasesTypeForFilter", authMiddleware, requireFirmAreaVisible('caseTypes'), caseTypeController.getCaseTypesForFilter);
router.get("/GetCaseType/:caseTypeId", authMiddleware, requireFirmAreaVisible('caseTypes'), caseTypeController.getCaseTypeById);
<<<<<<< HEAD
router.get("/GetCaseTypeByName", authMiddleware, requireFirmAreaVisible('caseTypes'), caseTypeController.getCaseTypeByName);
=======
router.get("/GetCaseTypeByName", authMiddleware, requireCaseTypePickerAccess, caseTypeController.getCaseTypeByName);
>>>>>>> origin/main
router.delete("/DeleteCaseType/:CaseTypeId", authMiddleware, requireFirmAction('caseTypes', 'manage', { legacy: 'admin' }), caseTypeController.deleteCaseType);
router.post("/AddCaseType", authMiddleware, requireFirmAction('caseTypes', 'manage', { legacy: 'admin' }), caseTypeController.addCaseType);
router.put("/UpdateCaseType/:caseTypeId", authMiddleware, requireFirmAction('caseTypes', 'manage', { legacy: 'admin' }), caseTypeController.updateCaseType);

module.exports = router;
