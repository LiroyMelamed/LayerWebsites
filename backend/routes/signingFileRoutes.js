const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const signingFileController = require("../controllers/signingFileController");

// עו"ד מעלה קובץ לחתימה
router.post("/upload", authMiddleware, signingFileController.uploadFileForSigning);

// רשימת קבצים של הלקוח (pending/signed/rejected)
router.get("/client-files", authMiddleware, signingFileController.getClientSigningFiles);

// רשימת קבצים שעו"ד שלח ללקוחות
router.get("/lawyer-files", authMiddleware, signingFileController.getLawyerSigningFiles);

// (אופציונלי) רק בהמתנה ללקוח – אם תרצה מסך כזה ספציפי
router.get("/pending", authMiddleware, signingFileController.getPendingSigningFiles);

// פרטי קובץ + מקומות חתימה (גם עו"ד וגם לקוח)
router.get("/:signingFileId", authMiddleware, signingFileController.getSigningFileDetails);

// לקוח חותם על מקום חתימה אחד
router.post("/:signingFileId/sign", authMiddleware, signingFileController.signFile);

// לקוח דוחה את המסמך (מבקש תיקונים)
router.post("/:signingFileId/reject", authMiddleware, signingFileController.rejectSigning);

// עו"ד מעלה גרסה חדשה למסמך שנדחה
router.post("/:signingFileId/reupload", authMiddleware, signingFileController.reuploadFile);

// הורדת קובץ (כרגע: אם SignedFileKey קיים – חתום, אחרת המקורי)
router.get("/:signingFileId/download", authMiddleware, signingFileController.getSignedFileDownload);

module.exports = router;
