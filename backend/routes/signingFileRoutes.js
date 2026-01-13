const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const signingFileController = require("../controllers/signingFileController");

router.post("/detect-spots", authMiddleware, signingFileController.detectSignatureSpots);

// Public signing (no auth) via signed token
router.get("/public/:token/pdf", signingFileController.getPublicSigningFilePdf);
router.get("/public/:token", signingFileController.getPublicSigningFileDetails);
router.post("/public/:token/otp/request", signingFileController.publicRequestSigningOtp);
router.post("/public/:token/otp/verify", signingFileController.publicVerifySigningOtp);
router.post("/public/:token/sign", signingFileController.publicSignFile);
router.post("/public/:token/reject", signingFileController.publicRejectSigning);
router.get("/public/:token/saved-signature", signingFileController.getPublicSavedSignature);
router.get("/public/:token/saved-signature/data-url", signingFileController.getPublicSavedSignatureDataUrl);
router.post("/public/:token/saved-signature", signingFileController.savePublicSavedSignature);

// Saved signature for current user (auth)
router.get("/saved-signature", authMiddleware, signingFileController.getSavedSignature);
router.get("/saved-signature/data-url", authMiddleware, signingFileController.getSavedSignatureDataUrl);
router.post("/saved-signature", authMiddleware, signingFileController.saveSavedSignature);

// עו"ד מעלה קובץ לחתימה
router.post("/upload", authMiddleware, signingFileController.uploadFileForSigning);

// רשימת קבצים של הלקוח (pending/signed/rejected)
router.get("/client-files", authMiddleware, signingFileController.getClientSigningFiles);

// רשימת קבצים שעו"ד שלח ללקוחות
router.get("/lawyer-files", authMiddleware, signingFileController.getLawyerSigningFiles);

// (אופציונלי) רק בהמתנה ללקוח
router.get("/pending", authMiddleware, signingFileController.getPendingSigningFiles);

// Generate a public signing link token (lawyer/admin)
router.post("/:signingFileId/public-link", authMiddleware, signingFileController.createPublicSigningLink);

// Lawyer signing policy configuration (explicit OTP on/off + waiver ack)
router.patch("/:signingFileId/policy", authMiddleware, signingFileController.updateSigningPolicy);

// Stream original PDF for in-app viewing/signing
router.get("/:signingFileId/pdf", authMiddleware, signingFileController.getSigningFilePdf);

// פרטי קובץ + מקומות חתימה (גם עו"ד וגם לקוח)
router.get("/:signingFileId", authMiddleware, signingFileController.getSigningFileDetails);

// Evidence package for court (lawyer/admin)
router.get("/:signingFileId/evidence", authMiddleware, signingFileController.getEvidencePackage);

// Evidence package ZIP download (lawyer/admin)
router.get("/:signingFileId/evidence-package", authMiddleware, signingFileController.getEvidencePackageZip);
// Evidence certificate (PDF) for quick human-readable record
router.get("/:signingFileId/evidence-certificate", authMiddleware, signingFileController.getEvidenceCertificate);

// OTP for signing (authenticated flows)
router.post("/:signingFileId/otp/request", authMiddleware, signingFileController.requestSigningOtp);
router.post("/:signingFileId/otp/verify", authMiddleware, signingFileController.verifySigningOtp);

// לקוח חותם על מקום חתימה אחד
router.post("/:signingFileId/sign", authMiddleware, signingFileController.signFile);

// לקוח דוחה את המסמך
router.post("/:signingFileId/reject", authMiddleware, signingFileController.rejectSigning);

// עו"ד מעלה גרסה חדשה למסמך שנדחה
router.post("/:signingFileId/reupload", authMiddleware, signingFileController.reuploadFile);

// הורדת קובץ
router.get("/:signingFileId/download", authMiddleware, signingFileController.getSignedFileDownload);

module.exports = router;
