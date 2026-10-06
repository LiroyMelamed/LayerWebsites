const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { createAppError } = require('../utils/appError');
const { UUID, invalid, requestHash } = require('../lib/signingTemplateDefinition');
const { resolveFirmSigningPolicy } = require('../lib/firm/resolveFirmSigningPolicy');
const { consume } = require('../utils/rateLimiter');
const { isMultiTenantMode, getCurrentTenantId } = require('../lib/tenant/tenantContext');

async function publicRecipient(req) {
    let claims;
    try { claims = jwt.verify(req.params.token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
    catch { throw createAppError('INVALID_TOKEN', 401, 'הקישור אינו תקין או שפג תוקפו'); }
    if (claims.typ !== 'signing_batch' || !UUID.test(String(claims.recipientId))) throw createAppError('INVALID_TOKEN', 401);
    if (!consume({ key: `batch-public:${claims.recipientId}`, windowMs: 60000, max: 120 }).allowed) throw createAppError('RATE_LIMITED', 429);
    if (!(await resolveFirmSigningPolicy()).signingEnabled) throw createAppError('FORBIDDEN', 403);
    const { rows } = await pool.query(`SELECT r.*,b.name,b.status AS batch_status,b.snapshot,u.name AS recipient_name
        FROM signing_batch_recipients r JOIN signing_batches b ON b.id=r.batch_id JOIN users u ON u.userid=r.user_id
        WHERE r.id=$1 AND b.status<>'cancelled' AND ($2::boolean=false OR b.law_firm_tenant_id=$3::uuid)`, [claims.recipientId, isMultiTenantMode(), getCurrentTenantId()]);
    if (!rows[0]) throw createAppError('NOT_FOUND', 404);
    return rows[0];
}
async function recipientFiles(recipient) {
    return (await pool.query(`SELECT sf.signingfileid,sf.filename,sf.status,sf.expiresat,sf.originalpdfsha256,sf.presentedpdfsha256,sf.requireotp,
        bf.package_index,bf.document_index,
        count(*) FILTER(WHERE NOT s.issigned AND s.isrequired)::integer AS remaining,
        (sf.signingorder<>'sequential' OR min(s.signerindex)<=coalesce((SELECT min(all_s.signerindex) FROM signaturespots all_s
            WHERE all_s.signingfileid=sf.signingfileid AND NOT all_s.issigned AND all_s.isrequired),min(s.signerindex))) AS is_my_turn
        FROM signing_batch_files bf JOIN signingfiles sf USING(signingfileid)
        JOIN signaturespots s ON s.signingfileid=sf.signingfileid AND s.signeruserid=$2
        WHERE bf.batch_id=$1 GROUP BY sf.signingfileid,bf.package_index,bf.document_index ORDER BY bf.package_index,bf.document_index`, [recipient.batch_id, recipient.user_id])).rows;
}
async function publicDetails(req) {
    const recipient = await publicRecipient(req);const files = await recipientFiles(recipient);
    const { createPublicSigningToken } = require('../controllers/signingFileController');
    return { name: recipient.name, recipientName: recipient.recipient_name,
        files: files.map(file => ({ id: file.signingfileid, name: file.filename, status: file.status, remaining: file.remaining,
            isMyTurn: file.is_my_turn, sha256: file.presentedpdfsha256,
            token: file.status === 'draft' ? null : createPublicSigningToken({ signingFileId: file.signingfileid, signerUserId: recipient.user_id, fileExpiresAt: file.expiresat }) })) };
}
async function startSession(req) {
    const recipient = await publicRecipient(req);
    if (req.body?.consentAccepted !== true || req.body?.consentVersion !== '2026-01-11') throw createAppError('CONSENT_REQUIRED', 403);
    const requested = req.body?.documents;
    if (!Array.isArray(requested) || !requested.length || requested.length > 200 || new Set(requested.map(d => d?.fileId)).size !== requested.length || requested.some(d => !Number.isSafeInteger(d?.fileId) || !/^[a-f0-9]{64}$/.test(d?.sha256))) invalid('יש לבחור מסמכים שנבדקו');
    const files = await recipientFiles(recipient);
    const reviewed = requested.map(doc => files.find(file => file.signingfileid === doc.fileId && file.presentedpdfsha256 === doc.sha256));
    if (reviewed.some(file => !file || !file.is_my_turn || file.status !== 'pending' || file.remaining < 1 || (file.expiresat && new Date(file.expiresat) <= new Date()) || !file.presentedpdfsha256)) throw createAppError('CONFLICT', 409, 'חלק מהמסמכים השתנו או עדיין אינם זמינים לחתימה. יש לרענן');
    // A caller-chosen UUID allows a network retry to reuse the same challenge/session.
    const id = req.body.sessionId;if (!UUID.test(String(id))) invalid('מזהה סבב החתימה אינו תקין');
    // Choose a document that actually requires OTP when individual policies differ.
    const manifest = [...reviewed].sort((a, b) => Number(b.requireotp) - Number(a.requireotp) || a.signingfileid - b.signingfileid)
        .map(file => ({ fileId: file.signingfileid, sha256: file.presentedpdfsha256 }));
    await pool.query(`INSERT INTO signing_batch_sessions(id,recipient_id,document_manifest,expires_at)
        VALUES($1,$2,$3::jsonb,now()+interval '30 minutes') ON CONFLICT(id) DO NOTHING`, [id, recipient.id, JSON.stringify(manifest)]);
    const existing = (await pool.query('SELECT * FROM signing_batch_sessions WHERE id=$1', [id])).rows[0];
    if (existing.recipient_id !== recipient.id || requestHash(existing.document_manifest) !== requestHash(manifest) || new Date(existing.expires_at) <= new Date()) throw createAppError('CONFLICT', 409, 'סבב החתימה השתנה או שפג תוקפו');
    const { createPublicSigningToken } = require('../controllers/signingFileController');
    return { sessionId: id, expiresAt: existing.expires_at, requireOtp: reviewed.some(file => file.requireotp), canonicalToken: createPublicSigningToken({ signingFileId: manifest[0].fileId, signerUserId: recipient.user_id }) };
}
async function confirmOtp(req) {
    const recipient = await publicRecipient(req);const id = req.body?.sessionId;
    if (!UUID.test(String(id))) invalid('מזהה סבב החתימה אינו תקין');
    const result = await pool.query(`UPDATE signing_batch_sessions s SET verified_at=now(),canonical_challenge_id=c.challengeid
        FROM signing_otp_challenges c WHERE s.id=$1 AND s.recipient_id=$2 AND s.expires_at>now()
        AND c.signingsessionid=s.id AND c.signeruserid=$3 AND c.verified AND c.verified_at_utc IS NOT NULL
        AND c.expires_at_utc>now() AND c.signingfileid=(s.document_manifest->0->>'fileId')::integer
        AND c.presentedpdfsha256=s.document_manifest->0->>'sha256'
        RETURNING s.document_manifest,c.challengeid`, [id, recipient.id, recipient.user_id]);
    if (!result.rows.length) throw createAppError('OTP_REQUIRED', 403);
    const { insertAuditEvent } = require('../controllers/signingFileController');
    for (const doc of result.rows[0].document_manifest) await insertAuditEvent({ req, eventType: 'BATCH_OTP_VERIFIED', signingFileId: doc.fileId,
        actorUserId: recipient.user_id, actorType: 'signer', signingSessionId: id,
        metadata: { recipientId: recipient.id, manifest: result.rows[0].document_manifest, challengeId: result.rows[0].challengeid } });
    return { verified: true };
}
module.exports = { publicRecipient, recipientFiles, publicDetails, startSession, confirmOtp };
