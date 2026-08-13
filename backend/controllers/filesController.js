const { v4: uuid } = require("uuid");
const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { r2, BUCKET } = require("../utils/r2");

// GET /api/Files/presign-upload?ext=jpg&mime=image/jpeg
exports.presignUpload = async (req, res) => {
    try {
        const ext = (req.query.ext || "jpg").toLowerCase();
        const mime = req.query.mime || "image/jpeg";
        const userId = req.user.UserId;

        const key = `users/${userId}/${uuid()}.${ext}`;

        const cmd = new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ContentType: mime,
            // private object (no ACL)
        });

        const uploadUrl = await getSignedUrl(r2, cmd, { expiresIn: 60 }); // 60s
        return res.json({ uploadUrl, key, expiresIn: 60 });
    } catch (err) {
        console.error("presign-upload error:", err);
        return res.status(500).json({ message: "שגיאה ביצירת קישור העלאה" });
    }
};

/**
 * POST /api/Files/upload (multipart field "file")
 * Server-side PutObject — avoids browser→R2 CORS (new buckets often have none).
 */
exports.directUpload = async (req, res) => {
    try {
        const file = req.file;
        if (!file?.buffer?.length) {
            return res.status(400).json({ message: "חסר קובץ להעלאה" });
        }

        const userId = req.user.UserId;
        const originalName = String(file.originalname || "file");
        const parts = originalName.split(".");
        const ext = (parts.length > 1 ? parts[parts.length - 1] : "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        const mime = file.mimetype || "application/octet-stream";
        const key = `users/${userId}/${uuid()}.${ext}`;

        await r2.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: mime,
        }));

        return res.json({
            key,
            fileName: originalName,
            ext,
            mime,
            size: file.size,
        });
    } catch (err) {
        console.error("direct-upload error:", err);
        return res.status(500).json({ message: "שגיאה בהעלאת הקובץ" });
    }
};

// GET /api/Files/presign-read?key=users/<id>/<uuid>.jpg
exports.presignRead = async (req, res) => {
    try {
        const key = req.query.key;
        if (!key) return res.status(400).json({ message: "חסר מפתח קובץ" });

        // Simple ownership check
        if (!key.startsWith(`users/${req.user.UserId}/`)) {
            return res.status(403).json({ message: "אין הרשאה", code: 'FORBIDDEN' });
        }

        const cmd = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ResponseContentDisposition: "inline",
        });

        const readUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 }); // 10 min
        return res.json({ readUrl, expiresIn: 600 });
    } catch (err) {
        console.error("presign-read error:", err);
        return res.status(500).json({ message: "שגיאה ביצירת קישור קריאה" });
    }
};
