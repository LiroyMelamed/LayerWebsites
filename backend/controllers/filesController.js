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
        return res.status(500).json({ message: "Failed to presign upload" });
    }
};

// GET /api/Files/presign-read?key=users/<id>/<uuid>.jpg
exports.presignRead = async (req, res) => {
    try {
        const key = req.query.key;
        if (!key) return res.status(400).json({ message: "missing key" });

        // Simple ownership check
        if (!key.startsWith(`users/${req.user.UserId}/`)) {
            return res.status(403).json({ message: "Forbidden", code: 'FORBIDDEN' });
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
        return res.status(500).json({ message: "Failed to presign read" });
    }
};
