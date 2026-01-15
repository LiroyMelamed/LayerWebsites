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
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { v4: uuid } = require("uuid");
const crypto = require('crypto');
const { renderEvidencePdf, loadFileAsDataUrl } = require('../lib/renderEvidencePdf');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { Readable } = require('stream');
const { requireInt, parsePositiveIntStrict } = require("../utils/paramValidation");
const { getPagination } = require("../utils/pagination");
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const QRCode = require('qrcode');

const BASE_RENDER_WIDTH = 800;

const MAX_SIGNING_PDF_BYTES = Number(
    process.env.MAX_SIGNING_PDF_BYTES || String(25 * 1024 * 1024)
);
const MAX_SIGNATURE_IMAGE_BYTES = Number(
    process.env.MAX_SIGNATURE_IMAGE_BYTES || String(512 * 1024)
);
const SIGNING_PDF_OP_TIMEOUT_MS = Number(process.env.SIGNING_PDF_OP_TIMEOUT_MS || 20_000);
const SIGNING_OTP_TTL_SECONDS = Number(process.env.SIGNING_OTP_TTL_SECONDS || 10 * 60);
const SIGNING_OTP_MAX_ATTEMPTS = Number(process.env.SIGNING_OTP_MAX_ATTEMPTS || 5);
const SIGNING_OTP_LOCK_MINUTES = Number(process.env.SIGNING_OTP_LOCK_MINUTES || 10);
const SIGNING_REQUIRE_OTP_DEFAULT = String(process.env.SIGNING_REQUIRE_OTP_DEFAULT ?? 'true').toLowerCase() !== 'false';
const SIGNING_OTP_ENABLED = String(process.env.SIGNING_OTP_ENABLED ?? 'false').toLowerCase() === 'true';

function appError(errorCode, httpStatus, { message, meta, extras, legacyAliases } = {}) {
    return createAppError(
        String(errorCode),
        Number(httpStatus) || 500,
        message || getHebrewMessage(errorCode),
        meta,
        extras,
        legacyAliases
    );
}

function fail(next, errorCode, httpStatus, options) {
    return next(appError(errorCode, httpStatus, options));
}

function getSigningOtpPepper() {
    const p = String(process.env.SIGNING_OTP_PEPPER || '').trim();
    if (!p) throw new Error('SIGNING_OTP_PEPPER is not set');
    return p;
}

// Legally relevant: this version is persisted on each signing request and surfaced in evidence packages.
const SIGNING_POLICY_VERSION = String(process.env.SIGNING_POLICY_VERSION || '2026-01-11');

// Legally relevant: the exact consent text presented in the UI must match this version.
// If the consent text changes materially, bump SIGNING_POLICY_VERSION.
const SIGNING_CONSENT_TEXT = String(
    process.env.SIGNING_CONSENT_TEXT ||
    'אני מאשר/ת כי קראתי את המסמך המוצג, ואני נותן/ת הסכמה לחתום עליו באופן אלקטרוני. ידוע לי כי חתימה ללא אימות OTP עשויה להפחית את חוזק הראיות במקרה של מחלוקת.'
);

function sha256Hex(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isProductionFailClosed() {
    return String(process.env.IS_PRODUCTION || '').toLowerCase() === 'true';
}

function formatUtcZipTimestamp(dateLike = new Date()) {
    const d = new Date(dateLike);
    const yyyy = String(d.getUTCFullYear());
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${min}`;
}

function parseSafeFilenameFromContentDisposition(headerValue) {
    const v = String(headerValue || '');
    const m = v.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const raw = decodeURIComponent((m?.[1] || m?.[2] || '').trim());
    return raw ? raw.replace(/[\\/\r\n\t]/g, '_') : null;
}

function getEvidenceReadmeHebrew() {
    return [
        'חבילת ראיות — מסמך חתום (ללא תעודה/PKI)',
        '',
        'תכולה:',
        '1) signed.pdf — המסמך החתום (בדיוק הבייטים כפי שנשמרו)',
        '2) manifest.json — תקציר משפטי/טכני (מטא-דאטה, מדיניות OTP, ייחוס, גדלים, חותמות זמן)',
        '3) audit_events.json — לוג אירועים בלתי-ניתן-לשינוי (append-only) עבור המסמך',
        '4) consent.json — רשומות הסכמה (נוסח + חותמת זמן + IP/UA)',
        '5) otp.json — מטא-דאטה של אימות OTP (ללא קודים); או הצהרה שה-OTP ויתרו עליו + אישור ויתור',
        '6) hashes.json — טביעות SHA-256 (PDF מקורי/מוצג/חתום + חתימה לכל נקודת חתימה)',
        '7) storage.json — ראיות אחסון (bucket/key/etag/versionId) עבור אובייקטים רלוונטיים',
        '',
        'איך לאמת שלמות:',
        '- חשבו SHA-256 ל-signed.pdf והשוו לערך signed_pdf_sha256 ב-manifest.json או hashes.json.',
        '- ניתן להשתמש בפקודה (דוגמה):',
        '  Windows PowerShell: Get-FileHash .\\signed.pdf -Algorithm SHA256',
        '  Linux/macOS: sha256sum signed.pdf',
        '',
        'הערה:',
        '- חבילת ראיות זו מיועדת לשימוש ראייתי בהקשר חתימה אלקטרונית שאינה PKI.',
        '- אין בחבילה זו פרטי סוד (למשל קודי OTP).',
        '',
    ].join('\n');
}

async function loadEvidenceRowsForZip(signingFileId) {
    const [fileEvidenceRes, spotsRes, consentRes, otpRes, auditRes] = await Promise.all([
        pool.query(
            `select
                signingfileid as "SigningFileId",
                caseid as "CaseId",
                lawyerid as "LawyerId",
                clientid as "ClientId",
                filename as "FileName",
                filekey as "FileKey",
                originalfilekey as "OriginalFileKey",
                status as "Status",
                createdat as "CreatedAt",
                signedat as "SignedAt",
                signedfilekey as "SignedFileKey",
                immutableatutc as "ImmutableAtUtc",

                    requireotp as "RequireOtp",
                signingpolicyversion as "SigningPolicyVersion",
                policyselectedbyuserid as "PolicySelectedByUserId",
                policyselectedatutc as "PolicySelectedAtUtc",
                otpwaiveracknowledged as "OtpWaiverAcknowledged",
                otpwaiveracknowledgedatutc as "OtpWaiverAcknowledgedAtUtc",
                otpwaiveracknowledgedbyuserid as "OtpWaiverAcknowledgedByUserId",

                originalpdfsha256 as "OriginalPdfSha256",
                presentedpdfsha256 as "PresentedPdfSha256",
                signedpdfsha256 as "SignedPdfSha256",

                originalstoragebucket as "OriginalStorageBucket",
                originalstoragekey as "OriginalStorageKey",
                originalstorageetag as "OriginalStorageEtag",
                originalstorageversionid as "OriginalStorageVersionId",

                signedstoragebucket as "SignedStorageBucket",
                signedstoragekey as "SignedStorageKey",
                signedstorageetag as "SignedStorageEtag",
                signedstorageversionid as "SignedStorageVersionId"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        ),
        pool.query(
            `select
                signaturespotid as "SignatureSpotId",
                pagenumber as "PageNumber",
                x as "X",
                y as "Y",
                width as "Width",
                height as "Height",
                signername as "SignerName",
                signeruserid as "SignerUserId",
                isrequired as "IsRequired",
                issigned as "IsSigned",
                signedat as "SignedAt",
                signaturedata as "SignatureDataKey",

                signerip as "SignerIp",
                signeruseragent as "SignerUserAgent",
                signingsessionid as "SigningSessionId",
                presentedpdfsha256 as "PresentedPdfSha256",
                otpverificationid as "OtpVerificationId",
                consentid as "ConsentId",
                signatureimagesha256 as "SignatureImageSha256",
                signaturestorageetag as "SignatureStorageEtag",
                signaturestorageversionid as "SignatureStorageVersionId"
             from signaturespots
             where signingfileid = $1
             order by pagenumber, y, x`,
            [signingFileId]
        ),
        pool.query(
            `select
                consentid as "ConsentId",
                signeruserid as "SignerUserId",
                signingsessionid as "SigningSessionId",
                consentversion as "ConsentVersion",
                consenttextsha256 as "ConsentTextSha256",
                acceptedatutc as "AcceptedAtUtc",
                ip as "Ip",
                user_agent as "UserAgent"
             from signing_consents
             where signingfileid = $1
             order by acceptedatutc asc`,
            [signingFileId]
        ),
        pool.query(
            `select
                challengeid as "OtpVerificationId",
                signeruserid as "SignerUserId",
                signingsessionid as "SigningSessionId",
                phone_e164 as "PhoneE164",
                presentedpdfsha256 as "PresentedPdfSha256",
                sent_at_utc as "SentAtUtc",
                expires_at_utc as "ExpiresAtUtc",
                verified as "Verified",
                verified_at_utc as "VerifiedAtUtc",
                attempt_count as "AttemptCount",
                locked_until_utc as "LockedUntilUtc",
                request_ip as "RequestIp",
                request_user_agent as "RequestUserAgent",
                verify_ip as "VerifyIp",
                verify_user_agent as "VerifyUserAgent"
             from signing_otp_challenges
             where signingfileid = $1
             order by sent_at_utc asc`,
            [signingFileId]
        ),
        pool.query(
            `select
                eventid as "EventId",
                occurred_at_utc as "OccurredAtUtc",
                event_type as "EventType",
                actor_userid as "ActorUserId",
                actor_type as "ActorType",
                ip as "Ip",
                user_agent as "UserAgent",
                signing_session_id as "SigningSessionId",
                request_id as "RequestId",
                success as "Success",
                metadata as "Metadata",
                prev_event_hash as "PrevEventHash",
                event_hash as "EventHash"
             from audit_events
             where signingfileid = $1
             order by occurred_at_utc asc`,
            [signingFileId]
        ),
    ]);

    return {
        file: fileEvidenceRes.rows?.[0] || null,
        signatureSpots: spotsRes.rows || [],
        consents: consentRes.rows || [],
        otpVerifications: otpRes.rows || [],
        auditEvents: auditRes.rows || [],
    };
}

async function loadSignedPdfStreamOrPlaceholder({ signingFileId, fileRow }) {
    // Prefer explicit signed-storage key, then signed file key.
    let key = fileRow?.SignedStorageKey || fileRow?.SignedFileKey;

    // If signed output is missing but the status is signed, try to generate a flattened signed PDF on-demand.
    if (!key && String(fileRow?.Status || '').toLowerCase() === 'signed') {
        try {
            key = await ensureSignedPdfKey({
                signingFileId,
                lawyerId: fileRow?.LawyerId,
                pdfKey: fileRow?.FileKey,
            });
        } catch (e) {
            if (isProductionFailClosed()) throw e;
        }
    }

    const bucket = fileRow?.SignedStorageBucket || BUCKET;

    if (key) {
        try {
            const head = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            const bodyStream = obj?.Body;
            if (!bodyStream) throw new Error('Signed PDF Body is empty');

            return {
                stream: bodyStream,
                storage: {
                    bucket,
                    key,
                    etag: head?.ETag || null,
                    versionId: head?.VersionId || null,
                    sizeBytes: Number.isFinite(Number(head?.ContentLength)) ? Number(head?.ContentLength) : null,
                },
                isPlaceholder: false,
            };
        } catch (e) {
            if (isProductionFailClosed()) throw e;
        }
    }

    // Non-production fallback: include a deterministic placeholder PDF to keep export working in dev/tests.
    const placeholder = Buffer.from('%PDF-1.4\n% Evidence placeholder\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'utf8');
    return {
        stream: Readable.from(placeholder),
        storage: {
            bucket: bucket || null,
            key: key || null,
            etag: null,
            versionId: null,
            sizeBytes: placeholder.length,
        },
        isPlaceholder: true,
        placeholderBytes: placeholder,
    };
}

function isUuid(v) {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function normalizeUuidOrNull(v) {
    const s = String(v || '').trim();
    return isUuid(s) ? s : null;
}

function getRequestUserAgent(req) {
    return String(req?.headers?.['user-agent'] || '').slice(0, 512) || null;
}

function getRequestIp(req) {
    const xff = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim();
    const ip = xff || req?.ip || null;
    return ip ? String(ip) : null;
}

function getRequestIdFromReq(req) {
    const h = String(req?.headers?.['x-request-id'] || '').trim();
    return normalizeUuidOrNull(h);
}

function getSigningSessionIdFromReq(req) {
    const header = String(req?.headers?.['x-signing-session-id'] || '').trim();
    const body = String(req?.body?.signingSessionId || '').trim();
    return normalizeUuidOrNull(body || header);
}

function safeJson(obj) {
    try {
        return JSON.stringify(obj ?? {});
    } catch {
        return '{}';
    }
}

async function insertAuditEvent({
    req,
    eventType,
    signingFileId = null,
    signatureSpotId = null,
    actorUserId = null,
    actorType = null,
    signingSessionId = null,
    requestId = null,
    success = true,
    metadata = {},
}) {
    // Legally relevant: append-only event log supports reliability/chain-of-custody arguments.
    const eventId = uuid();
    const occurredAtUtc = new Date().toISOString();
    const ip = req ? getRequestIp(req) : null;
    const userAgent = req ? getRequestUserAgent(req) : null;
    const effectiveSessionId = signingSessionId || (req ? getSigningSessionIdFromReq(req) : null);
    const effectiveRequestId = requestId || (req ? getRequestIdFromReq(req) : null);

    let prevHash = null;
    if (signingFileId) {
        try {
            const prevRes = await pool.query(
                `select event_hash as "EventHash"
                 from audit_events
                 where signingfileid = $1 and event_hash is not null
                 order by occurred_at_utc desc
                 limit 1`,
                [signingFileId]
            );
            prevHash = prevRes.rows?.[0]?.EventHash || null;
        } catch {
            prevHash = null;
        }
    }

    const baseForHash = safeJson({
        eventId,
        occurredAtUtc,
        eventType,
        signingFileId,
        signatureSpotId,
        actorUserId,
        actorType,
        ip,
        userAgent,
        signingSessionId: effectiveSessionId,
        requestId: effectiveRequestId,
        success,
        metadata,
        prevHash,
    });
    const eventHash = sha256Hex(Buffer.from(baseForHash, 'utf8'));

    try {
        await pool.query(
            `insert into audit_events
             (eventid, occurred_at_utc, event_type, signingfileid, signaturespotid,
              actor_userid, actor_type, ip, user_agent, signing_session_id, request_id,
              success, metadata, prev_event_hash, event_hash)
             values ($1,$2,$3,$4,$5,$6,$7,$8::inet,$9,$10::uuid,$11::uuid,$12,$13::jsonb,$14,$15)`,
            [
                eventId,
                occurredAtUtc,
                String(eventType),
                signingFileId,
                signatureSpotId,
                actorUserId,
                actorType,
                ip,
                userAgent,
                effectiveSessionId,
                effectiveRequestId,
                Boolean(success),
                safeJson(metadata),
                prevHash,
                eventHash,
            ]
        );
    } catch (err) {
        const code = String(err?.code || '');
        const msg = String(err?.message || '').toLowerCase();
        const isPermissionDenied = code === '42501' || msg.includes('permission denied');

        // For court-ready environments, audit logging should be fail-closed.
        // In dev/test, allow core flows to work while still emitting a loud warning.
        const failClosed = String(process.env.IS_PRODUCTION || 'false').toLowerCase() === 'true';
        if (!failClosed && isPermissionDenied) {
            console.warn('[audit_events] write failed (permission denied); continuing in non-production');
            return { eventId, eventHash };
        }

        throw err;
    }

    return { eventId, eventHash };
}

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
exports.getSavedSignature = async (req, res, next) => {
    try {
        const userId = req.user?.UserId;
        if (!userId) return fail(next, 'UNAUTHORIZED', 401);

        const key = getSavedSignatureKey(userId);
        const exists = await savedSignatureExists(key);
        if (!exists) return res.json({ exists: false });

        const url = await presignSavedSignatureReadUrl(key);
        return res.json({ exists: true, url, key });
    } catch (err) {
        console.error('getSavedSignature error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשליפת חתימה שמורה' });
    }
};

exports.getSavedSignatureDataUrl = async (req, res, next) => {
    try {
        const userId = req.user?.UserId;
        if (!userId) return fail(next, 'UNAUTHORIZED', 401);

        const key = getSavedSignatureKey(userId);
        const exists = await savedSignatureExists(key);
        if (!exists) return res.json({ exists: false });

        const dataUrl = await getSavedSignatureDataUrlByKey(key);
        return res.json({ exists: true, dataUrl, key });
    } catch (err) {
        console.error('getSavedSignatureDataUrl error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשליפת חתימה שמורה' });
    }
};

exports.saveSavedSignature = async (req, res, next) => {
    try {
        const userId = req.user?.UserId;
        if (!userId) return fail(next, 'UNAUTHORIZED', 401);

        const parsed = parseDataUrlImage(req.body?.signatureImage);
        if (!parsed.ok) {
            if (parsed.code === 'REQUEST_TOO_LARGE') {
                return fail(next, 'REQUEST_TOO_LARGE', 413);
            }
            return fail(next, 'INVALID_PARAMETER', 422, { meta: { name: 'signatureImage' } });
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
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשמירת חתימה שמורה' });
    }
};

// Saved signature (public token)
exports.getPublicSavedSignature = async (req, res, next) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return fail(next, verified.errorCode, verified.httpStatus);
        }

        const { signerUserId } = verified;
        const key = getSavedSignatureKey(signerUserId);
        const exists = await savedSignatureExists(key);
        if (!exists) return res.json({ exists: false });

        const url = await presignSavedSignatureReadUrl(key);
        return res.json({ exists: true, url, key });
    } catch (err) {
        console.error('getPublicSavedSignature error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשליפת חתימה שמורה' });
    }
};

exports.getPublicSavedSignatureDataUrl = async (req, res, next) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return fail(next, verified.errorCode, verified.httpStatus);
        }

        const { signerUserId } = verified;
        const key = getSavedSignatureKey(signerUserId);
        const exists = await savedSignatureExists(key);
        if (!exists) return res.json({ exists: false });

        const dataUrl = await getSavedSignatureDataUrlByKey(key);
        return res.json({ exists: true, dataUrl, key });
    } catch (err) {
        console.error('getPublicSavedSignatureDataUrl error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשליפת חתימה שמורה' });
    }
};

exports.savePublicSavedSignature = async (req, res, next) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return fail(next, verified.errorCode, verified.httpStatus);
        }

        const { signerUserId } = verified;
        const parsed = parseDataUrlImage(req.body?.signatureImage);
        if (!parsed.ok) {
            if (parsed.code === 'REQUEST_TOO_LARGE') {
                return fail(next, 'REQUEST_TOO_LARGE', 413);
            }
            return fail(next, 'INVALID_PARAMETER', 422, { meta: { name: 'signatureImage' } });
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
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשמירת חתימה שמורה' });
    }
};

function verifyPublicSigningToken(rawToken) {
    const token = String(rawToken || '').trim();
    if (!token) return { ok: false, httpStatus: 401, errorCode: 'INVALID_TOKEN' };
    try {
        const decoded = jwt.verify(token, getJwtSecret());
        if (!decoded || decoded.typ !== 'signing_public') {
            return { ok: false, httpStatus: 401, errorCode: 'INVALID_TOKEN' };
        }
        const signingFileId = Number(decoded.signingFileId);
        const signerUserId = Number(decoded.signerUserId);
        if (!Number.isFinite(signingFileId) || signingFileId <= 0) {
            return { ok: false, httpStatus: 401, errorCode: 'INVALID_TOKEN' };
        }
        if (!Number.isFinite(signerUserId) || signerUserId <= 0) {
            return { ok: false, httpStatus: 401, errorCode: 'INVALID_TOKEN' };
        }
        return { ok: true, signingFileId, signerUserId };
    } catch (e) {
        if (e && e.name === 'TokenExpiredError') {
            return { ok: false, httpStatus: 401, errorCode: 'TOKEN_EXPIRED' };
        }
        return { ok: false, httpStatus: 401, errorCode: 'INVALID_TOKEN' };
    }
}

async function loadSigningFileBase({ signingFileId, schemaSupport }) {
    const otpWaivedColumns = schemaSupport?.signingfilesOtpWaivedByUserId || schemaSupport?.signingfilesOtpWaivedAtUtc
        ? `,
            otpwaivedatutc as "OtpWaivedAtUtc",
            otpwaivedbyuserid as "OtpWaivedByUserId"`
        : '';

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
            notes         as "Notes",

            requireotp    as "RequireOtp",
            signingpolicyversion as "SigningPolicyVersion",
            policyselectedbyuserid as "PolicySelectedByUserId",
            policyselectedatutc as "PolicySelectedAtUtc",
            otpwaiveracknowledged as "OtpWaiverAcknowledged",
            otpwaiveracknowledgedatutc as "OtpWaiverAcknowledgedAtUtc",
            otpwaiveracknowledgedbyuserid as "OtpWaiverAcknowledgedByUserId"${otpWaivedColumns},

            originalpdfsha256 as "OriginalPdfSha256",
            presentedpdfsha256 as "PresentedPdfSha256",
            signedpdfsha256 as "SignedPdfSha256",
            immutableatutc as "ImmutableAtUtc"
         from signingfiles
         where signingfileid = $1`,
        [signingFileId]
    );
    if (fileResult.rows.length === 0) return null;
    return fileResult.rows[0];
}

async function ensurePublicUserAuthorized({ signingFileId, userId, schemaSupport }) {
    const file = await loadSigningFileBase({ signingFileId, schemaSupport });
    if (!file) return { ok: false, httpStatus: 404, errorCode: 'DOCUMENT_NOT_FOUND' };

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
        return { ok: false, httpStatus: 403, errorCode: 'FORBIDDEN' };
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

async function computeAndPersistUnsignedPdfEvidence({ signingFileId, unsignedPdfKey }) {
    // Legally relevant: we persist a stable document fingerprint (SHA-256) and storage integrity metadata.
    if (!signingFileId || !unsignedPdfKey) return;

    const head = await headR2Object({ key: unsignedPdfKey });
    const { buffer } = await getR2ObjectBuffer(unsignedPdfKey);
    const pdfSha = sha256Hex(buffer);

    const etag = head?.ETag ? String(head.ETag).replace(/\"/g, '') : null;
    const versionId = head?.VersionId ? String(head.VersionId) : null;

    // NOTE: the existing schema uses original* columns; in this product, they represent the unsigned PDF presented for signing.
    await pool.query(
        `update signingfiles
         set presentedpdfsha256 = $2,
             originalpdfsha256 = coalesce(originalpdfsha256, $2),
             originalstoragebucket = $3,
             originalstoragekey = $4,
             originalstorageetag = $5,
             originalstorageversionid = $6
         where signingfileid = $1`,
        [
            signingFileId,
            pdfSha,
            BUCKET,
            String(unsignedPdfKey),
            etag,
            versionId,
        ]
    );

    return { pdfSha, etag, versionId };
}

async function getOrCreateConsent({ signingFileId, signerUserId, signingSessionId, consentVersion, req }) {
    const failClosed = String(process.env.IS_PRODUCTION || 'false').toLowerCase() === 'true';

    try {
        const existing = await pool.query(
            `select consentid as "ConsentId"
             from signing_consents
             where signingfileid = $1
               and signeruserid = $2
               and signingsessionid = $3
             limit 1`,
            [signingFileId, signerUserId, signingSessionId]
        );
        if (existing.rows.length > 0) return existing.rows[0].ConsentId;

        const consentId = uuid();
        const consentTextSha256 = sha256Hex(Buffer.from(`${consentVersion}|${SIGNING_CONSENT_TEXT}`, 'utf8'));

        await pool.query(
            `insert into signing_consents
             (consentid, signingfileid, signeruserid, signingsessionid, consentversion, consenttextsha256, acceptedatutc, ip, user_agent)
             values ($1,$2,$3,$4,$5,$6,now(),$7::inet,$8)
             on conflict do nothing`,
            [
                consentId,
                signingFileId,
                signerUserId,
                signingSessionId,
                String(consentVersion),
                consentTextSha256,
                getRequestIp(req),
                getRequestUserAgent(req),
            ]
        );

        const after = await pool.query(
            `select consentid as "ConsentId"
             from signing_consents
             where signingfileid = $1
               and signeruserid = $2
               and signingsessionid = $3
             limit 1`,
            [signingFileId, signerUserId, signingSessionId]
        );
        if (after.rows.length > 0) return after.rows[0].ConsentId;
        return consentId;
    } catch (err) {
        const code = String(err?.code || '');
        const msg = String(err?.message || '').toLowerCase();
        const isPermissionDenied = code === '42501' || msg.includes('permission denied');
        if (!failClosed && isPermissionDenied) {
            console.warn('[signing_consents] write/read failed (permission denied); continuing in non-production');
            return uuid();
        }
        throw err;
    }
}

async function getVerifiedOtpChallengeIdOrNull({ signingFileId, signerUserId, signingSessionId, presentedPdfSha256 }) {
    const failClosed = String(process.env.IS_PRODUCTION || 'false').toLowerCase() === 'true';

    try {
        const res = await pool.query(
            `select challengeid as "ChallengeId"
             from signing_otp_challenges
             where signingfileid = $1
               and signeruserid = $2
               and signingsessionid = $3
               and presentedpdfsha256 = $4
               and verified = true
               and verified_at_utc is not null
               and expires_at_utc > now()
             order by verified_at_utc desc
             limit 1`,
            [signingFileId, signerUserId, signingSessionId, String(presentedPdfSha256 || '')]
        );
        return res.rows?.[0]?.ChallengeId || null;
    } catch (err) {
        const code = String(err?.code || '');
        const msg = String(err?.message || '').toLowerCase();
        const isPermissionDenied = code === '42501' || msg.includes('permission denied');
        if (!failClosed && isPermissionDenied) {
            console.warn('[signing_otp_challenges] lookup failed (permission denied); treating as not verified in non-production');
            return null;
        }
        throw err;
    }
}

function generateNumericOtp6() {
    // 6-digit numeric OTP for SMS usability
    const n = crypto.randomInt(0, 1_000_000);
    return String(n).padStart(6, '0');
}

function computeSigningOtpHash({ otp, salt }) {
    // Legally relevant: OTP must not be stored in plaintext; we store an HMAC-based hash.
    const pepper = getSigningOtpPepper();
    return crypto.createHmac('sha256', pepper).update(`${salt}|${String(otp)}`).digest('hex');
}

async function lookupUserPhoneE164OrNull(userId) {
    const phoneRes = await pool.query(
        `select phonenumber as "PhoneNumber"
         from users
         where userid = $1`,
        [userId]
    );
    const phoneNumber = phoneRes.rows?.[0]?.PhoneNumber;
    const formatted = formatPhoneNumber(phoneNumber);
    return formatted || null;
}

async function createSigningOtpChallenge({ signingFileId, signerUserId, signingSessionId, presentedPdfSha256, req }) {
    const phoneE164 = await lookupUserPhoneE164OrNull(signerUserId);
    if (!phoneE164) {
        return { ok: false, httpStatus: 422, errorCode: 'MISSING_PHONE' };
    }

    const otp = generateNumericOtp6();
    const challengeId = uuid();
    const salt = uuid();
    const otpHash = computeSigningOtpHash({ otp, salt });
    const sentAtUtc = new Date();
    const expiresAtUtc = new Date(sentAtUtc.getTime() + SIGNING_OTP_TTL_SECONDS * 1000);

    await pool.query(
        `insert into signing_otp_challenges
         (challengeid, signingfileid, signeruserid, signingsessionid, phone_e164, presentedpdfsha256,
          otp_hash, otp_salt, provider_message_id, sent_at_utc, expires_at_utc,
          attempt_count, locked_until_utc, verified, request_ip, request_user_agent)
         values
         ($1,$2,$3,$4::uuid,$5,$6,$7,$8,$9, $10, $11, 0, null, false, $12::inet, $13)`,
        [
            challengeId,
            signingFileId,
            signerUserId,
            signingSessionId,
            phoneE164,
            String(presentedPdfSha256),
            otpHash,
            salt,
            null,
            sentAtUtc.toISOString(),
            expiresAtUtc.toISOString(),
            getRequestIp(req),
            getRequestUserAgent(req),
        ]
    );

    // Send SMS (provider id is not currently captured by sendMessage); audit log still captures send time.
    await sendMessage(`קוד אימות לחתימה: ${otp}`, phoneE164);

    return {
        ok: true,
        challengeId,
        phoneE164,
        expiresAtUtc: expiresAtUtc.toISOString(),
    };
}

async function verifySigningOtpChallenge({ signingFileId, signerUserId, signingSessionId, otp, presentedPdfSha256, req }) {
    const rowRes = await pool.query(
        `select
            challengeid as "ChallengeId",
            otp_hash as "OtpHash",
            otp_salt as "OtpSalt",
            expires_at_utc as "ExpiresAtUtc",
            attempt_count as "AttemptCount",
            locked_until_utc as "LockedUntilUtc",
            verified as "Verified"
         from signing_otp_challenges
         where signingfileid = $1
           and signeruserid = $2
           and signingsessionid = $3
           and presentedpdfsha256 = $4
         order by sent_at_utc desc
         limit 1`,
        [signingFileId, signerUserId, signingSessionId, String(presentedPdfSha256)]
    );

    const row = rowRes.rows?.[0];
    if (!row) return { ok: false, httpStatus: 404, errorCode: 'OTP_NOT_FOUND' };
    if (row.Verified) return { ok: true, challengeId: row.ChallengeId, alreadyVerified: true };

    const now = new Date();
    if (row.ExpiresAtUtc && new Date(row.ExpiresAtUtc) <= now) {
        return { ok: false, httpStatus: 403, errorCode: 'OTP_EXPIRED', challengeId: row.ChallengeId };
    }

    if (row.LockedUntilUtc && new Date(row.LockedUntilUtc) > now) {
        return { ok: false, httpStatus: 429, errorCode: 'OTP_LOCKED', challengeId: row.ChallengeId };
    }

    const expected = String(row.OtpHash);
    const computed = computeSigningOtpHash({ otp: String(otp), salt: String(row.OtpSalt) });
    const isMatch = crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(computed, 'utf8'));

    if (!isMatch) {
        const attempts = Number(row.AttemptCount || 0) + 1;
        const shouldLock = attempts >= SIGNING_OTP_MAX_ATTEMPTS;
        const lockedUntil = shouldLock
            ? new Date(now.getTime() + SIGNING_OTP_LOCK_MINUTES * 60 * 1000).toISOString()
            : null;

        await pool.query(
            `update signing_otp_challenges
             set attempt_count = $2,
                 locked_until_utc = $3
             where challengeid = $1`,
            [row.ChallengeId, attempts, lockedUntil]
        );

        return { ok: false, httpStatus: 403, errorCode: 'OTP_INVALID', challengeId: row.ChallengeId };
    }

    await pool.query(
        `update signing_otp_challenges
         set verified = true,
             verified_at_utc = now(),
             verify_ip = $2::inet,
             verify_user_agent = $3
         where challengeid = $1`,
        [row.ChallengeId, getRequestIp(req), getRequestUserAgent(req)]
    );

    return { ok: true, challengeId: row.ChallengeId, alreadyVerified: false };
}

async function generateSignedPdfBuffer({ pdfKey, spots }) {
    const { buffer: pdfBuffer } = await getR2ObjectBuffer(pdfKey);

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Place each signature image on its page
    for (const spot of spots) {
        const pageNumber = Number(spot.PageNumber ?? spot.pagenumber ?? spot.pageNum ?? 1);
        const pageIndex = pageNumber - 1;
        const page = pages[pageIndex];
        if (!page) continue;

        const signatureKey = spot.SignatureData;
        const fieldType = String(spot.FieldType || spot.fieldtype || 'signature').toLowerCase();
        const fieldValue = spot.FieldValue ?? spot.fieldvalue ?? null;

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

        if (signatureKey) {
            const { buffer: imgBuffer, contentType } = await getR2ObjectBuffer(signatureKey);
            const isPng =
                (contentType || "").toLowerCase().includes("png") ||
                String(signatureKey).toLowerCase().endsWith(".png");

            const embedded = isPng
                ? await pdfDoc.embedPng(imgBuffer)
                : await pdfDoc.embedJpg(imgBuffer);

            page.drawImage(embedded, {
                x,
                y,
                width: w,
                height: h,
            });
        } else if (fieldValue !== null && fieldValue !== undefined && String(fieldValue).length > 0) {
            const text = String(fieldValue);
            const fontSize = Math.max(10, Math.min(14, h * 0.6));
            if (fieldType === 'checkbox') {
                const checked = text === 'true' || text === '1' || text.toLowerCase() === 'yes' || text === '✓';
                if (checked) {
                    page.drawText('✓', {
                        x: x + 4,
                        y: y + Math.max(2, h * 0.2),
                        size: Math.min(16, h * 0.8),
                        font,
                    });
                }
            } else {
                page.drawText(text, {
                    x: x + 4,
                    y: y + Math.max(2, h - fontSize - 2),
                    size: fontSize,
                    font,
                });
            }
        }
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
            signaturedata as "SignatureData",
            fieldtype     as "FieldType",
            fieldvalue    as "FieldValue"
         from signaturespots
         where signingfileid = $1
           and issigned = true
           and (signaturedata is not null or fieldvalue is not null)`,
        [signingFileId]
    );

    const spots = spotsRes.rows || [];
    if (spots.length === 0) {
        return null;
    }

    const signedPdf = await generateSignedPdfBuffer({ pdfKey, spots });
    const signedKey = `signed/${lawyerId}/${signingFileId}/${uuid()}.pdf`;

    const putRes = await r2.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: signedKey,
            Body: signedPdf,
            ContentType: "application/pdf",
        })
    );

    const etag = putRes?.ETag ? String(putRes.ETag).replace(/\"/g, '') : null;
    const versionId = putRes?.VersionId ? String(putRes.VersionId) : null;
    const signedSha = sha256Hex(signedPdf);

    await pool.query(
        `update signingfiles
         set signedfilekey = $2,
             signedstoragebucket = $3,
             signedstoragekey = $4,
             signedstorageetag = $5,
             signedstorageversionid = $6,
             signedpdfsha256 = $7,
             immutableatutc = coalesce(immutableatutc, now())
         where signingfileid = $1`,
        [
            signingFileId,
            signedKey,
            BUCKET,
            signedKey,
            etag,
            versionId,
            signedSha,
        ]
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

    const fieldTypeCol = await pool.query(
        `select 1
                 from information_schema.columns
                 where table_schema = 'public'
                     and table_name = 'signaturespots'
                     and column_name = 'fieldtype'
                 limit 1`
    );

    const signerIndexCol = await pool.query(
        `select 1
                 from information_schema.columns
                 where table_schema = 'public'
                     and table_name = 'signaturespots'
                     and column_name = 'signerindex'
                 limit 1`
    );

    const fieldLabelCol = await pool.query(
        `select 1
                 from information_schema.columns
                 where table_schema = 'public'
                     and table_name = 'signaturespots'
                     and column_name = 'fieldlabel'
                 limit 1`
    );

    const fieldValueCol = await pool.query(
        `select 1
                 from information_schema.columns
                 where table_schema = 'public'
                     and table_name = 'signaturespots'
                     and column_name = 'fieldvalue'
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

    const otpWaivedByUserIdCol = await pool.query(
        `select 1
                 from information_schema.columns
                 where table_schema = 'public'
                     and table_name = 'signingfiles'
                     and column_name = 'otpwaivedbyuserid'
                 limit 1`
    );

    const otpWaivedAtUtcCol = await pool.query(
        `select 1
                 from information_schema.columns
                 where table_schema = 'public'
                     and table_name = 'signingfiles'
                     and column_name = 'otpwaivedatutc'
                 limit 1`
    );

    const value = {
        signaturespotsSignerUserId: signerUserIdCol.rows.length > 0,
        signaturespotsFieldType: fieldTypeCol.rows.length > 0,
        signaturespotsSignerIndex: signerIndexCol.rows.length > 0,
        signaturespotsFieldLabel: fieldLabelCol.rows.length > 0,
        signaturespotsFieldValue: fieldValueCol.rows.length > 0,
        signingfilesCaseIdNullable: (caseIdNullableRes.rows[0]?.is_nullable || 'NO') === 'YES',
        signingfilesOtpWaivedByUserId: otpWaivedByUserIdCol.rows.length > 0,
        signingfilesOtpWaivedAtUtc: otpWaivedAtUtcCol.rows.length > 0,
    };

    // Cache briefly to avoid repeated information_schema hits, but still adapt to schema changes.
    _schemaSupportCache = { value, expiresAt: now + 30_000 };
    return value;
}

exports.uploadFileForSigning = async (req, res, next) => {
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
            signingConfig, // NEW: explicit signing policy selection (OTP required / waived)
        } = req.body;

        const lawyerId = req.user?.UserId;
        if (!lawyerId) {
            return fail(next, 'UNAUTHORIZED', 401);
        }

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
            return fail(next, 'VALIDATION_ERROR', 422);
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
                return fail(next, 'REQUEST_TOO_LARGE', 413);
            }
        } catch (e) {
            // If HEAD fails (missing key / perms / transient), treat as a safe client error.
            console.error('uploadFileForSigning headObject failed:', e?.message);
            return fail(next, 'INVALID_PARAMETER', 422, { meta: { name: 'fileKey' } });
        }

        // Normalize caseId: allow null / empty / 0
        const normalizedCaseId =
            caseId === undefined || caseId === null || caseId === "" || Number(caseId) === 0
                ? null
                : parsePositiveIntStrict(caseId, { min: 1 });

        if (caseId !== undefined && caseId !== null && caseId !== '' && Number(caseId) !== 0 && normalizedCaseId === null) {
            return fail(next, 'INVALID_PARAMETER', 422, { meta: { name: 'caseId' } });
        }

        // If DB doesn't allow NULL caseId, enforce it here with a clear message
        if (normalizedCaseId === null && !schemaSupport.signingfilesCaseIdNullable) {
            return fail(next, 'INVALID_PARAMETER', 422, { meta: { name: 'caseId' } });
        }

        // For backward compatibility, use first signer as primary clientId
        const primaryClientId = signersList[0].userId || clientId;

        // OTP policy: default is controlled by feature flag.
        // If the lawyer explicitly waives OTP, they must also explicitly acknowledge the waiver.
        const requireOtpRaw = signingConfig?.require_otp ?? signingConfig?.requireOtp;
        const hasExplicitPolicySelection = requireOtpRaw === true || requireOtpRaw === false || requireOtpRaw === 1 || requireOtpRaw === 0;
        const requireOtp = SIGNING_OTP_ENABLED
            ? (hasExplicitPolicySelection ? Boolean(requireOtpRaw) : SIGNING_REQUIRE_OTP_DEFAULT)
            : false;
        const waiverAck = SIGNING_OTP_ENABLED
            ? (hasExplicitPolicySelection
                ? Boolean(signingConfig?.otpWaiverAcknowledged ?? signingConfig?.otp_waiver_acknowledged)
                : !SIGNING_REQUIRE_OTP_DEFAULT)
            : true;
        if (SIGNING_OTP_ENABLED && !requireOtp && !waiverAck) {
            return fail(next, 'OTP_WAIVER_ACK_REQUIRED', 422);
        }

        const waiverAckEffective = !requireOtp ? waiverAck : false;
        const policySelectedAtUtc = new Date();

        const insertColumns = [
            'caseid',
            'lawyerid',
            'clientid',
            'filename',
            'filekey',
            'originalfilekey',
            'status',
            'notes',
            'expiresat',
            'requireotp',
            'signingpolicyversion',
            'policyselectedbyuserid',
            'policyselectedatutc',
            'otpwaiveracknowledged',
            'otpwaiveracknowledgedatutc',
            'otpwaiveracknowledgedbyuserid',
        ];

        const insertValues = [
            normalizedCaseId,
            lawyerId,
            primaryClientId,
            fileName,
            fileKey,
            fileKey,
            'pending',
            notes || null,
            expiresAt || null,
            requireOtp,
            SIGNING_POLICY_VERSION,
            lawyerId,
            policySelectedAtUtc,
            waiverAckEffective,
            waiverAckEffective ? policySelectedAtUtc : null,
            waiverAckEffective ? lawyerId : null,
        ];

        if (schemaSupport.signingfilesOtpWaivedAtUtc) {
            insertColumns.push('otpwaivedatutc');
            insertValues.push(waiverAckEffective ? policySelectedAtUtc : null);
        }

        if (schemaSupport.signingfilesOtpWaivedByUserId) {
            insertColumns.push('otpwaivedbyuserid');
            insertValues.push(waiverAckEffective ? lawyerId : null);
        }

        const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(',');

        const insertFile = await pool.query(
            `insert into signingfiles
             (${insertColumns.join(', ')})
             values (${placeholders})
             returning signingfileid as "SigningFileId"`,
            insertValues
        );

        const signingFileId = insertFile.rows[0].SigningFileId;
        console.log('[controller] Created signing file with ID:', signingFileId);

        await insertAuditEvent({
            req,
            eventType: 'SIGNING_POLICY_SELECTED',
            signingFileId,
            actorUserId: lawyerId,
            actorType: 'lawyer',
            success: true,
            metadata: {
                signingPolicyVersion: SIGNING_POLICY_VERSION,
                requireOtp,
                otpWaived: !requireOtp,
                otpWaiverAcknowledged: waiverAck,
                selectionExplicit: hasExplicitPolicySelection,
                selectedByLawyerUserId: lawyerId,
            },
        });

        // Compute and persist the unsigned PDF fingerprint now (avoids Range-request hashing issues later).
        await computeAndPersistUnsignedPdfEvidence({ signingFileId, unsignedPdfKey: fileKey });

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

                const spotType = String(spot.fieldType || spot.type || spot.FieldType || 'signature').toLowerCase();
                const spotLabel = spot.fieldLabel || spot.label || null;
                const isRequiredEffective = typeof spot.isRequired === 'boolean'
                    ? spot.isRequired
                    : (spotType === 'signature' || spotType === 'initials');

                if (schemaSupport.signaturespotsSignerUserId || schemaSupport.signaturespotsFieldType || schemaSupport.signaturespotsSignerIndex || schemaSupport.signaturespotsFieldLabel) {
                    const insertColumns = [
                        'signingfileid',
                        'pagenumber',
                        'x',
                        'y',
                        'width',
                        'height',
                        'signername',
                        'isrequired',
                    ];
                    const insertValues = [
                        signingFileId,
                        spot.pageNum || 1,
                        spot.x ?? 50,
                        spot.y ?? 50,
                        spot.width ?? 150,
                        spot.height ?? 75,
                        signerName,
                        isRequiredEffective,
                    ];

                    if (schemaSupport.signaturespotsSignerUserId) {
                        insertColumns.push('signeruserid');
                        insertValues.push(signerUserId || null);
                    }

                    if (schemaSupport.signaturespotsFieldType) {
                        insertColumns.push('fieldtype');
                        insertValues.push(spotType);
                    }

                    if (schemaSupport.signaturespotsSignerIndex) {
                        insertColumns.push('signerindex');
                        insertValues.push(spot.signerIndex ?? null);
                    }

                    if (schemaSupport.signaturespotsFieldLabel) {
                        insertColumns.push('fieldlabel');
                        insertValues.push(spotLabel);
                    }

                    const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(',');
                    await pool.query(
                        `insert into signaturespots
                         (${insertColumns.join(', ')})
                         values (${placeholders})`,
                        insertValues
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
                            isRequiredEffective,
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

            await insertAuditEvent({
                req,
                eventType: 'PUBLIC_LINK_ISSUED',
                signingFileId,
                actorUserId: lawyerId,
                actorType: 'lawyer',
                success: true,
                metadata: {
                    signingPolicyVersion: SIGNING_POLICY_VERSION,
                    requireOtp,
                    otpWaived: !requireOtp,
                    targetSignerUserId: signerUserId,
                },
            });

            const message = publicUrl
                ? `מסמך "${fileName}" מחכה לחתימה.\n${publicUrl}`
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
                            `מסמך מחכה לחתימה: ${fileName}\n${publicUrl}`,
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
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בהעלאת הקובץ לחתימה" });
    }
};

exports.getClientSigningFiles = async (req, res, next) => {
    try {
        const clientId = req.user?.UserId;
        if (!clientId) return fail(next, 'UNAUTHORIZED', 401);
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
                    count(case when ss.isrequired = true then ss.signaturespotid end)                                       as "TotalSpots",
                    coalesce(sum(case when ss.isrequired = true and ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
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
                count(case when ss.isrequired = true then ss.signaturespotid end)                                       as "TotalSpots",
                coalesce(sum(case when ss.isrequired = true and ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
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
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בשליפת המסמכים של הלקוח" });
    }
};

exports.getLawyerSigningFiles = async (req, res, next) => {
    try {
        const lawyerId = req.user?.UserId;
        if (!lawyerId) return fail(next, 'UNAUTHORIZED', 401);
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
                sf.signedfilekey      as "SignedFileKey",
                sf.requireotp         as "RequireOtp",
                sf.signingpolicyversion as "SigningPolicyVersion",
                sf.policyselectedbyuserid as "PolicySelectedByUserId",
                sf.policyselectedatutc as "PolicySelectedAtUtc",
                sf.otpwaiveracknowledged as "OtpWaiverAcknowledged",
                sf.otpwaiveracknowledgedatutc as "OtpWaiverAcknowledgedAtUtc",
                sf.otpwaiveracknowledgedbyuserid as "OtpWaiverAcknowledgedByUserId",
                c.casename            as "CaseName",
                u.name                as "ClientName",
                count(case when ss.isrequired = true then ss.signaturespotid end)                                       as "TotalSpots",
                coalesce(sum(case when ss.isrequired = true and ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             left join cases c  on c.caseid  = sf.caseid
             left join users u  on u.userid  = sf.clientid
             left join signaturespots ss on ss.signingfileid = sf.signingfileid
             where sf.lawyerid = $1
             group by sf.signingfileid, sf.caseid, sf.filename,
                      sf.status, sf.createdat, sf.signedat,
                      sf.signedfilekey, sf.requireotp, sf.signingpolicyversion,
                      sf.policyselectedbyuserid, sf.policyselectedatutc,
                      sf.otpwaiveracknowledged, sf.otpwaiveracknowledgedatutc, sf.otpwaiveracknowledgedbyuserid,
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
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בשליפת המסמכים של העו\"ד" });
    }
};

exports.getPendingSigningFiles = async (req, res, next) => {
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
                    count(case when ss.isrequired = true then ss.signaturespotid end)                                       as "TotalSpots",
                    coalesce(sum(case when ss.isrequired = true and ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
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
                count(case when ss.isrequired = true then ss.signaturespotid end)                                       as "TotalSpots",
                coalesce(sum(case when ss.isrequired = true and ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
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
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בשליפת מסמכים ממתינים" });
    }
};

exports.getSigningFileDetails = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const userId = req.user?.UserId;
        if (!userId) {
            return fail(next, 'UNAUTHORIZED', 401);
        }

        const schemaSupport = await getSchemaSupport();

        const otpWaivedColumns = schemaSupport.signingfilesOtpWaivedAtUtc || schemaSupport.signingfilesOtpWaivedByUserId
            ? `,\n                otpwaivedatutc as "OtpWaivedAtUtc",\n                otpwaivedbyuserid as "OtpWaivedByUserId"`
            : '';

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
                notes           as "Notes",

                requireotp      as "RequireOtp",
                signingpolicyversion as "SigningPolicyVersion",
                policyselectedbyuserid as "PolicySelectedByUserId",
                policyselectedatutc as "PolicySelectedAtUtc",
                otpwaiveracknowledged as "OtpWaiverAcknowledged",
                otpwaiveracknowledgedatutc as "OtpWaiverAcknowledgedAtUtc"${otpWaivedColumns},
                originalpdfsha256 as "OriginalPdfSha256",
                presentedpdfsha256 as "PresentedPdfSha256",
                signedpdfsha256 as "SignedPdfSha256",
                immutableatutc as "ImmutableAtUtc"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return fail(next, 'DOCUMENT_NOT_FOUND', 404);
        }

        const file = fileResult.rows[0];
        const requireOtpEffective = SIGNING_OTP_ENABLED && Boolean(file.RequireOtp);

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
            return fail(next, 'FORBIDDEN', 403);
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
                createdat       as "CreatedAt"${schemaSupport.signaturespotsSignerUserId ? ',\n                signeruserid    as "SignerUserId"' : ''}${schemaSupport.signaturespotsFieldType ? ',\n                fieldtype       as "FieldType"' : ''}${schemaSupport.signaturespotsSignerIndex ? ',\n                signerindex     as "SignerIndex"' : ''}${schemaSupport.signaturespotsFieldLabel ? ',\n                fieldlabel      as "FieldLabel"' : ''}${schemaSupport.signaturespotsFieldValue ? ',\n                fieldvalue      as "FieldValue"' : ''}
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
            file: { ...file, OtpEnabled: SIGNING_OTP_ENABLED },
            signatureSpots,
            isLawyer,
        });
    } catch (err) {
        console.error("getSigningFileDetails error:", err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בשליפת פרטי המסמך" });
    }
};

// Evidence package for court (non-PKI): hashes + policy + attribution + consent + OTP metadata + audit log.
// IMPORTANT: do not return OTP hashes/salts.
exports.getEvidencePackage = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;

        const requesterId = Number(req.user?.UserId);
        const role = req.user?.Role;
        if (!Number.isFinite(requesterId) || requesterId <= 0) {
            return fail(next, 'UNAUTHORIZED', 401);
        }

        const file = await loadSigningPolicyForFile(signingFileId);
        if (!file) return fail(next, 'DOCUMENT_NOT_FOUND', 404);

        const isOwnerLawyer = Number(file.LawyerId) === Number(requesterId);
        const isAdmin = role === 'Admin';
        if (!isOwnerLawyer && !isAdmin) {
            return fail(next, 'FORBIDDEN', 403);
        }

        const schemaSupport = await getSchemaSupport();

        const fileEvidenceRes = await pool.query(
            `select
                signingfileid as "SigningFileId",
                caseid as "CaseId",
                lawyerid as "LawyerId",
                clientid as "ClientId",
                filename as "FileName",
                filekey as "FileKey",
                originalfilekey as "OriginalFileKey",
                status as "Status",
                createdat as "CreatedAt",
                signedat as "SignedAt",
                signedfilekey as "SignedFileKey",
                immutableatutc as "ImmutableAtUtc",

                requireotp as "RequireOtp",
                signingpolicyversion as "SigningPolicyVersion",
                policyselectedbyuserid as "PolicySelectedByUserId",
                policyselectedatutc as "PolicySelectedAtUtc",
                otpwaiveracknowledged as "OtpWaiverAcknowledged",
                otpwaiveracknowledgedatutc as "OtpWaiverAcknowledgedAtUtc",
                otpwaiveracknowledgedbyuserid as "OtpWaiverAcknowledgedByUserId",

                originalpdfsha256 as "OriginalPdfSha256",
                presentedpdfsha256 as "PresentedPdfSha256",
                signedpdfsha256 as "SignedPdfSha256",

                originalstoragebucket as "OriginalStorageBucket",
                originalstoragekey as "OriginalStorageKey",
                originalstorageetag as "OriginalStorageEtag",
                originalstorageversionid as "OriginalStorageVersionId",

                signedstoragebucket as "SignedStorageBucket",
                signedstoragekey as "SignedStorageKey",
                signedstorageetag as "SignedStorageEtag",
                signedstorageversionid as "SignedStorageVersionId"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        const spotsRes = await pool.query(
            `select
                signaturespotid as "SignatureSpotId",
                pagenumber as "PageNumber",
                x as "X",
                y as "Y",
                width as "Width",
                height as "Height",
                signername as "SignerName",
                ${schemaSupport.signaturespotsSignerUserId ? 'signeruserid as "SignerUserId",' : ''}
                isrequired as "IsRequired",
                issigned as "IsSigned",
                signedat as "SignedAt",
                signaturedata as "SignatureDataKey",
                ${schemaSupport.signaturespotsFieldType ? 'fieldtype as "FieldType",' : ''}
                ${schemaSupport.signaturespotsSignerIndex ? 'signerindex as "SignerIndex",' : ''}
                ${schemaSupport.signaturespotsFieldLabel ? 'fieldlabel as "FieldLabel",' : ''}
                ${schemaSupport.signaturespotsFieldValue ? 'fieldvalue as "FieldValue",' : ''}

                signerip as "SignerIp",
                signeruseragent as "SignerUserAgent",
                signingsessionid as "SigningSessionId",
                presentedpdfsha256 as "PresentedPdfSha256",
                otpverificationid as "OtpVerificationId",
                consentid as "ConsentId",
                signatureimagesha256 as "SignatureImageSha256",
                signaturestorageetag as "SignatureStorageEtag",
                signaturestorageversionid as "SignatureStorageVersionId"
             from signaturespots
             where signingfileid = $1
             order by pagenumber, y, x`,
            [signingFileId]
        );

        const consentRes = await pool.query(
            `select
                consentid as "ConsentId",
                signeruserid as "SignerUserId",
                signingsessionid as "SigningSessionId",
                consentversion as "ConsentVersion",
                consenttextsha256 as "ConsentTextSha256",
                acceptedatutc as "AcceptedAtUtc",
                ip as "Ip",
                user_agent as "UserAgent"
             from signing_consents
             where signingfileid = $1
             order by acceptedatutc asc`,
            [signingFileId]
        );

        const otpRes = await pool.query(
            `select
                challengeid as "OtpVerificationId",
                signeruserid as "SignerUserId",
                signingsessionid as "SigningSessionId",
                phone_e164 as "PhoneE164",
                presentedpdfsha256 as "PresentedPdfSha256",
                sent_at_utc as "SentAtUtc",
                expires_at_utc as "ExpiresAtUtc",
                verified as "Verified",
                verified_at_utc as "VerifiedAtUtc",
                attempt_count as "AttemptCount",
                locked_until_utc as "LockedUntilUtc",
                request_ip as "RequestIp",
                request_user_agent as "RequestUserAgent",
                verify_ip as "VerifyIp",
                verify_user_agent as "VerifyUserAgent"
             from signing_otp_challenges
             where signingfileid = $1
             order by sent_at_utc asc`,
            [signingFileId]
        );

        const auditRes = await pool.query(
            `select
                eventid as "EventId",
                occurred_at_utc as "OccurredAtUtc",
                event_type as "EventType",
                actor_userid as "ActorUserId",
                actor_type as "ActorType",
                ip as "Ip",
                user_agent as "UserAgent",
                signing_session_id as "SigningSessionId",
                request_id as "RequestId",
                success as "Success",
                metadata as "Metadata",
                prev_event_hash as "PrevEventHash",
                event_hash as "EventHash"
             from audit_events
             where signingfileid = $1
             order by occurred_at_utc asc`,
            [signingFileId]
        );

        await insertAuditEvent({
            req,
            eventType: 'EVIDENCE_PACKAGE_VIEWED',
            signingFileId,
            actorUserId: requesterId,
            actorType: isAdmin ? 'admin' : 'lawyer',
            success: true,
            metadata: {
                signingPolicyVersion: String(file.SigningPolicyVersion || SIGNING_POLICY_VERSION),
            },
        });

        return res.json({
            generatedAtUtc: new Date().toISOString(),
            file: fileEvidenceRes.rows?.[0] || null,
            signatureSpots: spotsRes.rows || [],
            consents: consentRes.rows || [],
            otpVerifications: otpRes.rows || [],
            auditEvents: auditRes.rows || [],
        });
    } catch (err) {
        console.error('getEvidencePackage error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה ביצירת חבילת ראיות' });
    }
};

// Evidence package ZIP download for court-ready export (lawyer/admin only).
// Streams ZIP to avoid high memory usage.
exports.getEvidencePackageZip = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;

        const requesterId = Number(req.user?.UserId);
        const role = req.user?.Role;
        if (!Number.isFinite(requesterId) || requesterId <= 0) {
            return fail(next, 'UNAUTHORIZED', 401);
        }

        // Authorization first.
        const filePolicy = await loadSigningPolicyForFile(signingFileId);
        if (!filePolicy) return fail(next, 'DOCUMENT_NOT_FOUND', 404);

        const isOwnerLawyer = Number(filePolicy.LawyerId) === Number(requesterId);
        const isAdmin = role === 'Admin';
        if (!isOwnerLawyer && !isAdmin) {
            return fail(next, 'FORBIDDEN', 403);
        }

        const evidence = await loadEvidenceRowsForZip(signingFileId);
        const fileRow = evidence.file;
        if (!fileRow) return fail(next, 'DOCUMENT_NOT_FOUND', 404);

        if (String(fileRow.Status || '').toLowerCase() !== 'signed') {
            return fail(next, 'DOCUMENT_NOT_SIGNED', 409);
        }

        // Production: fail-closed if legally-relevant evidence is missing.
        if (isProductionFailClosed()) {
            if (!Array.isArray(evidence.consents) || evidence.consents.length === 0) {
                return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה ביצירת חבילת ראיות' });
            }

            if (Boolean(fileRow.RequireOtp)) {
                const hasVerified = (evidence.otpVerifications || []).some((v) => v && v.Verified === true);
                if (!hasVerified) {
                    return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה ביצירת חבילת ראיות' });
                }
            } else {
                // If OTP was waived, require waiver ack metadata.
                if (!Boolean(fileRow.OtpWaiverAcknowledged)) {
                    return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה ביצירת חבילת ראיות' });
                }
            }
        }

        // Signed PDF stream (from storage) or non-prod placeholder.
        let signedPdf;
        try {
            signedPdf = await loadSignedPdfStreamOrPlaceholder({ signingFileId, fileRow });
        } catch (e) {
            console.error('evidence zip: failed to load signed PDF', e);
            return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה ביצירת חבילת ראיות' });
        }

        const signatureSpots = evidence.signatureSpots || [];
        const signerAttribution = {
            signer_user_id: null,
            signer_phone_e164: null,
            signer_ip: null,
            signer_user_agent: null,
        };

        // Best-effort attribution: first signed spot.
        const firstSignedSpot = signatureSpots.find((s) => s?.IsSigned);
        if (firstSignedSpot) {
            signerAttribution.signer_user_id = firstSignedSpot.SignerUserId || null;
            signerAttribution.signer_ip = firstSignedSpot.SignerIp || null;
            signerAttribution.signer_user_agent = firstSignedSpot.SignerUserAgent || null;

            const otpForSession = (evidence.otpVerifications || []).find((o) => o?.SigningSessionId && o.SigningSessionId === firstSignedSpot.SigningSessionId);
            const otpAny = otpForSession || (evidence.otpVerifications || []).find((o) => o?.PhoneE164);
            if (otpAny?.PhoneE164) signerAttribution.signer_phone_e164 = otpAny.PhoneE164;
        }

        // If DB signed hash missing, compute it only for non-prod placeholder export.
        let signedPdfSha256 = fileRow.SignedPdfSha256 || null;
        let signedPdfSizeBytes = signedPdf?.storage?.sizeBytes ?? null;
        if (!signedPdfSha256 && signedPdf?.isPlaceholder && signedPdf?.placeholderBytes) {
            signedPdfSha256 = sha256Hex(signedPdf.placeholderBytes);
            signedPdfSizeBytes = signedPdf.placeholderBytes.length;
        }

        const hashes = {
            original_pdf_sha256: fileRow.OriginalPdfSha256 || null,
            presented_pdf_sha256: fileRow.PresentedPdfSha256 || null,
            signed_pdf_sha256: signedPdfSha256,
            signature_images: signatureSpots.map((s) => ({
                signatureSpotId: s.SignatureSpotId,
                signature_image_sha256: s.SignatureImageSha256 || null,
            })),
        };

        const storage = {
            original: {
                bucket: fileRow.OriginalStorageBucket || null,
                key: fileRow.OriginalStorageKey || null,
                etag: fileRow.OriginalStorageEtag || null,
                versionId: fileRow.OriginalStorageVersionId || null,
            },
            signed: {
                bucket: signedPdf?.storage?.bucket || (fileRow.SignedStorageBucket || null),
                key: signedPdf?.storage?.key || (fileRow.SignedStorageKey || fileRow.SignedFileKey || null),
                etag: signedPdf?.storage?.etag || (fileRow.SignedStorageEtag || null),
                versionId: signedPdf?.storage?.versionId || (fileRow.SignedStorageVersionId || null),
            },
            signature_images: signatureSpots
                .filter((s) => s?.SignatureDataKey)
                .map((s) => ({
                    signatureSpotId: s.SignatureSpotId,
                    key: s.SignatureDataKey,
                    etag: s.SignatureStorageEtag || null,
                    versionId: s.SignatureStorageVersionId || null,
                })),
        };

        const generatedAtUtc = new Date().toISOString();
        const caseId = fileRow.CaseId ?? 'noCase';
        const zipTs = formatUtcZipTimestamp(new Date());
        const zipFilename = `evidence_${caseId}_${signingFileId}_${zipTs}.zip`;

        const manifest = {
            signingFileId,
            caseId: fileRow.CaseId ?? null,
            policy: {
                requireOtp: Boolean(fileRow.RequireOtp),
                policyVersion: String(fileRow.SigningPolicyVersion || SIGNING_POLICY_VERSION),
                selectedBy: fileRow.PolicySelectedByUserId ?? null,
                selectedAtUtc: fileRow.PolicySelectedAtUtc ?? null,
                otpWaiverAcknowledged: Boolean(fileRow.OtpWaiverAcknowledged),
                otpWaiverAcknowledgedAtUtc: fileRow.OtpWaiverAcknowledgedAtUtc ?? null,
                otpWaiverAcknowledgedByUserId: fileRow.OtpWaiverAcknowledgedByUserId ?? null,
            },
            timestamps: {
                createdAtUtc: fileRow.CreatedAt ? new Date(fileRow.CreatedAt).toISOString() : null,
                immutableAtUtc: fileRow.ImmutableAtUtc || null,
                signedAtUtc: fileRow.SignedAt ? new Date(fileRow.SignedAt).toISOString() : null,
            },
            signerAttribution,
            integrity: {
                hashes,
                byteSizes: {
                    signed_pdf_bytes: signedPdfSizeBytes,
                },
            },
            retention: {
                storage,
            },
            generation: {
                generatedAtUtc,
                generatedByUserId: requesterId,
            },
        };

        // Audit event: download (append-only)
        await insertAuditEvent({
            req,
            eventType: 'EVIDENCE_PACKAGE_DOWNLOADED',
            signingFileId,
            actorUserId: requesterId,
            actorType: isAdmin ? 'admin' : 'lawyer',
            success: true,
            metadata: {
                zipFilename,
                signingPolicyVersion: String(fileRow.SigningPolicyVersion || SIGNING_POLICY_VERSION),
            },
        });

        res.status(200);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('warning', (err) => {
            console.warn('evidence zip warning:', err);
        });

        archive.on('error', (err) => {
            console.error('evidence zip error:', err);
            try {
                res.destroy(err);
            } catch {
                // ignore
            }
        });

        archive.pipe(res);

        // Required content
        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
        archive.append(JSON.stringify(evidence.auditEvents || [], null, 2), { name: 'audit_events.json' });
        archive.append(JSON.stringify(evidence.consents || [], null, 2), { name: 'consent.json' });

        if (Boolean(fileRow.RequireOtp)) {
            const sanitizedOtp = (evidence.otpVerifications || []).map((o) => ({
                OtpVerificationId: o.OtpVerificationId,
                SignerUserId: o.SignerUserId,
                SigningSessionId: o.SigningSessionId,
                PhoneE164: o.PhoneE164,
                PresentedPdfSha256: o.PresentedPdfSha256,
                SentAtUtc: o.SentAtUtc,
                ExpiresAtUtc: o.ExpiresAtUtc,
                Verified: o.Verified,
                VerifiedAtUtc: o.VerifiedAtUtc,
                AttemptCount: o.AttemptCount,
                LockedUntilUtc: o.LockedUntilUtc,
                RequestIp: o.RequestIp,
                RequestUserAgent: o.RequestUserAgent,
                VerifyIp: o.VerifyIp,
                VerifyUserAgent: o.VerifyUserAgent,
            }));

            archive.append(JSON.stringify({ otpRequired: true, verifications: sanitizedOtp }, null, 2), { name: 'otp.json' });
        } else {
            archive.append(
                JSON.stringify(
                    {
                        otpRequired: false,
                        waiver: {
                            otpWaiverAcknowledged: Boolean(fileRow.OtpWaiverAcknowledged),
                            otpWaiverAcknowledgedAtUtc: fileRow.OtpWaiverAcknowledgedAtUtc ?? null,
                            otpWaiverAcknowledgedByUserId: fileRow.OtpWaiverAcknowledgedByUserId ?? null,
                        },
                    },
                    null,
                    2
                ),
                { name: 'otp.json' }
            );
        }

        archive.append(JSON.stringify(hashes, null, 2), { name: 'hashes.json' });
        archive.append(JSON.stringify(storage, null, 2), { name: 'storage.json' });
        archive.append(getEvidenceReadmeHebrew(), { name: 'README.txt' });

        // signed.pdf must be the exact bytes from storage when available.
        archive.append(signedPdf.stream, { name: 'signed.pdf' });

        await archive.finalize();
    } catch (err) {
        console.error('getEvidencePackageZip error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה ביצירת חבילת ראיות' });
    }
};

// Evidence certificate (human-readable PDF) summarizing evidence for a signing file.
exports.getEvidenceCertificate = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;

        const requesterId = Number(req.user?.UserId);
        const role = req.user?.Role;
        if (!Number.isFinite(requesterId) || requesterId <= 0) {
            return fail(next, 'UNAUTHORIZED', 401);
        }

        // Authorization: lawyer owner or admin only
        const filePolicy = await loadSigningPolicyForFile(signingFileId);
        if (!filePolicy) return fail(next, 'DOCUMENT_NOT_FOUND', 404);

        const isOwnerLawyer = Number(filePolicy.LawyerId) === Number(requesterId);
        const isAdmin = role === 'Admin';
        if (!isOwnerLawyer && !isAdmin) {
            return fail(next, 'FORBIDDEN', 403);
        }

        // Gather evidence rows (reuses existing loader)
        const evidence = await loadEvidenceRowsForZip(signingFileId);
        const fileRow = evidence.file;
        if (!fileRow) return fail(next, 'DOCUMENT_NOT_FOUND', 404);

        if (String(fileRow.Status || '').toLowerCase() !== 'signed') {
            return fail(next, 'DOCUMENT_NOT_SIGNED', 409);
        }

        // Build a human-readable evidence certificate using Puppeteer HTML->PDF
        // Map data according to the requested rules and call renderEvidencePdf
        const spots = evidence.signatureSpots || [];
        const auditEvents = evidence.auditEvents || [];
        const otpVerifications = evidence.otpVerifications || [];

        // Batch-fetch user info for any signer userIds (to get phone/email)
        const signerUserIds = Array.from(new Set(spots.map(s => s.SignerUserId).filter(id => id)));
        const usersById = new Map();
        if (signerUserIds.length > 0) {
            const usersRes = await pool.query(
                `select userid as "UserId", name as "Name", email as "Email", phonenumber as "Phone" from users where userid = any($1::int[])`,
                [signerUserIds]
            );
            for (const r of usersRes.rows) usersById.set(String(r.UserId), r);
        }

        const signersMap = new Map();
        const colorPalette = ['#1b3a57', '#e53e3e', '#dd6b20', '#2f855a', '#6b46c1', '#b83280', '#319795'];
        let colorIdx = 0;

        const normalizeUtc = (value) => {
            if (!value) return '-';
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return String(value);
            return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
        };

        const parseEventMeta = (event) => {
            if (!event?.Metadata) return {};
            if (typeof event.Metadata === 'object') return event.Metadata;
            try {
                return JSON.parse(event.Metadata);
            } catch {
                return {};
            }
        };

        const pickUtc = (...values) => {
            for (const value of values) {
                const normalized = normalizeUtc(value);
                if (normalized !== '-') return normalized;
            }
            return '-';
        };

        const parseDeviceBrowser = (ua) => {
            if (!ua) return '-';
            const s = String(ua);
            const device = /android|iphone|ipad|mobile/i.test(s)
                ? 'Mobile'
                : /Windows NT|Macintosh|Linux/i.test(s)
                    ? 'Desktop'
                    : 'Unknown';
            let browser = 'Other';
            if (/edg/i.test(s)) browser = 'Edge';
            else if (/chrome/i.test(s)) browser = 'Chrome';
            else if (/firefox/i.test(s)) browser = 'Firefox';
            else if (/safari/i.test(s) && !/chrome/i.test(s)) browser = 'Safari';
            return `${device} / ${browser}`;
        };

        for (const s of spots) {
            const key = s.SignerUserId ? `u:${s.SignerUserId}` : `n:${s.SignerName || 'idx' + s.SignatureSpotId}`;
            if (!signersMap.has(key)) {
                const userInfo = s.SignerUserId ? usersById.get(String(s.SignerUserId)) : null;

                const viewedEvent = auditEvents.find(e => String(e.EventType) === 'PDF_VIEWED' && String(e.SigningSessionId) === String(s.SigningSessionId));
                const signedEvent = auditEvents.find(e => String(e.EventType) === 'SIGN_SUCCESS' && String(e.SigningSessionId) === String(s.SigningSessionId));
                const otpRow = otpVerifications.find(o => String(o.SignerUserId) === String(s.SignerUserId) && String(o.SigningSessionId) === String(s.SigningSessionId));
                const otpSentEvent = auditEvents.find(
                    e => String(e.EventType) === 'OTP_SENT' && String(e.SigningSessionId) === String(s.SigningSessionId)
                        && String(e.ActorUserId) === String(s.SignerUserId)
                );
                const publicLinkEvent = auditEvents.find(e => {
                    if (String(e.EventType) !== 'PUBLIC_LINK_ISSUED') return false;
                    const meta = parseEventMeta(e);
                    return String(meta?.targetSignerUserId || '') === String(s.SignerUserId || '');
                });

                const timeSentUtc = pickUtc(
                    otpRow?.SentAtUtc,
                    otpSentEvent?.OccurredAtUtc,
                    publicLinkEvent?.OccurredAtUtc,
                    fileRow?.CreatedAt
                );

                signersMap.set(key, {
                    name: s.SignerName || (userInfo?.Name) || '-',
                    phone: userInfo?.Phone || '-',
                    email: userInfo?.Email || '-',
                    device: parseDeviceBrowser(s.SignerUserAgent || viewedEvent?.UserAgent || otpSentEvent?.UserAgent || '-'),
                    ip: s.SignerIp || viewedEvent?.Ip || otpSentEvent?.Ip || '-',
                    otpUsed: Boolean(s.OtpVerificationId || (otpRow && otpRow.Verified)),
                    timeSentUtc,
                    timeViewedUtc: normalizeUtc(viewedEvent?.OccurredAtUtc),
                    timeSignedUtc: normalizeUtc(s.SignedAt || signedEvent?.OccurredAtUtc),
                    color: colorPalette[(colorIdx++) % colorPalette.length],
                });
            }
        }

        const signers = Array.from(signersMap.values());

        // Sender info: try to resolve lawyer/admin user
        let sender = { name: '-', email: '-' };
        try {
            if (fileRow.LawyerId) {
                const lr = await pool.query('select userid as "UserId", name as "Name", email as "Email" from users where userid = $1', [fileRow.LawyerId]);
                if (lr.rows.length > 0) {
                    sender.name = lr.rows[0].Name || sender.name;
                    sender.email = lr.rows[0].Email || sender.email;
                }
            }
        } catch (e) {
            // ignore
        }

        let signedHashSha256 = fileRow.SignedPdfSha256 || null;
        if (!signedHashSha256) {
            const signedPdf = await loadSignedPdfStreamOrPlaceholder({ signingFileId, fileRow });
            const signedPdfBuffer = await streamToBuffer(signedPdf.stream);
            signedHashSha256 = sha256Hex(signedPdfBuffer);
        }

        const doc = {
            documentId: fileRow.SigningFileId || signingFileId,
            documentName: fileRow.FileName || '-',
            creationUtc: new Date(fileRow.CreatedAt || new Date()).toISOString().replace('T', ' ').slice(0, 19) + 'Z',
            signedHashSha256: signedHashSha256 || '-',
        };

        const logoCandidates = [
            path.resolve(__dirname, '../../frontend/src/assets/images/logos/logoLM.png'),
            path.resolve(__dirname, '../../frontend/src/assets/images/logos/logo.png'),
            path.resolve(__dirname, '../../frontend/src/assets/images/logos/logo2.png'),
            path.resolve(__dirname, '../../frontend/src/assets/images/logos/logoLMwhite.png'),
        ];
        const logoPath = logoCandidates.find(p => fs.existsSync(p)) || null;
        const logoDataUrl = logoPath ? loadFileAsDataUrl(logoPath, 'image/png') : null;

        const verifyUrl = `https://${WEBSITE_DOMAIN}/verify/evidence/${encodeURIComponent(signingFileId)}`;
        let qrDataUrl = null;
        try {
            qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 256, margin: 1 });
        } catch (e) {
            qrDataUrl = null;
        }

        const pdfBuffer = await renderEvidencePdf({
            doc,
            sender,
            signers,
            qrDataUrl,
            brand: {
                companyName: 'MelamedLaw',
                logoDataUrl,
            },
        });

        // Filename: evidence_<caseId>_<signingFileId>_<YYYYMMDD_HHMM>.pdf (UTC)
        const now = new Date();
        const yyyy = String(now.getUTCFullYear());
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(now.getUTCDate()).padStart(2, '0');
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const min = String(now.getUTCMinutes()).padStart(2, '0');
        const caseIdPart = fileRow.CaseId || 'noCase';
        const filename = `evidence_${caseIdPart}_${signingFileId}_${yyyy}${mm}${dd}_${hh}${min}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(Buffer.from(pdfBuffer));
    } catch (err) {
        console.error('getEvidenceCertificate error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה ביצירת מסמך ראייה' });
    }
};

// Creates a signed public token that allows a specific user to sign without logging in.
// Used for shareable links: the token is the only credential.
exports.createPublicSigningLink = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;

        const signerUserId = parsePositiveIntStrict(req?.body?.signerUserId) ?? null;
        const requesterId = req.user?.UserId;

        const fileResult = await pool.query(
            `select signingfileid as "SigningFileId",
                    lawyerid      as "LawyerId",
                    clientid      as "ClientId",
                    expiresat     as "ExpiresAt",
                    requireotp    as "RequireOtp",
                    signingpolicyversion as "SigningPolicyVersion",
                    policyselectedatutc  as "PolicySelectedAtUtc",
                    otpwaiveracknowledged as "OtpWaiverAcknowledged"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return fail(next, 'DOCUMENT_NOT_FOUND', 404);
        }

        const file = fileResult.rows[0];

        // Only the owning lawyer can generate a public link.
        if (Number(file.LawyerId) !== Number(requesterId)) {
            return fail(next, 'FORBIDDEN', 403);
        }

        const targetSignerUserId = signerUserId || file.ClientId;
        if (!targetSignerUserId) {
            return fail(next, 'INVALID_PARAMETER', 422, { meta: { name: 'signerUserId' } });
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

        await insertAuditEvent({
            req,
            eventType: 'PUBLIC_LINK_ISSUED',
            signingFileId,
            actorUserId: requesterId,
            actorType: 'lawyer',
            success: true,
            metadata: {
                signingPolicyVersion: file.SigningPolicyVersion || SIGNING_POLICY_VERSION,
                requireOtp: Boolean(file.RequireOtp),
                otpWaived: !Boolean(file.RequireOtp),
                otpWaiverAcknowledged: Boolean(file.OtpWaiverAcknowledged),
                policySource: file.PolicySelectedAtUtc ? 'explicit' : 'legacy_default',
                targetSignerUserId,
            },
        });

        return res.json({ token, expiresIn });
    } catch (err) {
        console.error('createPublicSigningLink error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה ביצירת קישור לחתימה' });
    }
};

// Explicit per-document signing policy configuration (lawyer-side)
// Legally relevant: OTP opt-out must be explicit and persisted (no silent defaults).
exports.updateSigningPolicy = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;

        const requesterId = req.user?.UserId;
        const role = req.user?.Role;

        const requireOtpRaw = req.body?.require_otp ?? req.body?.requireOtp;
        const hasExplicitPolicySelection = requireOtpRaw === true || requireOtpRaw === false || requireOtpRaw === 1 || requireOtpRaw === 0;
        if (!hasExplicitPolicySelection) {
            return fail(next, 'SIGNING_POLICY_REQUIRED', 422);
        }

        const requireOtp = SIGNING_OTP_ENABLED ? Boolean(requireOtpRaw) : false;
        const waiverAck = SIGNING_OTP_ENABLED
            ? Boolean(req.body?.otpWaiverAcknowledged ?? req.body?.otp_waiver_acknowledged)
            : true;
        if (SIGNING_OTP_ENABLED && !requireOtp && !waiverAck) {
            return fail(next, 'OTP_WAIVER_ACK_REQUIRED', 422);
        }

        const file = await loadSigningPolicyForFile(signingFileId);
        if (!file) return fail(next, 'DOCUMENT_NOT_FOUND', 404);

        const isOwnerLawyer = Number(file.LawyerId) === Number(requesterId);
        const isAdmin = role === 'Admin';
        if (!isOwnerLawyer && !isAdmin) {
            return fail(next, 'FORBIDDEN', 403);
        }

        const schemaSupport = await getSchemaSupport();
        const waiverAckEffective = !requireOtp ? waiverAck : false;
        const policySelectedAtUtc = new Date();

        const updateParts = [
            'requireotp = $2',
            'signingpolicyversion = $3',
            'policyselectedbyuserid = $4',
            'policyselectedatutc = $5',
            'otpwaiveracknowledged = $6',
            'otpwaiveracknowledgedatutc = $7',
            'otpwaiveracknowledgedbyuserid = $8',
        ];

        const updateValues = [
            signingFileId,
            requireOtp,
            SIGNING_POLICY_VERSION,
            requesterId,
            policySelectedAtUtc,
            waiverAckEffective,
            waiverAckEffective ? policySelectedAtUtc : null,
            waiverAckEffective ? requesterId : null,
        ];

        if (schemaSupport.signingfilesOtpWaivedAtUtc) {
            updateParts.push(`otpwaivedatutc = $${updateValues.length + 1}`);
            updateValues.push(waiverAckEffective ? policySelectedAtUtc : null);
        }

        if (schemaSupport.signingfilesOtpWaivedByUserId) {
            updateParts.push(`otpwaivedbyuserid = $${updateValues.length + 1}`);
            updateValues.push(waiverAckEffective ? requesterId : null);
        }

        await pool.query(
            `update signingfiles
             set ${updateParts.join(',\n                 ')}
             where signingfileid = $1`,
            updateValues
        );

        await insertAuditEvent({
            req,
            eventType: 'SIGNING_POLICY_SELECTED',
            signingFileId,
            actorUserId: requesterId,
            actorType: isAdmin ? 'admin' : 'lawyer',
            success: true,
            metadata: {
                signingPolicyVersion: SIGNING_POLICY_VERSION,
                requireOtp,
                otpWaived: !requireOtp,
                otpWaiverAcknowledged: !requireOtp ? waiverAck : false,
            },
        });

        return res.json({ success: true });
    } catch (err) {
        console.error('updateSigningPolicy error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בעדכון מדיניות חתימה' });
    }
};

exports.getPublicSigningFileDetails = async (req, res, next) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return fail(next, verified.errorCode, verified.httpStatus);
        }

        const { signingFileId, signerUserId } = verified;
        const schemaSupport = await getSchemaSupport();

        const authz = await ensurePublicUserAuthorized({ signingFileId, userId: signerUserId, schemaSupport });
        if (!authz.ok) {
            return fail(next, authz.errorCode, authz.httpStatus);
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
                     createdat       as "CreatedAt"${schemaSupport.signaturespotsSignerUserId ? ',\n                signeruserid    as "SignerUserId"' : ''}${schemaSupport.signaturespotsFieldType ? ',\n                fieldtype       as "FieldType"' : ''}${schemaSupport.signaturespotsSignerIndex ? ',\n                signerindex     as "SignerIndex"' : ''}${schemaSupport.signaturespotsFieldLabel ? ',\n                fieldlabel      as "FieldLabel"' : ''}${schemaSupport.signaturespotsFieldValue ? ',\n                fieldvalue      as "FieldValue"' : ''}
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
            file: { ...file, OtpEnabled: SIGNING_OTP_ENABLED },
            signatureSpots,
            isLawyer,
        });
    } catch (err) {
        console.error('getPublicSigningFileDetails error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשליפת פרטי המסמך' });
    }
};

exports.publicSignFile = async (req, res, next) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return fail(next, verified.errorCode, verified.httpStatus);
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
        return exports.signFile(req, res, next);
    } catch (err) {
        console.error('publicSignFile error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשמירת החתימה' });
    }
};

exports.publicRejectSigning = async (req, res, next) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return fail(next, verified.errorCode, verified.httpStatus);
        }

        const { signingFileId, signerUserId } = verified;
        req.params.signingFileId = String(signingFileId);
        req.user = { UserId: signerUserId };
        return exports.rejectSigning(req, res, next);
    } catch (err) {
        console.error('publicRejectSigning error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בדחיית המסמך' });
    }
};

exports.getPublicSigningFilePdf = async (req, res, next) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return fail(next, verified.errorCode, verified.httpStatus);
        }

        const { signingFileId, signerUserId } = verified;
        req.params.signingFileId = String(signingFileId);
        req.user = { UserId: signerUserId };
        return exports.getSigningFilePdf(req, res, next);
    } catch (err) {
        console.error('getPublicSigningFilePdf error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בטעינת PDF' });
    }
};

async function ensurePresentedHashOrCompute({ signingFileId, fileKey }) {
    const fileRes = await pool.query(
        `select presentedpdfsha256 as "PresentedPdfSha256"
         from signingfiles
         where signingfileid = $1`,
        [signingFileId]
    );
    const current = fileRes.rows?.[0]?.PresentedPdfSha256 || null;
    if (current) return current;
    await computeAndPersistUnsignedPdfEvidence({ signingFileId, unsignedPdfKey: fileKey });
    const after = await pool.query(
        `select presentedpdfsha256 as "PresentedPdfSha256"
         from signingfiles
         where signingfileid = $1`,
        [signingFileId]
    );
    return after.rows?.[0]?.PresentedPdfSha256 || null;
}

async function loadSigningPolicyForFile(signingFileId) {
    const r = await pool.query(
        `select
            signingfileid as "SigningFileId",
            lawyerid as "LawyerId",
            clientid as "ClientId",
            filename as "FileName",
            filekey as "FileKey",
            requireotp as "RequireOtp",
            signingpolicyversion as "SigningPolicyVersion",
            policyselectedatutc as "PolicySelectedAtUtc",
            otpwaiveracknowledged as "OtpWaiverAcknowledged",
            presentedpdfsha256 as "PresentedPdfSha256"
         from signingfiles
         where signingfileid = $1`,
        [signingFileId]
    );
    return r.rows?.[0] || null;
}

async function requestSigningOtpImpl({ req, res, next, signingFileId, signerUserId, actorType }) {
    const signingSessionId = getSigningSessionIdFromReq(req);
    if (!signingSessionId) {
        return fail(next, 'SIGNING_SESSION_REQUIRED', 422);
    }

    const schemaSupport = await getSchemaSupport();
    const authz = await ensurePublicUserAuthorized({ signingFileId, userId: signerUserId, schemaSupport });
    if (!authz.ok) {
        return fail(next, authz.errorCode, authz.httpStatus);
    }

    const file = await loadSigningPolicyForFile(signingFileId);
    if (!file) return fail(next, 'DOCUMENT_NOT_FOUND', 404);

    const requireOtpEffective = SIGNING_OTP_ENABLED && Boolean(file.RequireOtp);
    if (!SIGNING_OTP_ENABLED) {
        return fail(next, 'OTP_DISABLED', 409);
    }
    if (!requireOtpEffective) {
        return fail(next, 'OTP_NOT_REQUIRED', 409);
    }

    const presentedPdfSha256 = await ensurePresentedHashOrCompute({ signingFileId, fileKey: file.FileKey });
    if (!presentedPdfSha256) {
        return fail(next, 'MISSING_PRESENTED_HASH', 500);
    }

    const created = await createSigningOtpChallenge({
        signingFileId,
        signerUserId,
        signingSessionId,
        presentedPdfSha256,
        req,
    });
    if (!created.ok) {
        await insertAuditEvent({
            req,
            eventType: 'OTP_SENT',
            signingFileId,
            actorUserId: signerUserId,
            actorType,
            signingSessionId,
            success: false,
            metadata: { failure: created.errorCode },
        });
        return fail(next, created.errorCode, created.httpStatus);
    }

    await insertAuditEvent({
        req,
        eventType: 'OTP_SENT',
        signingFileId,
        actorUserId: signerUserId,
        actorType,
        signingSessionId,
        success: true,
        metadata: {
            signingPolicyVersion: String(file.SigningPolicyVersion || SIGNING_POLICY_VERSION),
            requireOtp: requireOtpEffective,
            otpWaived: !requireOtpEffective,
            policySource: file.PolicySelectedAtUtc ? 'explicit' : 'legacy_default',
            presentedPdfSha256,
            challengeId: created.challengeId,
            expiresAtUtc: created.expiresAtUtc,
        },
    });

    return res.json({ success: true, expiresAtUtc: created.expiresAtUtc });
}

async function verifySigningOtpImpl({ req, res, next, signingFileId, signerUserId, actorType }) {
    const signingSessionId = getSigningSessionIdFromReq(req);
    if (!signingSessionId) {
        return fail(next, 'SIGNING_SESSION_REQUIRED', 422);
    }

    const otp = String(req.body?.otp || '').trim();
    if (!/^[0-9]{6}$/.test(otp)) {
        return fail(next, 'OTP_INVALID_FORMAT', 422);
    }

    const schemaSupport = await getSchemaSupport();
    const authz = await ensurePublicUserAuthorized({ signingFileId, userId: signerUserId, schemaSupport });
    if (!authz.ok) {
        return fail(next, authz.errorCode, authz.httpStatus);
    }

    const file = await loadSigningPolicyForFile(signingFileId);
    if (!file) return fail(next, 'DOCUMENT_NOT_FOUND', 404);

    const requireOtpEffective = SIGNING_OTP_ENABLED && Boolean(file.RequireOtp);
    if (!SIGNING_OTP_ENABLED) {
        return fail(next, 'OTP_DISABLED', 409);
    }
    if (!requireOtpEffective) {
        return fail(next, 'OTP_NOT_REQUIRED', 409);
    }

    const presentedPdfSha256 = await ensurePresentedHashOrCompute({ signingFileId, fileKey: file.FileKey });
    if (!presentedPdfSha256) {
        return fail(next, 'MISSING_PRESENTED_HASH', 500);
    }

    const verified = await verifySigningOtpChallenge({
        signingFileId,
        signerUserId,
        signingSessionId,
        otp,
        presentedPdfSha256,
        req,
    });

    await insertAuditEvent({
        req,
        eventType: 'OTP_VERIFIED',
        signingFileId,
        actorUserId: signerUserId,
        actorType,
        signingSessionId,
        success: Boolean(verified.ok),
        metadata: {
            signingPolicyVersion: String(file.SigningPolicyVersion || SIGNING_POLICY_VERSION),
            requireOtp: requireOtpEffective,
            otpWaived: !requireOtpEffective,
            policySource: file.PolicySelectedAtUtc ? 'explicit' : 'legacy_default',
            presentedPdfSha256,
            challengeId: verified.challengeId || null,
            code: verified.ok ? 'OTP_OK' : verified.errorCode,
        },
    });

    if (!verified.ok) {
        return fail(next, verified.errorCode, verified.httpStatus);
    }

    return res.json({ success: true, otpVerificationId: verified.challengeId });
}

// Public OTP endpoints (token-based)
exports.publicRequestSigningOtp = async (req, res, next) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return fail(next, verified.errorCode, verified.httpStatus);
        }
        return requestSigningOtpImpl({
            req,
            res,
            next,
            signingFileId: verified.signingFileId,
            signerUserId: verified.signerUserId,
            actorType: 'public_signer',
        });
    } catch (err) {
        console.error('publicRequestSigningOtp error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשליחת קוד אימות' });
    }
};

exports.publicVerifySigningOtp = async (req, res, next) => {
    try {
        const verified = verifyPublicSigningToken(req.params.token);
        if (!verified.ok) {
            return fail(next, verified.errorCode, verified.httpStatus);
        }
        return verifySigningOtpImpl({
            req,
            res,
            next,
            signingFileId: verified.signingFileId,
            signerUserId: verified.signerUserId,
            actorType: 'public_signer',
        });
    } catch (err) {
        console.error('publicVerifySigningOtp error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה באימות קוד' });
    }
};

// Authenticated OTP endpoints (in-app)
exports.requestSigningOtp = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const signerUserId = req.user?.UserId;
        return requestSigningOtpImpl({ req, res, next, signingFileId, signerUserId, actorType: 'signer' });
    } catch (err) {
        console.error('requestSigningOtp error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה בשליחת קוד אימות' });
    }
};

exports.verifySigningOtp = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const signerUserId = req.user?.UserId;
        return verifySigningOtpImpl({ req, res, next, signingFileId, signerUserId, actorType: 'signer' });
    } catch (err) {
        console.error('verifySigningOtp error:', err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: 'שגיאה באימות קוד' });
    }
};


exports.signFile = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;

        const signatureSpotId = requireInt(req, res, { source: 'body', name: 'signatureSpotId' });
        if (signatureSpotId === null) return;

        const { signatureImage } = req.body;
        const userId = req.user?.UserId;
        if (!userId) {
            return fail(next, 'UNAUTHORIZED', 401);
        }

        const signingSessionId = getSigningSessionIdFromReq(req);
        if (!signingSessionId) {
            return fail(next, 'SIGNING_SESSION_REQUIRED', 422);
        }

        const consentAccepted = req.body?.consentAccepted === true;
        const consentVersion = String(req.body?.consentVersion || '').trim();

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
                signedat      as "SignedAt",

                requireotp    as "RequireOtp",
                signingpolicyversion as "SigningPolicyVersion",
                policyselectedatutc  as "PolicySelectedAtUtc",
                otpwaiveracknowledged as "OtpWaiverAcknowledged",
                presentedpdfsha256 as "PresentedPdfSha256"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return fail(next, 'DOCUMENT_NOT_FOUND', 404);
        }

        const file = fileResult.rows[0];

        // Authorization checks should happen before writing legally-relevant evidence rows.
        // This avoids creating consent/audit artifacts for unauthorized users.
        const spotResult = await pool.query(
            `select
                signaturespotid as "SignatureSpotId",
                signingfileid   as "SigningFileId",
                issigned        as "IsSigned",
                isrequired      as "IsRequired"${schemaSupport.signaturespotsSignerUserId ? ',\n                signeruserid    as "SignerUserId"' : ''}${schemaSupport.signaturespotsFieldType ? ',\n                fieldtype       as "FieldType"' : ''}${schemaSupport.signaturespotsFieldValue ? ',\n                fieldvalue      as "FieldValue"' : ''}
             from signaturespots
             where signaturespotid = $1 and signingfileid = $2`,
            [signatureSpotId, signingFileId]
        );

        if (spotResult.rows.length === 0) {
            return fail(next, 'SIGNATURE_SPOT_INVALID', 422);
        }

        const spot = spotResult.rows[0];

        // Check authorization: user can sign if they're the primary client OR specifically assigned to this spot
        const isAuthorized = schemaSupport.signaturespotsSignerUserId
            ? (file.ClientId === userId || (spot.SignerUserId && spot.SignerUserId === userId))
            : (file.ClientId === userId);

        if (!isAuthorized) {
            return fail(next, 'FORBIDDEN', 403);
        }

        if (spot.IsSigned) {
            return fail(next, 'SIGNATURE_SPOT_ALREADY_SIGNED', 409);
        }

        const effectivePolicyVersion = String(file.SigningPolicyVersion || SIGNING_POLICY_VERSION);
        const requireOtpEffective = SIGNING_OTP_ENABLED && Boolean(file.RequireOtp);
        const spotType = String(spot.FieldType || 'signature').toLowerCase();
        const isSignatureLike = spotType === 'signature' || spotType === 'initials';
        const fieldValueRaw = req.body?.fieldValue ?? req.body?.field_value;
        const fieldValue = fieldValueRaw === undefined || fieldValueRaw === null ? '' : String(fieldValueRaw).trim();
        if (!consentAccepted) {
            await insertAuditEvent({
                req,
                eventType: 'SIGN_ATTEMPT',
                signingFileId,
                signatureSpotId,
                actorUserId: userId,
                actorType: 'signer',
                signingSessionId,
                success: false,
                metadata: {
                    failure: 'CONSENT_REQUIRED',
                    requireOtp: requireOtpEffective,
                    otpWaived: !requireOtpEffective,
                    policySource: file.PolicySelectedAtUtc ? 'explicit' : 'legacy_default',
                },
            });
            return fail(next, 'CONSENT_REQUIRED', 403);
        }
        if (!consentVersion || consentVersion !== effectivePolicyVersion) {
            await insertAuditEvent({
                req,
                eventType: 'SIGN_ATTEMPT',
                signingFileId,
                signatureSpotId,
                actorUserId: userId,
                actorType: 'signer',
                signingSessionId,
                success: false,
                metadata: {
                    failure: 'CONSENT_VERSION_MISMATCH',
                    consentVersion,
                    expectedConsentVersion: effectivePolicyVersion,
                },
            });
            return fail(next, 'CONSENT_VERSION_MISMATCH', 422);
        }

        if (!file.PresentedPdfSha256) {
            // Without a stable presented document fingerprint, contested admissibility is materially weakened.
            return fail(next, 'MISSING_PRESENTED_HASH', 500);
        }

        const otpVerificationId = requireOtpEffective
            ? await getVerifiedOtpChallengeIdOrNull({
                signingFileId,
                signerUserId: userId,
                signingSessionId,
                presentedPdfSha256: file.PresentedPdfSha256,
            })
            : null;

        if (requireOtpEffective && !otpVerificationId) {
            await insertAuditEvent({
                req,
                eventType: 'SIGN_ATTEMPT',
                signingFileId,
                signatureSpotId,
                actorUserId: userId,
                actorType: 'signer',
                signingSessionId,
                success: false,
                metadata: {
                    failure: 'OTP_REQUIRED',
                    requireOtp: requireOtpEffective,
                    presentedPdfSha256: file.PresentedPdfSha256,
                },
            });
            return fail(next, 'OTP_REQUIRED', 403);
        }

        if (!isSignatureLike && spot.IsRequired && !fieldValue) {
            return fail(next, 'INVALID_PARAMETER', 422, { meta: { name: 'fieldValue' } });
        }

        if (isSignatureLike && !signatureImage) {
            return fail(next, 'INVALID_PARAMETER', 422, { meta: { name: 'signatureImage' } });
        }

        const consentId = await getOrCreateConsent({
            signingFileId,
            signerUserId: userId,
            signingSessionId,
            consentVersion: effectivePolicyVersion,
            req,
        });

        await insertAuditEvent({
            req,
            eventType: 'SIGN_ATTEMPT',
            signingFileId,
            signatureSpotId,
            actorUserId: userId,
            actorType: 'signer',
            signingSessionId,
            success: true,
            metadata: {
                signingPolicyVersion: effectivePolicyVersion,
                requireOtp: requireOtpEffective,
                otpWaived: !requireOtpEffective,
                otpWaiverAcknowledged: Boolean(file.OtpWaiverAcknowledged),
                policySource: file.PolicySelectedAtUtc ? 'explicit' : 'legacy_default',
                presentedPdfSha256: file.PresentedPdfSha256,
                consentId,
                otpVerificationId,
            },
        });

        if (isSignatureLike && signatureImage) {
            const isPng = signatureImage.includes("png");
            const ext = isPng ? "png" : "jpg";
            const key = `signatures/${file.LawyerId}/${userId}/${signingFileId}_${signatureSpotId}.${ext}`;

            let buffer;
            try {
                ({ buffer } = decodeBase64DataUrl(signatureImage));
            } catch {
                return fail(next, 'INVALID_PARAMETER', 422, { meta: { name: 'signatureImage' } });
            }

            if (
                Number.isFinite(MAX_SIGNATURE_IMAGE_BYTES) &&
                MAX_SIGNATURE_IMAGE_BYTES > 0 &&
                buffer.length > MAX_SIGNATURE_IMAGE_BYTES
            ) {
                return fail(next, 'REQUEST_TOO_LARGE', 413);
            }

            const cmd = new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: `image/${ext}`,
            });

            const putRes = await r2.send(cmd);
            const signatureEtag = putRes?.ETag ? String(putRes.ETag).replace(/\"/g, '') : null;
            const signatureVersionId = putRes?.VersionId ? String(putRes.VersionId) : null;
            const signatureSha = sha256Hex(buffer);

            await pool.query(
                `update signaturespots
                 set issigned = true,
                     signedat = now(),
                     signaturedata = $1,
                     signerip = $3::inet,
                     signeruseragent = $4,
                     signingsessionid = $5::uuid,
                     presentedpdfsha256 = $6,
                     otpverificationid = $7::uuid,
                     consentid = $8::uuid,
                     signatureimagesha256 = $9,
                     signaturestorageetag = $10,
                     signaturestorageversionid = $11${schemaSupport.signaturespotsFieldValue ? ',\n                     fieldvalue = $12' : ''}
                 where signaturespotid = $2`,
                [
                    key,
                    signatureSpotId,
                    getRequestIp(req),
                    getRequestUserAgent(req),
                    signingSessionId,
                    file.PresentedPdfSha256,
                    otpVerificationId,
                    consentId,
                    signatureSha,
                    signatureEtag,
                    signatureVersionId,
                    ...(schemaSupport.signaturespotsFieldValue ? [null] : []),
                ]
            );
        } else {
            await pool.query(
                `update signaturespots
                 set issigned = true,
                     signedat = now(),
                     signerip = $2::inet,
                     signeruseragent = $3,
                     signingsessionid = $4::uuid,
                     presentedpdfsha256 = $5,
                     otpverificationid = $6::uuid,
                     consentid = $7::uuid${schemaSupport.signaturespotsFieldValue ? ',\n                     fieldvalue = $8' : ''}
                 where signaturespotid = $1`,
                [
                    signatureSpotId,
                    getRequestIp(req),
                    getRequestUserAgent(req),
                    signingSessionId,
                    file.PresentedPdfSha256,
                    otpVerificationId,
                    consentId,
                    ...(schemaSupport.signaturespotsFieldValue ? [fieldValue] : []),
                ]
            );
        }

        await insertAuditEvent({
            req,
            eventType: 'SIGN_SUCCESS',
            signingFileId,
            signatureSpotId,
            actorUserId: userId,
            actorType: 'signer',
            signingSessionId,
            success: true,
            metadata: {
                signingPolicyVersion: effectivePolicyVersion,
                requireOtp: Boolean(file.RequireOtp),
                otpWaived: !Boolean(file.RequireOtp),
                presentedPdfSha256: file.PresentedPdfSha256,
                consentId,
                otpVerificationId,
            },
        });

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

            // Court-ready: finalize an immutable signed output and persist its SHA-256 + storage integrity metadata.
            try {
                await ensureSignedPdfKey({ signingFileId, lawyerId: file.LawyerId, pdfKey: file.FileKey });
                await insertAuditEvent({
                    req,
                    eventType: 'SIGNED_PDF_GENERATED',
                    signingFileId,
                    actorUserId: file.LawyerId,
                    actorType: 'system',
                    signingSessionId,
                    success: true,
                    metadata: {
                        signingPolicyVersion: effectivePolicyVersion,
                    },
                });
            } catch (e) {
                console.error('Failed to generate signed PDF evidence:', e?.message || e);
            }

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
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בשמירת החתימה" });
    }
};

exports.rejectSigning = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const { rejectionReason } = req.body;
        const userId = req.user?.UserId;
        if (!userId) {
            return fail(next, 'UNAUTHORIZED', 401);
        }

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
            return fail(next, 'DOCUMENT_NOT_FOUND', 404);
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
            return fail(next, 'FORBIDDEN', 403);
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
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בדחיית המסמך" });
    }
};

exports.reuploadFile = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const { fileKey, signatureLocations, signers } = req.body;
        const lawyerId = req.user?.UserId;
        if (!lawyerId) return fail(next, 'UNAUTHORIZED', 401);

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                lawyerid      as "LawyerId",
                clientid      as "ClientId",
                filename      as "FileName",
                status        as "Status",
                immutableatutc as "ImmutableAtUtc"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return fail(next, 'DOCUMENT_NOT_FOUND', 404);
        }

        const file = fileResult.rows[0];

        if (file.LawyerId !== lawyerId) {
            return fail(next, 'FORBIDDEN', 403, { message: "אין הרשאה למסמך זה" });
        }

        // Court-ready: once immutable (signed output finalized), the unsigned document must not be replaced.
        if (file.ImmutableAtUtc || file.Status === 'signed') {
            return fail(next, 'IMMUTABLE_DOCUMENT', 409, {
                message: 'לא ניתן להעלות מחדש מסמך לאחר שהפך לבלתי ניתן לשינוי',
            });
        }

        await pool.query(
            `update signingfiles
             set filekey = $1,
                 originalfilekey = $1,
                 status = 'pending',
                 rejectionreason = null,
                 signedfilekey = null,
                 signedat = null,
                 immutableatutc = null,
                 -- Evidence fields are recomputed for the new unsigned version
                 originalpdfsha256 = null,
                 presentedpdfsha256 = null,
                 signedpdfsha256 = null,
                 originalstoragebucket = null,
                 originalstoragekey = null,
                 originalstorageetag = null,
                 originalstorageversionid = null,
                 signedstoragebucket = null,
                 signedstoragekey = null,
                 signedstorageetag = null,
                 signedstorageversionid = null
             where signingfileid = $2`,
            [fileKey, signingFileId]
        );

        try {
            const ev = await computeAndPersistUnsignedPdfEvidence({ signingFileId, unsignedPdfKey: fileKey });
            await insertAuditEvent({
                req,
                eventType: 'DOCUMENT_REUPLOADED',
                signingFileId,
                actorUserId: lawyerId,
                actorType: 'lawyer',
                success: true,
                metadata: {
                    signingPolicyVersion: SIGNING_POLICY_VERSION,
                    newFileKey: safeKeyHint(fileKey),
                    presentedPdfSha256: ev?.pdfSha || null,
                },
            });
        } catch (e) {
            const failClosed = String(process.env.IS_PRODUCTION || 'false').toLowerCase() === 'true';
            if (failClosed) throw e;
            console.error('Failed to recompute evidence for reupload:', e?.message || e);
        }

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

                const spotType = String(spot.fieldType || spot.type || spot.FieldType || 'signature').toLowerCase();
                const spotLabel = spot.fieldLabel || spot.label || null;

                if (schemaSupport.signaturespotsSignerUserId || schemaSupport.signaturespotsFieldType || schemaSupport.signaturespotsSignerIndex || schemaSupport.signaturespotsFieldLabel) {
                    const insertColumns = [
                        'signingfileid',
                        'pagenumber',
                        'x',
                        'y',
                        'width',
                        'height',
                        'signername',
                        'isrequired',
                    ];
                    const insertValues = [
                        signingFileId,
                        spot.pageNum || 1,
                        spot.x ?? 50,
                        spot.y ?? 50,
                        spot.width ?? 150,
                        spot.height ?? 75,
                        signerName,
                        isRequiredEffective,
                    ];

                    if (schemaSupport.signaturespotsSignerUserId) {
                        insertColumns.push('signeruserid');
                        insertValues.push(signerUserId || null);
                    }

                    if (schemaSupport.signaturespotsFieldType) {
                        insertColumns.push('fieldtype');
                        insertValues.push(spotType);
                    }

                    if (schemaSupport.signaturespotsSignerIndex) {
                        insertColumns.push('signerindex');
                        insertValues.push(spot.signerIndex ?? null);
                    }

                    if (schemaSupport.signaturespotsFieldLabel) {
                        insertColumns.push('fieldlabel');
                        insertValues.push(spotLabel);
                    }

                    const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(',');
                    await pool.query(
                        `insert into signaturespots
                         (${insertColumns.join(', ')})
                         values (${placeholders})`,
                        insertValues
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
                            isRequiredEffective,
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
                    ? `המסמך "${file.FileName}" הועלה מחדש לחתימה.\n ${publicUrl}`
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
                                `מסמך מחכה לחתימה: ${file.FileName}\n${publicUrl}`,
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
                ? `המסמך "${file.FileName}" הועלה מחדש לחתימה.\n${publicUrl}`
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
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בהעלאת קובץ מחדש" });
    }
};

exports.getSignedFileDownload = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const userId = req.user?.UserId;
        if (!userId) return fail(next, 'UNAUTHORIZED', 401);

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
            return fail(next, 'DOCUMENT_NOT_FOUND', 404);
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
            return fail(next, 'FORBIDDEN', 403, { message: "אין הרשאה להוריד מסמך זה" });
        }

        if (file.Status !== "signed" && !file.SignedFileKey) {
            return fail(next, 'DOCUMENT_NOT_SIGNED', 409);
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

        await insertAuditEvent({
            req,
            eventType: 'SIGNED_PDF_DOWNLOADED',
            signingFileId,
            actorUserId: userId,
            actorType: isLawyer ? 'lawyer' : 'signer',
            metadata: {
                key,
                isSignedOutput: Boolean(file.SignedFileKey),
            },
        });

        return res.json({ downloadUrl, expiresIn: 600 });
    } catch (err) {
        console.error("getSignedFileDownload error:", err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה ביצירת קישור הורדה" });
    }
};

// Streams the original PDF (filekey) for in-app viewing (react-pdf/pdfjs).
// Supports Range requests so pdf.js can efficiently load pages.
exports.getSigningFilePdf = async (req, res, next) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const userId = req.user?.UserId;
        if (!userId) return fail(next, 'UNAUTHORIZED', 401);

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
            return fail(next, 'DOCUMENT_NOT_FOUND', 404);
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
            return fail(next, 'FORBIDDEN', 403, { message: "אין הרשאה למסמך זה" });
        }

        await insertAuditEvent({
            req,
            eventType: 'PDF_VIEWED',
            signingFileId,
            actorUserId: userId,
            actorType: isLawyer ? 'lawyer' : 'signer',
            metadata: {
                range: req.headers.range || null,
            },
        });

        if (!file.FileKey) {
            return fail(next, 'FILEKEY_MISSING', 404);
        }

        const range = req.headers.range;
        const cmd = new GetObjectCommand({
            Bucket: BUCKET,
            Key: file.FileKey,
            ...(range ? { Range: range } : {}),
        });

        const obj = await r2.send(cmd);

        if (!obj.Body) {
            return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בקריאת הקובץ" });
        }

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

        obj.Body.pipe(res);
    } catch (err) {
        console.error("getSigningFilePdf error:", err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בטעינת PDF" });
    }
};

exports.detectSignatureSpots = async (req, res, next) => {
    try {
        const { fileKey, signers } = req.body;

        if (isSigningDebugEnabled()) {
            console.log('[signing] detectSignatureSpots', {
                userId: req.user?.UserId,
                fileKeyHint: safeKeyHint(fileKey),
                signerCount: Array.isArray(signers) ? signers.length : undefined,
            });
        }

        if (!fileKey) return fail(next, 'FILEKEY_REQUIRED', 422);

        // Prevent arbitrary reads from the bucket via guessed keys.
        // Our upload flow uses keys prefixed with `users/<userId>/...`.
        const userId = req.user?.UserId;
        if (!userId) return fail(next, 'UNAUTHORIZED', 401);
        if (!String(fileKey).startsWith(`users/${userId}/`)) {
            return fail(next, 'FORBIDDEN', 403);
        }


        // Enforce PDF size before downloading into memory.
        try {
            const head = await headR2Object({ key: fileKey });
            const size = Number(head?.ContentLength || 0);
            if (Number.isFinite(MAX_SIGNING_PDF_BYTES) && MAX_SIGNING_PDF_BYTES > 0 && size > MAX_SIGNING_PDF_BYTES) {
                return fail(next, 'REQUEST_TOO_LARGE', 413);
            }
        } catch (e) {
            console.error('detectSignatureSpots headObject failed:', e?.message);
            return fail(next, 'INVALID_FILE_KEY', 422);
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
            return fail(next, 'REQUEST_TIMEOUT', 504);
        }
        console.error('[controller] detectSignatureSpots error:', err?.message || err);
        return fail(next, 'INTERNAL_ERROR', 500, { message: "שגיאה בזיהוי מקומות חתימה" });
    }
};
