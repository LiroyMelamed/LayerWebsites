const pool = require('../config/db');

// This is a reference to a real verified challenge, not a new or copied OTP.
// It is usable only for the exact original PDFs explicitly reviewed in this session.
async function batchOtpGrant({ signingFileId, signerUserId, signingSessionId, presentedPdfSha256 }) {
    const { rows } = await pool.query(`SELECT c.challengeid FROM signing_batch_sessions s
        JOIN signing_batch_recipients r ON r.id=s.recipient_id
        JOIN signing_batches b ON b.id=r.batch_id
        JOIN signing_otp_challenges c ON c.challengeid=s.canonical_challenge_id
        JOIN signing_batch_files bf ON bf.batch_id=b.id AND bf.signingfileid=$1
        WHERE s.id=$3::uuid AND r.user_id=$2 AND s.verified_at IS NOT NULL AND s.expires_at>now()
        AND b.status<>'cancelled' AND c.verified AND c.signeruserid=$2 AND c.signingsessionid=s.id
        AND s.document_manifest @> $4::jsonb LIMIT 1`,
    [signingFileId, signerUserId, signingSessionId, JSON.stringify([{ fileId: Number(signingFileId), sha256: String(presentedPdfSha256) }])]);
    return rows[0]?.challengeid || null;
}
module.exports = { batchOtpGrant };
