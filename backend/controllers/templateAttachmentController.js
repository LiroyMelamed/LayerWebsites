/**
 * Template-attachment controller
 *
 * POST   /api/template-attachments/upload   – upload a file attachment
 * GET    /api/template-attachments           – list attachments for a template
 * DELETE /api/template-attachments/:id       – delete an attachment
 */

const { v4: uuid } = require('uuid');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2, BUCKET } = require('../utils/r2');
const pool = require('../config/db');

const ALLOWED_TYPES = ['email', 'reminder'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/template-attachments/upload
 * Body (multipart): file, templateType, templateKey
 */
const uploadAttachment = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'לא הועלה קובץ.' });
        }

        const { templateType, templateKey } = req.body;
        if (!ALLOWED_TYPES.includes(templateType)) {
            return res.status(400).json({ ok: false, error: 'templateType חייב להיות email או reminder' });
        }
        if (!templateKey || !String(templateKey).trim()) {
            return res.status(400).json({ ok: false, error: 'חסר templateKey' });
        }

        if (req.file.size > MAX_FILE_SIZE) {
            return res.status(400).json({ ok: false, error: 'הקובץ גדול מדי (מקסימום 10MB)' });
        }

        const originalName = req.file.originalname || 'attachment';
        const ext = originalName.split('.').pop().toLowerCase() || 'bin';
        const mimeType = req.file.mimetype || 'application/octet-stream';
        const fileKey = `template-attachments/${uuid()}.${ext}`;

        // Upload to R2
        await r2.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: fileKey,
            Body: req.file.buffer,
            ContentType: mimeType,
        }));

        // Store metadata in DB
        const { rows } = await pool.query(
            `INSERT INTO template_attachments
                (template_type, template_key, file_key, filename, mime_type, file_size, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                templateType,
                String(templateKey).trim(),
                fileKey,
                originalName,
                mimeType,
                req.file.size,
                req.user?.userid || req.user?.UserId || null,
            ]
        );

        return res.status(201).json({ ok: true, attachment: rows[0] });
    } catch (e) {
        return next(e);
    }
};

/**
 * GET /api/template-attachments?templateType=email&templateKey=SIGN_INVITE
 */
const listAttachments = async (req, res, next) => {
    try {
        const { templateType, templateKey } = req.query;
        if (!ALLOWED_TYPES.includes(templateType)) {
            return res.status(400).json({ ok: false, error: 'templateType חייב להיות email או reminder' });
        }
        if (!templateKey) {
            return res.status(400).json({ ok: false, error: 'חסר templateKey' });
        }

        const { rows } = await pool.query(
            `SELECT id, template_type, template_key, file_key, filename, mime_type, file_size, created_at
             FROM template_attachments
             WHERE template_type = $1 AND template_key = $2
             ORDER BY created_at`,
            [templateType, templateKey]
        );

        return res.json({ ok: true, attachments: rows });
    } catch (e) {
        return next(e);
    }
};

/**
 * DELETE /api/template-attachments/:id
 */
const deleteAttachment = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Fetch the file key before deletion
        const { rows } = await pool.query(
            'SELECT file_key FROM template_attachments WHERE id = $1',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'קובץ מצורף לא נמצא' });
        }

        const fileKey = rows[0].file_key;

        // Delete from DB
        await pool.query('DELETE FROM template_attachments WHERE id = $1', [id]);

        // Delete from R2 (best-effort)
        try {
            await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: fileKey }));
        } catch (e) {
            console.error('[template-attachments] Failed to delete R2 object:', fileKey, e.message);
        }

        return res.json({ ok: true });
    } catch (e) {
        return next(e);
    }
};

/**
 * Fetch attachment files from R2 for a given template.
 * Returns array of { filename, content (Buffer), contentType }.
 * Used by email-sending services.
 */
async function getAttachmentBuffers(templateType, templateKey) {
    const { rows } = await pool.query(
        `SELECT file_key, filename, mime_type
         FROM template_attachments
         WHERE template_type = $1 AND template_key = $2
         ORDER BY created_at`,
        [templateType, templateKey]
    );

    if (rows.length === 0) return [];

    const results = [];
    for (const row of rows) {
        try {
            const resp = await r2.send(new GetObjectCommand({
                Bucket: BUCKET,
                Key: row.file_key,
            }));
            const chunks = [];
            for await (const chunk of resp.Body) {
                chunks.push(chunk);
            }
            results.push({
                filename: row.filename,
                content: Buffer.concat(chunks),
                contentType: row.mime_type,
            });
        } catch (e) {
            console.error(`[template-attachments] Failed to fetch ${row.file_key}:`, e.message);
        }
    }

    return results;
}

module.exports = {
    uploadAttachment,
    listAttachments,
    deleteAttachment,
    getAttachmentBuffers,
};
