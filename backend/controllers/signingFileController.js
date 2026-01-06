// controllers/signingFileController.js
const pool = require("../config/db");
const jwt = require('jsonwebtoken');
const { PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { r2, BUCKET } = require("../utils/r2");
const sendAndStoreNotification = require("../utils/sendAndStoreNotification");
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, WEBSITE_DOMAIN } = require("../utils/sendMessage");
const { detectHebrewSignatureSpotsFromPdfBuffer, streamToBuffer } = require("../utils/signatureDetection");
const { PDFDocument } = require("pdf-lib");
const { v4: uuid } = require("uuid");
const { requireInt, parsePositiveIntStrict } = require("../utils/paramValidation");
const { getPagination } = require("../utils/pagination");

const BASE_RENDER_WIDTH = 800;

const MAX_SIGNING_PDF_BYTES = Number(
    process.env.MAX_SIGNING_PDF_BYTES || String(25 * 1024 * 1024)
);
const MAX_SIGNATURE_IMAGE_BYTES = Number(
    process.env.MAX_SIGNATURE_IMAGE_BYTES || String(512 * 1024)
);
const SIGNING_PDF_OP_TIMEOUT_MS = Number(process.env.SIGNING_PDF_OP_TIMEOUT_MS || 20_000);

function getJwtSecret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET is not set');
    return s;
}

function getWebsiteDomain() {
    return String(process.env.WEBSITE_DOMAIN || WEBSITE_DOMAIN || '').trim();
}

function buildPublicSigningUrl(token) {
    const domain = getWebsiteDomain();
    if (!domain) return null;
    return `https://${domain}/public-sign?token=${encodeURIComponent(String(token))}`;
}

function createPublicSigningToken({ signingFileId, signerUserId, fileExpiresAt }) {
    // Token lifetime: default 7 days, but never beyond file.expiresAt if provided.
    const defaultTtlSeconds = Number(process.env.PUBLIC_SIGNING_LINK_TTL_SECONDS || 7 * 24 * 60 * 60);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const maxExpSeconds = fileExpiresAt
        ? Math.floor(new Date(fileExpiresAt).getTime() / 1000)
        : null;
    const desiredExp = nowSeconds + defaultTtlSeconds;
    const exp = maxExpSeconds ? Math.min(desiredExp, maxExpSeconds) : desiredExp;
    const expiresIn = Math.max(60, exp - nowSeconds);

    return jwt.sign(
        {
            typ: 'signing_public',
            signingFileId,
            signerUserId,
        },
        getJwtSecret(),
        { expiresIn }
    );
}

function getSavedSignatureKey(userId) {
    const safeId = Number(userId);
    return `saved-signatures/user-${safeId}.png`;
}

function parseDataUrlImage(dataUrl) {
    const raw = String(dataUrl || '').trim();
    const m = raw.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i);
    if (!m) return { ok: false, message: 'Invalid signatureImage (expected data URL)' };

    const contentType = String(m[1]).toLowerCase();
    const base64 = m[3];
    let buffer;
    try {
        buffer = Buffer.from(base64, 'base64');
    } catch {
        return { ok: false, message: 'Invalid base64' };
    }

    if (!buffer || buffer.length === 0) return { ok: false, message: 'Empty image' };
    if (buffer.length > MAX_SIGNATURE_IMAGE_BYTES) {
        return { ok: false, message: 'Signature image is too large', code: 'REQUEST_TOO_LARGE' };
    }

    return { ok: true, buffer, contentType };
}

async function presignSavedSignatureReadUrl(key) {
    const cmd = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ResponseContentDisposition: 'inline',
    });
    return getSignedUrl(r2, cmd, { expiresIn: 600 });
}

async function savedSignatureExists(key) {
    try {
        await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        return true;
    } catch {
        return false;
    }
}

async function getSavedSignatureDataUrlByKey(key) {
    const obj = await r2.send(
        new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        })
    );
    if (!obj.Body) throw new Error('R2 object has no body');
    const buffer = await streamToBuffer(obj.Body);
    const contentType = String(obj.ContentType || 'image/png').toLowerCase();
    const safeContentType = contentType.startsWith('image/') ? contentType : 'image/png';
    const base64 = buffer.toString('base64');
    return `data:${safeContentType};base64,${base64}`;
}

// Saved signature (auth)
exports.getSavedSignature = async (req, res) => {
    try {
        const userId = req.user?.UserId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const key = getSavedSignatureKey(userId);
        const exists = await savedSignatureExists(key);
        if (!exists) return res.json({ exists: false });

        const url = await presignSavedSignatureReadUrl(key);
        return res.json({ exists: true, url, key });
    } catch (err) {
        console.error('getSavedSignature error:', err);
        return res.status(500).json({ message: 'שגיאה בשליפת חתימה שמורה' });
    }
};

exports.getSavedSignatureDataUrl = async (req, res) => {
    try {
        const userId = req.user?.UserId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const key = getSavedSignatureKey(userId);
        const exists = await savedSignatureExists(key);
        if (!exists) return res.json({ exists: false });

        const dataUrl = await getSavedSignatureDataUrlByKey(key);
        return res.json({ exists: true, dataUrl, key });
    } catch (err) {
        console.error('getSavedSignatureDataUrl error:', err);
        return res.status(500).json({ message: 'שגיאה בשליפת חתימה שמורה' });
    }
};

exports.saveSavedSignature = async (req, res) => {
    try {
        const userId = req.user?.UserId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const parsed = parseDataUrlImage(req.body?.signatureImage);
        if (!parsed.ok) {
            return res.status(parsed.code === 'REQUEST_TOO_LARGE' ? 413 : 400).json({
                message: parsed.message,
                code: parsed.code,
            });
        }

        const key = getSavedSignatureKey(userId);
        await r2.send(
            new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: parsed.buffer,
                ContentType: parsed.contentType,
            })
        );

        return res.json({ success: true, key });
    } catch (err) {
        console.error('saveSavedSignature error:', err);
        return res.status(500).json({ message: 'שגיאה בשמירת חתימה שמורה' });
    }
};

// Saved signature (public token)
exports.getPublicSavedSignature = async (req, res) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return res.status(verified.status).json({ message: verified.message });
        }

        const { signerUserId } = verified;
        const key = getSavedSignatureKey(signerUserId);
        const exists = await savedSignatureExists(key);
        if (!exists) return res.json({ exists: false });

        const url = await presignSavedSignatureReadUrl(key);
        return res.json({ exists: true, url, key });
    } catch (err) {
        console.error('getPublicSavedSignature error:', err);
        return res.status(500).json({ message: 'שגיאה בשליפת חתימה שמורה' });
    }
};

exports.getPublicSavedSignatureDataUrl = async (req, res) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return res.status(verified.status).json({ message: verified.message });
        }

        const { signerUserId } = verified;
        const key = getSavedSignatureKey(signerUserId);
        const exists = await savedSignatureExists(key);
        if (!exists) return res.json({ exists: false });

        const dataUrl = await getSavedSignatureDataUrlByKey(key);
        return res.json({ exists: true, dataUrl, key });
    } catch (err) {
        console.error('getPublicSavedSignatureDataUrl error:', err);
        return res.status(500).json({ message: 'שגיאה בשליפת חתימה שמורה' });
    }
};

exports.savePublicSavedSignature = async (req, res) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return res.status(verified.status).json({ message: verified.message });
        }

        const { signerUserId } = verified;
        const parsed = parseDataUrlImage(req.body?.signatureImage);
        if (!parsed.ok) {
            return res.status(parsed.code === 'REQUEST_TOO_LARGE' ? 413 : 400).json({
                message: parsed.message,
                code: parsed.code,
            });
        }

        const key = getSavedSignatureKey(signerUserId);
        await r2.send(
            new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: parsed.buffer,
                ContentType: parsed.contentType,
            })
        );

        return res.json({ success: true, key });
    } catch (err) {
        console.error('savePublicSavedSignature error:', err);
        return res.status(500).json({ message: 'שגיאה בשמירת חתימה שמורה' });
    }
};

function verifyPublicSigningToken(rawToken) {
    const token = String(rawToken || '').trim();
    if (!token) return { ok: false, status: 401, message: 'Missing token' };
    try {
        const decoded = jwt.verify(token, getJwtSecret());
        if (!decoded || decoded.typ !== 'signing_public') {
            return { ok: false, status: 401, message: 'Invalid token' };
        }
        const signingFileId = Number(decoded.signingFileId);
        const signerUserId = Number(decoded.signerUserId);
        if (!Number.isFinite(signingFileId) || signingFileId <= 0) {
            return { ok: false, status: 401, message: 'Invalid token' };
        }
        if (!Number.isFinite(signerUserId) || signerUserId <= 0) {
            return { ok: false, status: 401, message: 'Invalid token' };
        }
        return { ok: true, signingFileId, signerUserId };
    } catch {
        return { ok: false, status: 401, message: 'Invalid token' };
    }
}

async function loadSigningFileBase({ signingFileId }) {
    const fileResult = await pool.query(
        `select
            signingfileid as "SigningFileId",
            lawyerid      as "LawyerId",
            clientid      as "ClientId",
            filename      as "FileName",
            filekey       as "FileKey",
            originalfilekey as "OriginalFileKey",
            status        as "Status",
            signedfilekey as "SignedFileKey",
            signedat      as "SignedAt",
            createdat     as "CreatedAt",
            expiresat     as "ExpiresAt",
            rejectionreason as "RejectionReason",
            notes         as "Notes"
         from signingfiles
         where signingfileid = $1`,
        [signingFileId]
    );
    if (fileResult.rows.length === 0) return null;
    return fileResult.rows[0];
}

async function ensurePublicUserAuthorized({ signingFileId, userId, schemaSupport }) {
    const file = await loadSigningFileBase({ signingFileId });
    if (!file) return { ok: false, status: 404, message: 'המסמך לא נמצא' };

    const isLawyer = file.LawyerId === userId;
    const isPrimaryClient = file.ClientId === userId;
    let isAssignedSigner = false;

    if (schemaSupport.signaturespotsSignerUserId && !isLawyer && !isPrimaryClient) {
        const signerRes = await pool.query(
            `select 1
             from signaturespots
             where signingfileid = $1 and signeruserid = $2
             limit 1`,
            [signingFileId, userId]
        );
        isAssignedSigner = signerRes.rows.length > 0;
    }

    if (!isLawyer && !isPrimaryClient && !isAssignedSigner) {
        return { ok: false, status: 403, message: 'אין הרשאה למסמך זה', code: 'FORBIDDEN' };
    }

    return { ok: true, file, isLawyer, isPrimaryClient, isAssignedSigner };
}

function isSigningDebugEnabled() {
    return process.env.SIGNING_DEBUG_LOGS === 'true' && process.env.IS_PRODUCTION !== 'true';
}

function safeKeyHint(key) {
    const s = String(key || '');
    if (!s) return '';
    if (s.length <= 16) return s;
    return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function withTimeout(promise, ms, message) {
    if (!Number.isFinite(ms) || ms <= 0) return promise;
    let t;
    const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(message || 'Operation timed out')), ms);
    });
    return Promise.race([
        promise.finally(() => clearTimeout(t)),
        timeout,
    ]);
}

async function headR2Object({ key }) {
    const cmd = new HeadObjectCommand({ Bucket: BUCKET, Key: key });
    return withTimeout(r2.send(cmd), SIGNING_PDF_OP_TIMEOUT_MS, 'R2 head timeout');
}

function decodeBase64DataUrl(dataUrlOrBase64) {
    const raw = String(dataUrlOrBase64 || '');
    const base64 = raw.split(',')[1] || raw;
    // Buffer.from will throw on malformed base64; let caller handle.
    const buf = Buffer.from(base64, 'base64');
    return { buffer: buf, base64 };
}

async function getR2ObjectBuffer(key) {
    const obj = await r2.send(
        new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        })
    );
    if (!obj.Body) throw new Error("R2 object has no body");
    const buffer = await streamToBuffer(obj.Body);
    return { buffer, contentType: obj.ContentType };
}

async function generateSignedPdfBuffer({ pdfKey, spots }) {
    const { buffer: pdfBuffer } = await getR2ObjectBuffer(pdfKey);

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    // Place each signature image on its page
    for (const spot of spots) {
        const pageNumber = Number(spot.PageNumber ?? spot.pagenumber ?? spot.pageNum ?? 1);
        const pageIndex = pageNumber - 1;
        const page = pages[pageIndex];
        if (!page) continue;

        const signatureKey = spot.SignatureData;
        if (!signatureKey) continue;

        const { buffer: imgBuffer, contentType } = await getR2ObjectBuffer(signatureKey);
        const isPng =
            (contentType || "").toLowerCase().includes("png") ||
            String(signatureKey).toLowerCase().endsWith(".png");

        const embedded = isPng
            ? await pdfDoc.embedPng(imgBuffer)
            : await pdfDoc.embedJpg(imgBuffer);

        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();

        // Spots are stored in BASE_RENDER_WIDTH pixel space (top-left origin)
        // Convert to PDF points (bottom-left origin)
        const scale = BASE_RENDER_WIDTH / pageWidth;
        const xPx = Number(spot.X ?? spot.x ?? 0);
        const yTopPx = Number(spot.Y ?? spot.y ?? 0);
        const wPx = Number(spot.Width ?? spot.width ?? 130);
        const hPx = Number(spot.Height ?? spot.height ?? 48);

        const x = xPx / scale;
        const w = wPx / scale;
        const h = hPx / scale;
        const yTop = yTopPx / scale;
        const y = pageHeight - yTop - h;

        page.drawImage(embedded, {
            x,
            y,
            width: w,
            height: h,
        });
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
}

async function ensureSignedPdfKey({ signingFileId, lawyerId, pdfKey }) {
    // Pull signed spots with signature images
    const spotsRes = await pool.query(
        `select
            pagenumber    as "PageNumber",
            x             as "X",
            y             as "Y",
            width         as "Width",
            height        as "Height",
            signaturedata as "SignatureData"
         from signaturespots
         where signingfileid = $1
           and issigned = true
           and signaturedata is not null`,
        [signingFileId]
    );

    const spots = spotsRes.rows || [];
    if (spots.length === 0) {
        return null;
    }

    const signedPdf = await generateSignedPdfBuffer({ pdfKey, spots });
    const signedKey = `signed/${lawyerId}/${signingFileId}/${uuid()}.pdf`;

    await r2.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: signedKey,
            Body: signedPdf,
            ContentType: "application/pdf",
        })
    );

    await pool.query(
        `update signingfiles
         set signedfilekey = $2
         where signingfileid = $1`,
        [signingFileId, signedKey]
    );

    return signedKey;
}

let _schemaSupportCache = {
    value: null,
    expiresAt: 0,
};

async function getSchemaSupport() {
    const now = Date.now();
    if (_schemaSupportCache.value && now < _schemaSupportCache.expiresAt) {
        return _schemaSupportCache.value;
    }

    const signerUserIdCol = await pool.query(
        `select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'signaturespots'
           and column_name = 'signeruserid'
         limit 1`
    );

    const caseIdNullableRes = await pool.query(
        `select is_nullable
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'signingfiles'
           and column_name = 'caseid'
         limit 1`
    );

    const value = {
        signaturespotsSignerUserId: signerUserIdCol.rows.length > 0,
        signingfilesCaseIdNullable: (caseIdNullableRes.rows[0]?.is_nullable || 'NO') === 'YES',
    };

    // Cache briefly to avoid repeated information_schema hits, but still adapt to schema changes.
    _schemaSupportCache = { value, expiresAt: now + 30_000 };
    return value;
}

exports.uploadFileForSigning = async (req, res) => {
    try {
        const schemaSupport = await getSchemaSupport();
        const {
            caseId,
            clientId,
            fileName,
            fileKey,
            signatureLocations,
            notes,
            expiresAt,
            signers, // NEW: array of signer objects [{userId, name}, ...]
        } = req.body;

        const lawyerId = req.user.UserId;

        if (isSigningDebugEnabled()) {
            console.log('[signing] uploadFileForSigning', {
                lawyerId,
                caseId: caseId ?? null,
                fileKeyHint: safeKeyHint(fileKey),
                signatureSpots: signatureLocations?.length || 0,
                signerCount: Array.isArray(signers) ? signers.length : undefined,
            });
        }

        // Support both single client (legacy) and multiple signers (new)
        const signersList = signers && Array.isArray(signers) ? signers :
            (clientId ? [{ userId: clientId, name: "חתימה ✍️" }] : []);

        if (isSigningDebugEnabled()) {
            console.log('[signing] signersList', signersList.map(s => ({ userId: s.userId })));
        }

        // caseId is optional: can upload by client only, case only, or both
        if (!fileName || !fileKey || signersList.length === 0) {
            return res
                .status(400)
                .json({ message: "חסרים שדות חובה (שם קובץ, fileKey, או חתומים)" });
        }

        // Enforce max PDF size by verifying object size in R2.
        // This is the only reliable way when uploads go directly from client -> R2.
        try {
            if (!String(fileKey).startsWith(`users/${lawyerId}/`) && !String(fileKey).startsWith(`users/`)) {
                // We don't hard-block legacy keys, but we also avoid leaking key details.
                // Ownership of reads is enforced elsewhere.
            }

            const head = await headR2Object({ key: fileKey });
            const size = Number(head?.ContentLength || 0);
            if (Number.isFinite(MAX_SIGNING_PDF_BYTES) && MAX_SIGNING_PDF_BYTES > 0 && size > MAX_SIGNING_PDF_BYTES) {
                return res.status(413).json({
                    code: 'REQUEST_TOO_LARGE',
                    message: 'File is too large',
                });
            }
        } catch (e) {
            // If HEAD fails (missing key / perms / transient), treat as a safe client error.
            console.error('uploadFileForSigning headObject failed:', e?.message);
            return res.status(400).json({ message: 'Invalid fileKey' });
        }

        // Normalize caseId: allow null / empty / 0
        const normalizedCaseId =
            caseId === undefined || caseId === null || caseId === "" || Number(caseId) === 0
                ? null
                : parsePositiveIntStrict(caseId, { min: 1 });

        if (caseId !== undefined && caseId !== null && caseId !== '' && Number(caseId) !== 0 && normalizedCaseId === null) {
            return res.status(400).json({ message: "Invalid parameter: caseId" });
        }

        // If DB doesn't allow NULL caseId, enforce it here with a clear message
        if (normalizedCaseId === null && !schemaSupport.signingfilesCaseIdNullable) {
            return res.status(400).json({
                message: "חובה לבחור תיק (המסד נתונים מוגדר ש-caseId אינו יכול להיות ריק).",
            });
        }

        // For backward compatibility, use first signer as primary clientId
        const primaryClientId = signersList[0].userId || clientId;

        const insertFile = await pool.query(
            `insert into signingfiles
             (caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, notes, expiresat)
             values ($1,$2,$3,$4,$5,$5,'pending',$6,$7)
             returning signingfileid as "SigningFileId"`,
            [normalizedCaseId, lawyerId, primaryClientId, fileName, fileKey, notes || null, expiresAt || null]
        );

        const signingFileId = insertFile.rows[0].SigningFileId;
        console.log('[controller] Created signing file with ID:', signingFileId);

        if (Array.isArray(signatureLocations)) {
            console.log('[controller] Processing', signatureLocations.length, 'signature locations...');
            for (const spot of signatureLocations) {
                // Try to match spot to a specific signer based on signerName or index
                let signerName = spot.signerName || "חתימה ✍️";
                let signerUserId = null;

                // Prefer explicit userId from the client (most reliable)
                if (spot.signerUserId !== undefined && spot.signerUserId !== null && spot.signerUserId !== '') {
                    signerUserId = Number(spot.signerUserId);
                } else if (spot.signeruserid !== undefined && spot.signeruserid !== null && spot.signeruserid !== '') {
                    // Support alternate casing from older clients
                    signerUserId = Number(spot.signeruserid);
                }

                // If spot has a signerIndex, use that signer
                if ((signerUserId === null || Number.isNaN(signerUserId)) && spot.signerIndex !== undefined && spot.signerIndex !== null) {
                    const idx = Number(spot.signerIndex);
                    if (!Number.isNaN(idx) && idx >= 0 && idx < signersList.length) {
                        signerUserId = signersList[idx].userId;
                        signerName = signersList[idx].name;
                    }
                }

                // If we still don't have a userId, try to match by signerName
                if ((signerUserId === null || Number.isNaN(signerUserId)) && signerName && signersList.length > 0) {
                    const match = signersList.find((s) => (s?.name || '').trim() === String(signerName).trim());
                    if (match?.userId) signerUserId = match.userId;
                }

                if (Number.isNaN(signerUserId)) signerUserId = null;

                console.log(`[controller]   Spot page ${spot.pageNum}: signerIndex=${spot.signerIndex}, signerName="${signerName}", signerUserId=${signerUserId}`);

                if (schemaSupport.signaturespotsSignerUserId) {
                    await pool.query(
                        `insert into signaturespots
                         (signingfileid, pagenumber, x, y, width, height, signername, isrequired, signeruserid)
                         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [
                            signingFileId,
                            spot.pageNum || 1,
                            spot.x ?? 50,
                            spot.y ?? 50,
                            spot.width ?? 150,
                            spot.height ?? 75,
                            signerName,
                            spot.isRequired !== false,
                            signerUserId || null,
                        ]
                    );
                } else {
                    // Legacy DB: no signeruserid column
                    await pool.query(
                        `insert into signaturespots
                         (signingfileid, pagenumber, x, y, width, height, signername, isrequired)
                         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
                        [
                            signingFileId,
                            spot.pageNum || 1,
                            spot.x ?? 50,
                            spot.y ?? 50,
                            spot.width ?? 150,
                            spot.height ?? 75,
                            signerName,
                            spot.isRequired !== false,
                        ]
                    );
                }
            }
        }

        // Send notification + public signing link to each signer
        const notifyTargets = schemaSupport.signaturespotsSignerUserId
            ? signersList
            : [{ userId: primaryClientId }];

        for (const signer of notifyTargets) {
            const signerUserId = Number(signer.userId);
            if (!Number.isFinite(signerUserId) || signerUserId <= 0) continue;

            const token = createPublicSigningToken({
                signingFileId,
                signerUserId,
                fileExpiresAt: expiresAt || null,
            });
            const publicUrl = buildPublicSigningUrl(token);

            const message = publicUrl
                ? `מסמך "${fileName}" מחכה לחתימה.\nלחתימה: ${publicUrl}`
                : `מסמך "${fileName}" מחכה לחתימה.`;

            await sendAndStoreNotification(
                signerUserId,
                "מסמך מחכה לחתימה",
                message,
                { signingFileId, type: "signing_pending", token }
            );

            // If the signer has no app push tokens, fallback to SMS.
            try {
                const hasTokensRes = await pool.query(
                    "SELECT 1 FROM UserDevices WHERE UserId = $1 AND FcmToken IS NOT NULL LIMIT 1",
                    [signerUserId]
                );
                const hasPushTokens = (hasTokensRes.rows || []).length > 0;

                if (!hasPushTokens && publicUrl) {
                    const phoneRes = await pool.query(
                        "SELECT phonenumber as \"PhoneNumber\" FROM users WHERE userid = $1",
                        [signerUserId]
                    );
                    const phoneNumber = phoneRes.rows?.[0]?.PhoneNumber;
                    const formattedPhone = formatPhoneNumber(phoneNumber);
                    if (formattedPhone) {
                        await sendMessage(
                            `מסמך מחכה לחתימה: ${fileName}\nלחתימה: ${publicUrl}`,
                            formattedPhone
                        );
                    }
                }
            } catch (e) {
                console.warn('Warning: failed SMS fallback for signing link:', e?.message);
            }
        }

        return res.json({
            success: true,
            signingFileId,
            message: "קובץ נשלח לחתומים לחתימה",
            signerCount: signersList.length,
        });
    } catch (err) {
        console.error("uploadFileForSigning error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בהעלאת הקובץ לחתימה" });
    }
};

exports.getClientSigningFiles = async (req, res) => {
    try {
        const clientId = req.user.UserId;
        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        const schemaSupport = await getSchemaSupport();

        if (!schemaSupport.signaturespotsSignerUserId) {
            // Legacy DB behavior: only primary client sees their files
            const query =
                `select
                    sf.signingfileid      as "SigningFileId",
                    sf.caseid             as "CaseId",
                    sf.filename           as "FileName",
                    sf.filekey            as "FileKey",
                    sf.status             as "Status",
                    sf.createdat          as "CreatedAt",
                    sf.expiresat          as "ExpiresAt",
                    sf.notes              as "Notes",
                    sf.signedat           as "SignedAt",
                    c.casename            as "CaseName",
                    u.name                as "LawyerName",
                    count(ss.signaturespotid)                                       as "TotalSpots",
                    coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
                 from signingfiles sf
                 join cases c  on c.caseid  = sf.caseid
                 join users u  on u.userid  = sf.lawyerid
                 left join signaturespots ss on ss.signingfileid = sf.signingfileid
                 where sf.clientid = $1
                 group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                          sf.status, sf.createdat, sf.expiresat, sf.notes, sf.signedat,
                          c.casename, u.name
                 order by sf.createdat desc` +
                (pagination.enabled ? ` limit $2 offset $3` : ``);

            const params = pagination.enabled
                ? [clientId, pagination.limit, pagination.offset]
                : [clientId];

            const legacy = await pool.query(query, params);

            return res.json({ files: legacy.rows });
        }

        const query =
            `select 
                sf.signingfileid      as "SigningFileId",
                sf.caseid             as "CaseId",
                sf.filename           as "FileName",
                sf.filekey            as "FileKey",
                sf.status             as "Status",
                sf.createdat          as "CreatedAt",
                sf.expiresat          as "ExpiresAt",
                sf.notes              as "Notes",
                sf.signedat           as "SignedAt",
                c.casename            as "CaseName",
                u.name                as "LawyerName",
                count(ss.signaturespotid)                                       as "TotalSpots",
                coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             left join cases c  on c.caseid  = sf.caseid
             join users u  on u.userid  = sf.lawyerid
             left join signaturespots ss
                on ss.signingfileid = sf.signingfileid
               and (ss.signeruserid = $1 or ss.signeruserid is null)
             where sf.clientid = $1
                or exists (
                    select 1
                    from signaturespots ss2
                    where ss2.signingfileid = sf.signingfileid
                      and ss2.signeruserid = $1
                )
             group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                      sf.status, sf.createdat, sf.expiresat, sf.notes, sf.signedat,
                      c.casename, u.name
             order by sf.createdat desc` +
            (pagination.enabled ? ` limit $2 offset $3` : ``);

        const params = pagination.enabled
            ? [clientId, pagination.limit, pagination.offset]
            : [clientId];

        const result = await pool.query(query, params);

        return res.json({ files: result.rows });
    } catch (err) {
        console.error("getClientSigningFiles error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת המסמכים של הלקוח" });
    }
};

exports.getLawyerSigningFiles = async (req, res) => {
    try {
        const lawyerId = req.user.UserId;
        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        const query =
            `select 
                sf.signingfileid      as "SigningFileId",
                sf.caseid             as "CaseId",
                sf.filename           as "FileName",
                sf.status             as "Status",
                sf.createdat          as "CreatedAt",
                sf.signedat           as "SignedAt",
                c.casename            as "CaseName",
                u.name                as "ClientName",
                count(ss.signaturespotid)                                       as "TotalSpots",
                coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             left join cases c  on c.caseid  = sf.caseid
             join users u  on u.userid  = sf.clientid
             left join signaturespots ss on ss.signingfileid = sf.signingfileid
             where sf.lawyerid = $1
             group by sf.signingfileid, sf.caseid, sf.filename,
                      sf.status, sf.createdat, sf.signedat,
                      c.casename, u.name
             order by sf.createdat desc` +
            (pagination.enabled ? ` limit $2 offset $3` : ``);

        const params = pagination.enabled
            ? [lawyerId, pagination.limit, pagination.offset]
            : [lawyerId];

        const result = await pool.query(query, params);

        return res.json({ files: result.rows });
    } catch (err) {
        console.error("getLawyerSigningFiles error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת המסמכים של העו\"ד" });
    }
};

exports.getPendingSigningFiles = async (req, res) => {
    try {
        const clientId = req.user.UserId;
        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        const schemaSupport = await getSchemaSupport();

        if (!schemaSupport.signaturespotsSignerUserId) {
            const query =
                `select
                    sf.signingfileid      as "SigningFileId",
                    sf.caseid             as "CaseId",
                    sf.filename           as "FileName",
                    sf.filekey            as "FileKey",
                    sf.status             as "Status",
                    sf.createdat          as "CreatedAt",
                    sf.expiresat          as "ExpiresAt",
                    sf.notes              as "Notes",
                    c.casename            as "CaseName",
                    u.name                as "LawyerName",
                    count(ss.signaturespotid)                                       as "TotalSpots",
                    coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
                 from signingfiles sf
                 join cases c  on c.caseid  = sf.caseid
                 join users u  on u.userid  = sf.lawyerid
                 left join signaturespots ss on ss.signingfileid = sf.signingfileid
                 where sf.clientid = $1
                   and sf.status in ('pending','rejected')
                 group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                          sf.status, sf.createdat, sf.expiresat, sf.notes,
                          c.casename, u.name
                 order by sf.createdat desc` +
                (pagination.enabled ? ` limit $2 offset $3` : ``);

            const params = pagination.enabled
                ? [clientId, pagination.limit, pagination.offset]
                : [clientId];

            const legacy = await pool.query(query, params);

            return res.json({ files: legacy.rows });
        }

        const query =
            `select 
                sf.signingfileid      as "SigningFileId",
                sf.caseid             as "CaseId",
                sf.filename           as "FileName",
                sf.filekey            as "FileKey",
                sf.status             as "Status",
                sf.createdat          as "CreatedAt",
                sf.expiresat          as "ExpiresAt",
                sf.notes              as "Notes",
                c.casename            as "CaseName",
                u.name                as "LawyerName",
                count(ss.signaturespotid)                                       as "TotalSpots",
                coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             left join cases c  on c.caseid  = sf.caseid
             join users u  on u.userid  = sf.lawyerid
                         left join signaturespots ss
                                on ss.signingfileid = sf.signingfileid
                             and (ss.signeruserid = $1 or ss.signeruserid is null)
                         where (sf.clientid = $1
                                or exists (
                                        select 1
                                        from signaturespots ss2
                                        where ss2.signingfileid = sf.signingfileid
                                            and ss2.signeruserid = $1
                                ))
               and sf.status in ('pending','rejected')
             group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                      sf.status, sf.createdat, sf.expiresat, sf.notes,
                      c.casename, u.name
             order by sf.createdat desc` +
            (pagination.enabled ? ` limit $2 offset $3` : ``);

        const params = pagination.enabled
            ? [clientId, pagination.limit, pagination.offset]
            : [clientId];

        const result = await pool.query(query, params);

        return res.json({ files: result.rows });
    } catch (err) {
        console.error("getPendingSigningFiles error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת מסמכים ממתינים" });
    }
};

exports.getSigningFileDetails = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid   as "SigningFileId",
                caseid          as "CaseId",
                lawyerid        as "LawyerId",
                clientid        as "ClientId",
                filename        as "FileName",
                filekey         as "FileKey",
                originalfilekey as "OriginalFileKey",
                status          as "Status",
                signedfilekey   as "SignedFileKey",
                signedat        as "SignedAt",
                createdat       as "CreatedAt",
                expiresat       as "ExpiresAt",
                rejectionreason as "RejectionReason",
                notes           as "Notes"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        const isLawyer = file.LawyerId === userId;
        const isPrimaryClient = file.ClientId === userId;

        // Multi-signer support: allow access if user is assigned to at least one spot
        let isAssignedSigner = false;
        if (schemaSupport.signaturespotsSignerUserId && !isLawyer && !isPrimaryClient) {
            const signerRes = await pool.query(
                `select 1
                 from signaturespots
                 where signingfileid = $1 and signeruserid = $2
                 limit 1`,
                [signingFileId, userId]
            );
            isAssignedSigner = signerRes.rows.length > 0;
        }

        if (!isLawyer && !isPrimaryClient && !isAssignedSigner) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה", code: 'FORBIDDEN' });
        }

        // If user is NOT the lawyer (i.e., user is a client), filter spots to only show their assigned spots
        let spotsQuery = `select
                signaturespotid as "SignatureSpotId",
                signingfileid   as "SigningFileId",
                pagenumber      as "PageNumber",
                x               as "X",
                y               as "Y",
                width           as "Width",
                height          as "Height",
                signername      as "SignerName",
                isrequired      as "IsRequired",
                issigned        as "IsSigned",
                signaturedata   as "SignatureData",
                signedat        as "SignedAt",
            createdat       as "CreatedAt"${schemaSupport.signaturespotsSignerUserId ? ',\n                signeruserid    as "SignerUserId"' : ''}
             from signaturespots
             where signingfileid = $1`;

        const spotsParams = [signingFileId];

        // If client (not lawyer), only show their own signature spots
        if (schemaSupport.signaturespotsSignerUserId && !isLawyer) {
            spotsQuery += ` and (signeruserid = $2 or signeruserid is null)`;
            spotsParams.push(userId);
        }

        spotsQuery += ` order by pagenumber, y, x`;

        const spotsResult = await pool.query(spotsQuery, spotsParams);

        // Attach short-lived read URLs for signature images (if present) so UI can display them.
        // NOTE: Access control is already enforced above and (for clients) the spots are filtered.
        const signatureSpots = await Promise.all(
            (spotsResult.rows || []).map(async (spot) => {
                const signatureData = spot?.SignatureData;
                if (!signatureData) return spot;

                // Some legacy rows may already store a full URL.
                if (typeof signatureData === "string" && /^https?:\/\//i.test(signatureData)) {
                    return { ...spot, SignatureUrl: signatureData };
                }

                try {
                    const cmd = new GetObjectCommand({
                        Bucket: BUCKET,
                        Key: signatureData,
                        ResponseContentDisposition: "inline",
                    });

                    const signatureUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 });
                    return { ...spot, SignatureUrl: signatureUrl };
                } catch (e) {
                    // If presigning fails, don't break details response.
                    console.error("Failed to presign signature read URL", e);
                    return spot;
                }
            })
        );

        return res.json({
            file,
            signatureSpots,
            isLawyer,
        });
    } catch (err) {
        console.error("getSigningFileDetails error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת פרטי המסמך" });
    }
};

// Creates a signed public token that allows a specific user to sign without logging in.
// Used for shareable links: the token is the only credential.
exports.createPublicSigningLink = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;

        const signerUserId = parsePositiveIntStrict(req?.body?.signerUserId) ?? null;
        const requesterId = req.user?.UserId;

        const fileResult = await pool.query(
            `select signingfileid as "SigningFileId",
                    lawyerid      as "LawyerId",
                    clientid      as "ClientId",
                    expiresat     as "ExpiresAt"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: 'המסמך לא נמצא' });
        }

        const file = fileResult.rows[0];

        // Only the owning lawyer can generate a public link.
        if (Number(file.LawyerId) !== Number(requesterId)) {
            return res.status(403).json({ message: 'אין הרשאה למסמך זה', code: 'FORBIDDEN' });
        }

        const targetSignerUserId = signerUserId || file.ClientId;
        if (!targetSignerUserId) {
            return res.status(400).json({ message: 'Missing signerUserId' });
        }

        // Keep the public-link endpoint behavior consistent with notifications.
        const token = createPublicSigningToken({
            signingFileId,
            signerUserId: targetSignerUserId,
            fileExpiresAt: file.ExpiresAt || null,
        });

        const decoded = jwt.verify(token, getJwtSecret());
        const nowSeconds = Math.floor(Date.now() / 1000);
        const expiresIn = Math.max(60, Number(decoded?.exp || 0) - nowSeconds);

        return res.json({ token, expiresIn });
    } catch (err) {
        console.error('createPublicSigningLink error:', err);
        return res.status(500).json({ message: 'שגיאה ביצירת קישור לחתימה' });
    }
};

exports.getPublicSigningFileDetails = async (req, res) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return res.status(verified.status).json({ message: verified.message });
        }

        const { signingFileId, signerUserId } = verified;
        const schemaSupport = await getSchemaSupport();

        const authz = await ensurePublicUserAuthorized({ signingFileId, userId: signerUserId, schemaSupport });
        if (!authz.ok) {
            return res.status(authz.status).json({ message: authz.message, code: authz.code });
        }

        const { file, isLawyer } = authz;

        let spotsQuery = `select
                signaturespotid as "SignatureSpotId",
                signingfileid   as "SigningFileId",
                pagenumber      as "PageNumber",
                x               as "X",
                y               as "Y",
                width           as "Width",
                height          as "Height",
                signername      as "SignerName",
                isrequired      as "IsRequired",
                issigned        as "IsSigned",
                signaturedata   as "SignatureData",
                signedat        as "SignedAt",
                createdat       as "CreatedAt"${schemaSupport.signaturespotsSignerUserId ? ',\n                signeruserid    as "SignerUserId"' : ''}
             from signaturespots
             where signingfileid = $1`;

        const spotsParams = [signingFileId];

        if (schemaSupport.signaturespotsSignerUserId && !isLawyer) {
            spotsQuery += ` and (signeruserid = $2 or signeruserid is null)`;
            spotsParams.push(signerUserId);
        }

        spotsQuery += ` order by pagenumber, y, x`;

        const spotsResult = await pool.query(spotsQuery, spotsParams);

        const signatureSpots = await Promise.all(
            (spotsResult.rows || []).map(async (spot) => {
                const signatureData = spot?.SignatureData;
                if (!signatureData) return spot;
                if (typeof signatureData === 'string' && /^https?:\/\//i.test(signatureData)) {
                    return { ...spot, SignatureUrl: signatureData };
                }

                try {
                    const cmd = new GetObjectCommand({
                        Bucket: BUCKET,
                        Key: signatureData,
                        ResponseContentDisposition: 'inline',
                    });
                    const signatureUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 });
                    return { ...spot, SignatureUrl: signatureUrl };
                } catch (e) {
                    console.error('Failed to presign signature read URL', e);
                    return spot;
                }
            })
        );

        return res.json({
            file,
            signatureSpots,
            isLawyer,
        });
    } catch (err) {
        console.error('getPublicSigningFileDetails error:', err);
        return res.status(500).json({ message: 'שגיאה בשליפת פרטי המסמך' });
    }
};

exports.publicSignFile = async (req, res) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return res.status(verified.status).json({ message: verified.message });
        }

        const { signingFileId, signerUserId } = verified;

        const signatureSpotId = requireInt(req, res, { source: 'body', name: 'signatureSpotId' });
        if (signatureSpotId === null) return;

        const { signatureImage } = req.body;
        const userId = signerUserId;

        const schemaSupport = await getSchemaSupport();

        // Reuse the same signing logic/authorization as the authenticated endpoint.
        req.params.signingFileId = String(signingFileId);
        req.user = { UserId: userId };
        return exports.signFile(req, res);
    } catch (err) {
        console.error('publicSignFile error:', err);
        return res.status(500).json({ message: 'שגיאה בשמירת החתימה' });
    }
};

exports.publicRejectSigning = async (req, res) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return res.status(verified.status).json({ message: verified.message });
        }

        const { signingFileId, signerUserId } = verified;
        req.params.signingFileId = String(signingFileId);
        req.user = { UserId: signerUserId };
        return exports.rejectSigning(req, res);
    } catch (err) {
        console.error('publicRejectSigning error:', err);
        return res.status(500).json({ message: 'שגיאה בדחיית המסמך' });
    }
};

exports.getPublicSigningFilePdf = async (req, res) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return res.status(verified.status).json({ message: verified.message });
        }

        const { signingFileId, signerUserId } = verified;
        req.params.signingFileId = String(signingFileId);
        req.user = { UserId: signerUserId };
        return exports.getSigningFilePdf(req, res);
    } catch (err) {
        console.error('getPublicSigningFilePdf error:', err);
        return res.status(500).json({ message: 'שגיאה בטעינת PDF' });
    }
};


exports.signFile = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;

        const signatureSpotId = requireInt(req, res, { source: 'body', name: 'signatureSpotId' });
        if (signatureSpotId === null) return;

        const { signatureImage } = req.body;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                caseid        as "CaseId",
                lawyerid      as "LawyerId",
                clientid      as "ClientId",
                filename      as "FileName",
                filekey       as "FileKey",
                status        as "Status",
                signedfilekey as "SignedFileKey",
                signedat      as "SignedAt"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        // Allow signing if user is the primary client OR if they're assigned as a specific signer
        const spotResult = await pool.query(
            `select
                signaturespotid as "SignatureSpotId",
                signingfileid   as "SigningFileId",
                issigned        as "IsSigned"${schemaSupport.signaturespotsSignerUserId ? ',\n                signeruserid    as "SignerUserId"' : ''}
             from signaturespots
             where signaturespotid = $1 and signingfileid = $2`,
            [signatureSpotId, signingFileId]
        );

        if (spotResult.rows.length === 0) {
            return res.status(400).json({ message: "מקום חתימה לא תקין" });
        }

        const spot = spotResult.rows[0];

        // Check authorization: user can sign if they're the primary client OR specifically assigned to this spot
        const isAuthorized = schemaSupport.signaturespotsSignerUserId
            ? (file.ClientId === userId || (spot.SignerUserId && spot.SignerUserId === userId))
            : (file.ClientId === userId);

        if (!isAuthorized) {
            return res.status(403).json({ message: "אין הרשאה לחתום על מקום חתימה זה", code: 'FORBIDDEN' });
        }

        if (spot.IsSigned) {
            return res.status(400).json({ message: "מקום החתימה כבר חתום" });
        }

        if (signatureImage) {
            const isPng = signatureImage.includes("png");
            const ext = isPng ? "png" : "jpg";
            const key = `signatures/${file.LawyerId}/${userId}/${signingFileId}_${signatureSpotId}.${ext}`;

            let buffer;
            try {
                ({ buffer } = decodeBase64DataUrl(signatureImage));
            } catch {
                return res.status(400).json({ message: 'Invalid signature image' });
            }

            if (
                Number.isFinite(MAX_SIGNATURE_IMAGE_BYTES) &&
                MAX_SIGNATURE_IMAGE_BYTES > 0 &&
                buffer.length > MAX_SIGNATURE_IMAGE_BYTES
            ) {
                return res.status(413).json({
                    code: 'REQUEST_TOO_LARGE',
                    message: 'Signature image is too large',
                });
            }

            const cmd = new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: `image/${ext}`,
            });

            await r2.send(cmd);

            await pool.query(
                `update signaturespots
                 set issigned = true,
                     signedat = now(),
                     signaturedata = $1
                 where signaturespotid = $2`,
                [key, signatureSpotId]
            );
        } else {
            await pool.query(
                `update signaturespots
                 set issigned = true,
                     signedat = now()
                 where signaturespotid = $1`,
                [signatureSpotId]
            );
        }

        const remainingResult = await pool.query(
            `select count(*)::int as "count"
             from signaturespots
             where signingfileid = $1
               and isrequired = true
               and issigned = false`,
            [signingFileId]
        );

        const remaining = remainingResult.rows[0].count;

        if (remaining === 0) {
            await pool.query(
                `update signingfiles
                 set status = 'signed',
                     signedat = now()
                 where signingfileid = $1`,
                [signingFileId]
            );

            await sendAndStoreNotification(
                file.LawyerId,
                "✓ קובץ חתום",
                `הקובץ ${file.FileName} חתום בהצלחה על ידי כל החתומים`,
                { signingFileId, type: "file_signed" }
            );
        }

        return res.json({ success: true, message: "✓ החתימה נשמרה בהצלחה" });
    } catch (err) {
        console.error("signFile error:", err);
        return res.status(500).json({ message: "שגיאה בשמירת החתימה" });
    }
};

exports.rejectSigning = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const { rejectionReason } = req.body;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                clientid      as "ClientId",
                lawyerid      as "LawyerId",
                filename      as "FileName"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        // Check if user can reject: either primary client or assigned signer
        let isAuthorized = file.ClientId === userId;
        if (schemaSupport.signaturespotsSignerUserId && !isAuthorized) {
            const spotResult = await pool.query(
                `select count(*)::int as "count"
                 from signaturespots
                 where signingfileid = $1
                   and (signeruserid = $2 or signeruserid is null)`,
                [signingFileId, userId]
            );
            const isAssignedSigner = spotResult.rows[0].count > 0;
            isAuthorized = isAuthorized || isAssignedSigner;
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה", code: 'FORBIDDEN' });
        }

        // Reset all signatures for this file
        await pool.query(
            `update signaturespots
             set issigned = false,
                 signedat = null,
                 signaturedata = null
             where signingfileid = $1`,
            [signingFileId]
        );

        await pool.query(
            `update signingfiles
             set status = 'rejected',
                 rejectionreason = $1
             where signingfileid = $2`,
            [rejectionReason || null, signingFileId]
        );

        await sendAndStoreNotification(
            file.LawyerId,
            "❌ קובץ נדחה",
            `${file.FileName} נדחה על ידי חותם. סיבה: ${rejectionReason || "לא צוינה"}`,
            { signingFileId, type: "file_rejected" }
        );

        return res.json({ success: true, message: "✓ המסמך נדחה בהצלחה" });
    } catch (err) {
        console.error("rejectSigning error:", err);
        return res.status(500).json({ message: "שגיאה בדחיית המסמך" });
    }
};

exports.reuploadFile = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const { fileKey, signatureLocations, signers } = req.body;
        const lawyerId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                lawyerid      as "LawyerId",
                clientid      as "ClientId",
                filename      as "FileName"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        if (file.LawyerId !== lawyerId) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה", code: 'FORBIDDEN' });
        }

        await pool.query(
            `update signingfiles
             set filekey = $1,
                 originalfilekey = $1,
                 status = 'pending',
                 rejectionreason = null,
                 signedfilekey = null,
                 signedat = null
             where signingfileid = $2`,
            [fileKey, signingFileId]
        );

        await pool.query(
            `delete from signaturespots
             where signingfileid = $1`,
            [signingFileId]
        );

        if (Array.isArray(signatureLocations)) {
            // Support both legacy and multi-signer reupload
            const signersList = signers && Array.isArray(signers) ? signers : [];
            for (const spot of signatureLocations) {
                let signerUserId = null;
                let signerName = spot.signerName || "חתימה";

                // Prefer explicit userId from the client
                if (spot.signerUserId !== undefined && spot.signerUserId !== null && spot.signerUserId !== '') {
                    signerUserId = Number(spot.signerUserId);
                } else if (spot.SignerUserId !== undefined && spot.SignerUserId !== null && spot.SignerUserId !== '') {
                    signerUserId = Number(spot.SignerUserId);
                } else if (spot.signeruserid !== undefined && spot.signeruserid !== null && spot.signeruserid !== '') {
                    signerUserId = Number(spot.signeruserid);
                }

                // Fallback to signerIndex
                if ((signerUserId === null || Number.isNaN(signerUserId)) && spot.signerIndex !== undefined && spot.signerIndex !== null) {
                    const idx = Number(spot.signerIndex);
                    if (!Number.isNaN(idx) && idx >= 0 && idx < signersList.length) {
                        signerUserId = signersList[idx].userId;
                        signerName = signersList[idx].name || signerName;
                    }
                }

                // Fallback to signerName match
                if ((signerUserId === null || Number.isNaN(signerUserId)) && signerName && signersList.length > 0) {
                    const match = signersList.find((s) => (s?.name || '').trim() === String(signerName).trim());
                    if (match?.userId) signerUserId = match.userId;
                }

                if (Number.isNaN(signerUserId)) signerUserId = null;

                if (schemaSupport.signaturespotsSignerUserId) {
                    await pool.query(
                        `insert into signaturespots
                         (signingfileid, pagenumber, x, y, width, height, signername, isrequired, signeruserid)
                         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [
                            signingFileId,
                            spot.pageNum || 1,
                            spot.x ?? 50,
                            spot.y ?? 50,
                            spot.width ?? 150,
                            spot.height ?? 75,
                            signerName,
                            spot.isRequired !== false,
                            signerUserId || null,
                        ]
                    );
                } else {
                    await pool.query(
                        `insert into signaturespots
                         (signingfileid, pagenumber, x, y, width, height, signername, isrequired)
                         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
                        [
                            signingFileId,
                            spot.pageNum || 1,
                            spot.x ?? 50,
                            spot.y ?? 50,
                            spot.width ?? 150,
                            spot.height ?? 75,
                            signerName,
                            spot.isRequired !== false,
                        ]
                    );
                }
            }
        }

        if (schemaSupport.signaturespotsSignerUserId) {
            // Notify all signers (fallback to primary client)
            const signerUserIdsRes = await pool.query(
                `select distinct signeruserid as "SignerUserId"
                 from signaturespots
                 where signingfileid = $1
                   and signeruserid is not null`,
                [signingFileId]
            );

            const signerUserIds = signerUserIdsRes.rows
                .map((r) => r.SignerUserId)
                .filter((v) => v !== null && v !== undefined);

            const notifyTargets = signerUserIds.length > 0 ? signerUserIds : [file.ClientId];
            for (const targetUserId of notifyTargets) {
                const token = createPublicSigningToken({
                    signingFileId,
                    signerUserId: Number(targetUserId),
                    fileExpiresAt: null,
                });
                const publicUrl = buildPublicSigningUrl(token);

                const message = publicUrl
                    ? `המסמך "${file.FileName}" הועלה מחדש לחתימה.\nלחתימה: ${publicUrl}`
                    : `המסמך "${file.FileName}" הועלה מחדש לחתימה.`;

                await sendAndStoreNotification(
                    targetUserId,
                    "מסמך מחכה לחתימה",
                    message,
                    { signingFileId, type: "file_reuploaded", token }
                );

                try {
                    const hasTokensRes = await pool.query(
                        "SELECT 1 FROM UserDevices WHERE UserId = $1 AND FcmToken IS NOT NULL LIMIT 1",
                        [targetUserId]
                    );
                    const hasPushTokens = (hasTokensRes.rows || []).length > 0;
                    if (!hasPushTokens && publicUrl) {
                        const phoneRes = await pool.query(
                            "SELECT phonenumber as \"PhoneNumber\" FROM users WHERE userid = $1",
                            [targetUserId]
                        );
                        const phoneNumber = phoneRes.rows?.[0]?.PhoneNumber;
                        const formattedPhone = formatPhoneNumber(phoneNumber);
                        if (formattedPhone) {
                            await sendMessage(
                                `מסמך מחכה לחתימה: ${file.FileName}\nלחתימה: ${publicUrl}`,
                                formattedPhone
                            );
                        }
                    }
                } catch (e) {
                    console.warn('Warning: failed SMS fallback for reupload link:', e?.message);
                }
            }
        } else {
            // Legacy DB: notify only primary client
            const token = createPublicSigningToken({
                signingFileId,
                signerUserId: Number(file.ClientId),
                fileExpiresAt: null,
            });
            const publicUrl = buildPublicSigningUrl(token);

            const message = publicUrl
                ? `המסמך "${file.FileName}" הועלה מחדש לחתימה.\nלחתימה: ${publicUrl}`
                : `המסמך "${file.FileName}" הועלה מחדש לחתימה.`;

            await sendAndStoreNotification(
                file.ClientId,
                "מסמך מחכה לחתימה",
                message,
                { signingFileId, type: "file_reuploaded", token }
            );
        }

        return res.json({ success: true, message: "הקובץ הועלה מחדש לחתימה" });
    } catch (err) {
        console.error("reuploadFile error:", err);
        return res.status(500).json({ message: "שגיאה בהעלאת קובץ מחדש" });
    }
};

exports.getSignedFileDownload = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid  as "SigningFileId",
                lawyerid       as "LawyerId",
                clientid       as "ClientId",
                filename       as "FileName",
                status         as "Status",
                signedfilekey  as "SignedFileKey",
                filekey        as "FileKey"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        const isLawyer = file.LawyerId === userId;
        const isPrimaryClient = file.ClientId === userId;
        let isAssignedSigner = false;

        if (schemaSupport.signaturespotsSignerUserId && !isLawyer && !isPrimaryClient) {
            const signerRes = await pool.query(
                `select 1
                 from signaturespots
                 where signingfileid = $1 and signeruserid = $2
                 limit 1`,
                [signingFileId, userId]
            );
            isAssignedSigner = signerRes.rows.length > 0;
        }

        if (!isLawyer && !isPrimaryClient && !isAssignedSigner) {
            return res.status(403).json({ message: "אין הרשאה להוריד מסמך זה", code: 'FORBIDDEN' });
        }

        if (file.Status !== "signed" && !file.SignedFileKey) {
            return res.status(400).json({ message: "המסמך עדיין לא חתום" });
        }

        // If the file is signed but we don't yet have a flattened PDF, generate it on-demand.
        let key = file.SignedFileKey;
        if (!key) {
            try {
                key = await ensureSignedPdfKey({
                    signingFileId,
                    lawyerId: file.LawyerId,
                    pdfKey: file.FileKey,
                });
            } catch (e) {
                console.error("Failed to generate signed PDF; falling back to original", e);
            }
        }

        // Fallback: original file (may not contain signatures) if generation failed
        key = key || file.FileKey;

        const cmd = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ResponseContentDisposition: `attachment; filename="${file.FileName}"`,
        });

        const downloadUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 });

        return res.json({ downloadUrl, expiresIn: 600 });
    } catch (err) {
        console.error("getSignedFileDownload error:", err);
        return res.status(500).json({ message: "שגיאה ביצירת קישור הורדה" });
    }
};

// Streams the original PDF (filekey) for in-app viewing (react-pdf/pdfjs).
// Supports Range requests so pdf.js can efficiently load pages.
exports.getSigningFilePdf = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select
                signingfileid as "SigningFileId",
                lawyerid      as "LawyerId",
                clientid      as "ClientId",
                filename      as "FileName",
                filekey       as "FileKey"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        const isLawyer = file.LawyerId === userId;
        const isPrimaryClient = file.ClientId === userId;
        let isAssignedSigner = false;

        if (schemaSupport.signaturespotsSignerUserId && !isLawyer && !isPrimaryClient) {
            const signerRes = await pool.query(
                `select 1
                 from signaturespots
                 where signingfileid = $1 and signeruserid = $2
                 limit 1`,
                [signingFileId, userId]
            );
            isAssignedSigner = signerRes.rows.length > 0;
        }

        if (!isLawyer && !isPrimaryClient && !isAssignedSigner) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה", code: 'FORBIDDEN' });
        }

        if (!file.FileKey) {
            return res.status(404).json({ message: "לקובץ אין FileKey" });
        }

        const range = req.headers.range;
        const cmd = new GetObjectCommand({
            Bucket: BUCKET,
            Key: file.FileKey,
            ...(range ? { Range: range } : {}),
        });

        const obj = await r2.send(cmd);

        res.setHeader("Content-Type", obj.ContentType || "application/pdf");
        res.setHeader("Accept-Ranges", "bytes");
        // pdf.js runs in the browser and needs access to these headers when CORS is in play.
        // Without Access-Control-Expose-Headers, the browser hides them from JS.
        res.setHeader(
            "Access-Control-Expose-Headers",
            "Accept-Ranges, Content-Range, Content-Length, Content-Type, Content-Disposition"
        );
        // Keep Content-Disposition ASCII-safe to avoid Node throwing on non-Latin filenames (e.g. Hebrew).
        res.setHeader("Content-Disposition", "inline");

        if (obj.ContentLength !== undefined) {
            res.setHeader("Content-Length", String(obj.ContentLength));
        }

        if (range && obj.ContentRange) {
            res.status(206);
            res.setHeader("Content-Range", String(obj.ContentRange));
        }

        if (!obj.Body) {
            return res.status(500).json({ message: "שגיאה בקריאת הקובץ" });
        }

        obj.Body.pipe(res);
    } catch (err) {
        console.error("getSigningFilePdf error:", err);
        return res.status(500).json({ message: "שגיאה בטעינת PDF" });
    }
};

exports.detectSignatureSpots = async (req, res) => {
    try {
        const { fileKey, signers } = req.body;

        if (isSigningDebugEnabled()) {
            console.log('[signing] detectSignatureSpots', {
                userId: req.user?.UserId,
                fileKeyHint: safeKeyHint(fileKey),
                signerCount: Array.isArray(signers) ? signers.length : undefined,
            });
        }

        if (!fileKey) return res.status(400).json({ message: "missing fileKey" });

        // Prevent arbitrary reads from the bucket via guessed keys.
        // Our upload flow uses keys prefixed with `users/<userId>/...`.
        const userId = req.user?.UserId;
        if (!userId || !String(fileKey).startsWith(`users/${userId}/`)) {
            return res.status(403).json({ message: "Forbidden", code: 'FORBIDDEN' });
        }


        // Enforce PDF size before downloading into memory.
        try {
            const head = await headR2Object({ key: fileKey });
            const size = Number(head?.ContentLength || 0);
            if (Number.isFinite(MAX_SIGNING_PDF_BYTES) && MAX_SIGNING_PDF_BYTES > 0 && size > MAX_SIGNING_PDF_BYTES) {
                return res.status(413).json({
                    code: 'REQUEST_TOO_LARGE',
                    message: 'File is too large',
                });
            }
        } catch (e) {
            console.error('detectSignatureSpots headObject failed:', e?.message);
            return res.status(400).json({ message: 'Invalid fileKey' });
        }

        const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: fileKey });
        const obj = await withTimeout(r2.send(cmd), SIGNING_PDF_OP_TIMEOUT_MS, 'R2 get timeout');
        const buffer = await withTimeout(streamToBuffer(obj.Body), SIGNING_PDF_OP_TIMEOUT_MS, 'PDF download timeout');

        const spots = await withTimeout(
            detectHebrewSignatureSpotsFromPdfBuffer(
                buffer,
                signers && Array.isArray(signers) ? signers : null
            ),
            SIGNING_PDF_OP_TIMEOUT_MS,
            'Signature detection timeout'
        );

        if (req.__aborted) return;
        return res.json({ spots, signerCount: signers?.length || 1 });
    } catch (err) {
        const msg = String(err?.message || '');
        if (msg.toLowerCase().includes('timeout')) {
            return res.status(504).json({ code: 'REQUEST_TIMEOUT', message: 'Request timed out' });
        }
        console.error('[controller] detectSignatureSpots error:', err?.message || err);
        return res.status(500).json({ message: "failed to detect signature spots" });
    }
};
