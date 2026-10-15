const pool = require("../config/db");
const { assertCaseRecordAccess } = require("../lib/firmPermissions/caseAccess");
const { requireInt } = require("../utils/paramValidation");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { r2, BUCKET } = require("../utils/r2");
const { invalidateOperationalDashboardCaches } = require("../utils/operationalDashboardCache");

/**
 * GET /api/Files/stage-files/:caseId
 * Returns all stage files for a case.
 * - Admins can see all.
 * - Users can see files only for cases they are linked to via case_users.
 */
exports.getStageFiles = async (req, res) => {
    const caseId = requireInt(req, res, { source: "params", name: "caseId" });
    if (caseId === null) return;

    try {
        const accessErr = await assertCaseRecordAccess(req, caseId, 'view');
        if (accessErr) {
            return res.status(accessErr.httpStatus || 403).json({
                message: accessErr.message,
                errorCode: accessErr.errorCode,
            });
        }

        const result = await pool.query(
            `SELECT sf.id, sf.caseid, sf.stage, sf.file_key, sf.file_name, sf.file_ext,
                    sf.file_mime, sf.file_size, sf.uploaded_by, sf.created_at,
                    u.name AS uploader_name
             FROM stage_files sf
             LEFT JOIN users u ON u.userid = sf.uploaded_by
             WHERE sf.caseid = $1
             ORDER BY sf.stage ASC, sf.created_at ASC`,
            [caseId]
        );

        return res.json(result.rows);
    } catch (err) {
        console.error("getStageFiles error:", err);
        return res.status(500).json({ message: "שגיאה בשליפת קבצי שלב" });
    }
};

/**
 * POST /api/Files/stage-files/:caseId/:stage
 * Body: { fileKey, fileName, fileExt, fileMime, fileSize }
 * Registers a previously uploaded R2 file as a stage file.
 * Admin only.
 */
exports.addStageFile = async (req, res) => {
    const caseId = requireInt(req, res, { source: "params", name: "caseId" });
    if (caseId === null) return;
    const stage = requireInt(req, res, { source: "params", name: "stage" });
    if (stage === null) return;

    const { fileKey, fileName, fileExt, fileMime, fileSize } = req.body;
    if (!fileKey || !fileName) {
        return res.status(400).json({ message: "fileKey ו-fileName הם שדות חובה" });
    }

    try {
        const userId = req.user.UserId;

        const addAccessErr = await assertCaseRecordAccess(req, caseId, 'edit');
        if (addAccessErr) {
            return res.status(addAccessErr.httpStatus || 403).json({
                message: addAccessErr.message,
                errorCode: addAccessErr.errorCode,
            });
        }

        const caseRes = await pool.query("SELECT caseid FROM cases WHERE caseid = $1", [caseId]);
        if (caseRes.rowCount === 0) {
            return res.status(404).json({ message: "תיק לא נמצא" });
        }

        const result = await pool.query(
            `INSERT INTO stage_files (caseid, stage, file_key, file_name, file_ext, file_mime, file_size, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, caseid, stage, file_key, file_name, file_ext, file_mime, file_size, uploaded_by, created_at`,
            [caseId, stage, fileKey, fileName, fileExt || null, fileMime || null, fileSize || null, userId]
        );

        invalidateOperationalDashboardCaches();
        return res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("addStageFile error:", err);
        return res.status(500).json({ message: "שגיאה בהוספת קובץ שלב" });
    }
};

/**
 * DELETE /api/Files/stage-files/:fileId
 * Deletes a stage file record. Admin only.
 * (The R2 object cleanup can be done separately or via lifecycle rules.)
 */
exports.deleteStageFile = async (req, res) => {
    const fileId = requireInt(req, res, { source: "params", name: "fileId" });
    if (fileId === null) return;

    try {
        const fileRow = await pool.query(
            "SELECT caseid FROM stage_files WHERE id = $1",
            [fileId]
        );
        if (fileRow.rowCount === 0) {
            return res.status(404).json({ message: "קובץ שלב לא נמצא" });
        }
        const delCaseId = fileRow.rows[0].caseid;
        const delAccessErr = await assertCaseRecordAccess(req, delCaseId, 'edit');
        if (delAccessErr) {
            return res.status(delAccessErr.httpStatus || 403).json({
                message: delAccessErr.message,
                errorCode: delAccessErr.errorCode,
            });
        }

        const result = await pool.query(
            "DELETE FROM stage_files WHERE id = $1 RETURNING id",
            [fileId]
        );
        invalidateOperationalDashboardCaches();
        return res.json({ message: "נמחק", id: fileId });
    } catch (err) {
        console.error("deleteStageFile error:", err);
        return res.status(500).json({ message: "שגיאה במחיקת קובץ שלב" });
    }
};

/**
 * GET /api/Files/stage-file-read/:fileId
 * Returns a presigned read URL for a stage file.
 * Admins can read any file. Users can only read files of cases they are linked to.
 */
exports.readStageFile = async (req, res) => {
    const fileId = requireInt(req, res, { source: "params", name: "fileId" });
    if (fileId === null) return;

    try {
        const fileRes = await pool.query(
            "SELECT sf.file_key, sf.file_name, sf.caseid FROM stage_files sf WHERE sf.id = $1",
            [fileId]
        );
        if (fileRes.rowCount === 0) {
            return res.status(404).json({ message: "קובץ שלב לא נמצא" });
        }

        const { file_key, file_name, caseid } = fileRes.rows[0];

        const readAccessErr = await assertCaseRecordAccess(req, caseid, 'view');
        if (readAccessErr) {
            return res.status(readAccessErr.httpStatus || 403).json({
                message: readAccessErr.message,
                errorCode: readAccessErr.errorCode,
            });
        }

        const cmd = new GetObjectCommand({
            Bucket: BUCKET,
            Key: file_key,
            ResponseContentDisposition: `inline; filename="${encodeURIComponent(file_name)}"`,
        });

        const readUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 }); // 10 min
        return res.json({ readUrl, fileName: file_name, expiresIn: 600 });
    } catch (err) {
        console.error("readStageFile error:", err);
        return res.status(500).json({ message: "שגיאה ביצירת קישור קריאה" });
    }
};
