const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const optionalAuthMiddleware = require("../middlewares/optionalAuthMiddleware");
const signingFileController = require("../controllers/signingFileController");
const crypto = require('crypto');
const { createRateLimitMiddleware } = require('../utils/rateLimiter');
const { requireSigningEnabledForUser, requireSigningEnabledForSigningFile } = require('../middlewares/requireSigningEnabled');

function hashToken(raw) {
    const token = String(raw || '');
    return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

const publicViewLimiter = createRateLimitMiddleware({
    name: 'public_signing_view',
    windowMs: 60 * 1000,
    max: 60,
    keyFn: (req) => `t:${hashToken(req.params?.token)}`,
    trustProxy: true,
});


router.post("/detect-spots", authMiddleware, requireSigningEnabledForUser, signingFileController.detectSignatureSpots);

// Public view of signed document (JWT view token, no auth)
router.get("/public/view/:token", publicViewLimiter, signingFileController.getPublicSignedDocumentView);

// Public signing (no auth) via signed token
router.get("/public/:token/pdf", publicViewLimiter, signingFileController.getPublicSigningFilePdf);
router.get("/public/:token", publicViewLimiter, signingFileController.getPublicSigningFileDetails);
router.post("/public/:token/otp/request", signingFileController.publicRequestSigningOtp);
router.post("/public/:token/otp/verify", signingFileController.publicVerifySigningOtp);
// Signing + evidence generation can exceed the default 30s API timeout.
function extendTimeout(ms) {
    return (req, res, next) => {
        if (typeof res.setTimeout === 'function') res.setTimeout(ms);
        next();
    };
}

router.post("/public/:token/sign", extendTimeout(120_000), optionalAuthMiddleware, signingFileController.publicSignFile);
router.post("/public/:token/reject", signingFileController.publicRejectSigning);
router.get("/public/:token/saved-signature", publicViewLimiter, signingFileController.getPublicSavedSignature);
router.get("/public/:token/saved-signature/data-url", publicViewLimiter, signingFileController.getPublicSavedSignatureDataUrl);
router.post("/public/:token/saved-signature", signingFileController.savePublicSavedSignature);
router.get("/public/:token/saved-stamp", publicViewLimiter, signingFileController.getPublicSavedStamp);
router.get("/public/:token/saved-stamp/data-url", publicViewLimiter, signingFileController.getPublicSavedStampDataUrl);
router.post("/public/:token/saved-stamp", signingFileController.savePublicSavedStamp);
router.get("/public/:token/saved-items", publicViewLimiter, signingFileController.listPublicSavedItems);
router.delete("/public/:token/saved-items/:type/:index", signingFileController.deletePublicSavedItem);

// Saved signature for current user (auth)
router.get("/saved-signature", authMiddleware, requireSigningEnabledForUser, signingFileController.getSavedSignature);
router.get("/saved-signature/data-url", authMiddleware, requireSigningEnabledForUser, signingFileController.getSavedSignatureDataUrl);
router.post("/saved-signature", authMiddleware, requireSigningEnabledForUser, signingFileController.saveSavedSignature);

// Saved stamp for current user (auth)
router.get("/saved-stamp", authMiddleware, requireSigningEnabledForUser, signingFileController.getSavedStamp);
router.get("/saved-stamp/data-url", authMiddleware, requireSigningEnabledForUser, signingFileController.getSavedStampDataUrl);
router.post("/saved-stamp", authMiddleware, requireSigningEnabledForUser, signingFileController.saveSavedStamp);

// List + delete saved items
router.get("/saved-items", authMiddleware, requireSigningEnabledForUser, signingFileController.listSavedItems);
router.delete("/saved-items/:type/:index", authMiddleware, requireSigningEnabledForUser, signingFileController.deleteSavedItem);

// עו"ד מעלה קובץ לחתימה
router.post("/upload", authMiddleware, requireSigningEnabledForUser, signingFileController.uploadFileForSigning);

// רשימת קבצים של הלקוח (pending/signed/rejected)
router.get("/client-files", authMiddleware, requireSigningEnabledForUser, signingFileController.getClientSigningFiles);

// רשימת קבצים שעו"ד שלח ללקוחות
router.get("/lawyer-files", authMiddleware, requireSigningEnabledForUser, signingFileController.getLawyerSigningFiles);

// (אופציונלי) רק בהמתנה ללקוח
router.get("/pending", authMiddleware, requireSigningEnabledForUser, signingFileController.getPendingSigningFiles);

// Generate a public signing link token (lawyer/admin)
router.post("/:signingFileId/public-link", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.createPublicSigningLink);

// Get signers for a signing file (for resend UI)
router.get("/:signingFileId/signers", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.getSigningFileSigners);

// Resend signing invitations to selected signers
router.post("/:signingFileId/resend", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.resendSigningInvite);

// Lawyer signing policy configuration (explicit OTP on/off + waiver ack)
router.patch("/:signingFileId/policy", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.updateSigningPolicy);

// Rename signing file
router.patch("/:signingFileId/rename", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.renameSigningFile);

// Stream original PDF for in-app viewing/signing
router.get("/:signingFileId/pdf", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.getSigningFilePdf);

// פרטי קובץ + מקומות חתימה (גם עו"ד וגם לקוח)
router.get("/:signingFileId", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.getSigningFileDetails);

// Evidence package for court (lawyer/admin)
router.get("/:signingFileId/evidence", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.getEvidencePackage);

// Evidence package ZIP download (lawyer/admin)
router.get("/:signingFileId/evidence-package", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.getEvidencePackageZip);
// Evidence certificate (PDF) for quick human-readable record
router.get("/:signingFileId/evidence-certificate", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.getEvidenceCertificate);

// OTP for signing (authenticated flows)
router.post("/:signingFileId/otp/request", authMiddleware, signingFileController.requestSigningOtp);
router.post("/:signingFileId/otp/verify", authMiddleware, signingFileController.verifySigningOtp);

// לקוח חותם על מקום חתימה אחד
router.post("/:signingFileId/sign", extendTimeout(120_000), authMiddleware, requireSigningEnabledForSigningFile, signingFileController.signFile);

// לקוח דוחה את המסמך
router.post("/:signingFileId/reject", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.rejectSigning);

// עו"ד מעלה גרסה חדשה למסמך שנדחה
router.post("/:signingFileId/reupload", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.reuploadFile);

// הורדת קובץ
router.get("/:signingFileId/download", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.getSignedFileDownload);

// מחיקת קובץ ממתין
router.delete("/:signingFileId", authMiddleware, requireSigningEnabledForSigningFile, signingFileController.deleteSigningFile);

module.exports = router;
