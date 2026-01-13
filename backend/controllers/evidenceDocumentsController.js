const pool = require('../config/db');
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');

function appError(errorCode, httpStatus, { message, meta } = {}) {
    return createAppError(
        String(errorCode),
        Number(httpStatus) || 500,
        message || getHebrewMessage(errorCode),
        meta
    );
}

function parseIsoDateOrNull(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function parsePositiveIntOrNull(v) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

function base64UrlEncode(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecodeToString(s) {
    const raw = String(s || '').trim();
    if (!raw) return '';
    const padded = raw
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(raw.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf8');
}

function encodeCursor({ signedAtUtc, signingFileId }) {
    return base64UrlEncode(JSON.stringify({ signedAtUtc, signingFileId }));
}

function decodeCursor(cursor) {
    const raw = base64UrlDecodeToString(cursor);
    if (!raw) return null;
    const obj = JSON.parse(raw);

    const signedAtUtc = String(obj?.signedAtUtc || '').trim();
    const signingFileId = parsePositiveIntOrNull(obj?.signingFileId);
    if (!signedAtUtc || signingFileId == null) return null;

    const d = new Date(signedAtUtc);
    if (Number.isNaN(d.getTime())) return null;
    return { signedAtUtc, signingFileId };
}

function maskPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length <= 4) return `${digits.slice(0, 1)}***`;
    return `${digits.slice(0, 3)}-XXX-${digits.slice(-4)}`;
}

function formatClientDisplayName({ name, phone }) {
    const n = String(name || '').trim();
    const m = maskPhone(phone);
    if (n && m) return `${n} (${m})`;
    if (n) return n;
    return m;
}

function formatCaseDisplayName({ caseId, caseName }) {
    const id = Number.isInteger(caseId) && caseId > 0 ? caseId : null;
    const name = String(caseName || '').trim();
    if (id && name) return `תיק ${id} – ${name}`;
    if (id) return `תיק ${id}`;
    return name || null;
}

function formatDocumentDisplayName({ filename }) {
    const f = String(filename || '').trim();
    return f || null;
}

exports.listEvidenceDocuments = async (req, res, next) => {
    try {
        const role = String(req.user?.Role || '');
        const userId = Number(req.user?.UserId);

        const q = String(req.query.q || '').trim();
        const customerId = parsePositiveIntOrNull(req.query.customerId);
        const caseId = parsePositiveIntOrNull(req.query.caseId);
        const signingFileId = parsePositiveIntOrNull(req.query.signingFileId);

        const from = parseIsoDateOrNull(req.query.from);
        const to = parseIsoDateOrNull(req.query.to);

        const limitRaw = req.query.limit;
        const limitParsed = Number.parseInt(String(limitRaw || ''), 10);
        const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 200) : 50;

        const cursorRaw = String(req.query.cursor || '').trim();
        let cursor = null;
        if (cursorRaw) {
            try {
                cursor = decodeCursor(cursorRaw);
            } catch {
                cursor = null;
            }
            if (!cursor) {
                return next(appError('INVALID_PARAMETER', 400, { meta: { cursor: 'invalid' } }));
            }
        }

        if (req.query.customerId != null && customerId == null) {
            return next(appError('INVALID_PARAMETER', 400, { meta: { customerId: 'invalid' } }));
        }
        if (req.query.caseId != null && caseId == null) {
            return next(appError('INVALID_PARAMETER', 400, { meta: { caseId: 'invalid' } }));
        }
        if (req.query.signingFileId != null && signingFileId == null) {
            return next(appError('INVALID_PARAMETER', 400, { meta: { signingFileId: 'invalid' } }));
        }
        if (from && to && from > to) {
            return next(appError('INVALID_PARAMETER', 400, { meta: { dateRange: 'from_after_to' } }));
        }

        const isAdmin = role === 'Admin';
        const isLawyer = role === 'Lawyer';
        if (!isAdmin && !isLawyer) {
            return next(appError('FORBIDDEN', 403));
        }

        const where = [];
        const params = [];

        // Eligibility: only signed output exists.
        where.push('sf.signedfilekey is not null');

        if (signingFileId) {
            params.push(signingFileId);
            where.push(`sf.signingfileid = $${params.length}`);
        }
        if (caseId) {
            params.push(caseId);
            where.push(`sf.caseid = $${params.length}`);
        }
        if (customerId) {
            params.push(customerId);
            where.push(`sf.clientid = $${params.length}`);
        }

        if (from) {
            params.push(from.toISOString());
            where.push(`coalesce(sf.signedat, sf.createdat) >= $${params.length}::timestamptz`);
        }
        if (to) {
            params.push(to.toISOString());
            where.push(`coalesce(sf.signedat, sf.createdat) <= $${params.length}::timestamptz`);
        }

        if (q) {
            params.push(`%${q}%`);
            const p = `$${params.length}`;
            where.push(
                `(
                    u.name ilike ${p}
                    or u.email ilike ${p}
                    or u.phonenumber ilike ${p}
                    or c.casename ilike ${p}
                    or sf.filename ilike ${p}
                    or sf.signingfileid::text ilike ${p}
                    or c.caseid::text ilike ${p}
                )`
            );
        }

        // Authorization:
        // - Admin: can view all
        // - Lawyer: only signingfiles they own
        if (isLawyer) {
            params.push(userId);
            where.push(`sf.lawyerid = $${params.length}`);
        }

        if (cursor) {
            params.push(cursor.signedAtUtc);
            const tsParam = `$${params.length}::timestamptz`;
            params.push(cursor.signingFileId);
            const idParam = `$${params.length}::int`;
            where.push(
                `(
                    coalesce(sf.signedat, sf.createdat) < ${tsParam}
                    or (
                        coalesce(sf.signedat, sf.createdat) = ${tsParam}
                        and sf.signingfileid < ${idParam}
                    )
                )`
            );
        }

        const whereSql = where.length ? `where ${where.join(' and ')}` : '';

        // Fetch one extra row to know if there's a next page.
        params.push(limit + 1);
        const limitParam = `$${params.length}`;

        const query = `
            select
                sf.signingfileid,
                sf.caseid,
                sf.clientid,
                sf.lawyerid,
                sf.filename,
                sf.signedfilekey,
                sf.signedat,
                sf.createdat,
                sf.requireotp,
                sf.otpwaiveracknowledged,
                sf.otpwaiveracknowledgedatutc,
                sf.otpwaiveracknowledgedbyuserid,
                c.casename,
                u.name as client_name,
                u.phonenumber as client_phone,
                w.name as otp_waiver_by_name
            from signingfiles sf
            left join cases c on c.caseid = sf.caseid
            left join users u on u.userid = sf.clientid
            left join users w on w.userid = sf.otpwaiveracknowledgedbyuserid
            ${whereSql}
            order by coalesce(sf.signedat, sf.createdat) desc, sf.signingfileid desc
            limit ${limitParam}
        `;

        const result = await pool.query(query, params);
        const rows = result.rows || [];
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;

        const items = page.map((r) => {
            const signingFileIdOut = Number(r.signingfileid);
            const caseIdOut = r.caseid == null ? null : Number(r.caseid);

            const signedAt = r.signedat ? new Date(r.signedat) : (r.createdat ? new Date(r.createdat) : null);
            const signedAtUtc = signedAt && !Number.isNaN(signedAt.getTime()) ? signedAt.toISOString() : null;

            const requireOtp = Boolean(r.requireotp);
            const waived = Boolean(r.otpwaiveracknowledged);
            const waivedAtUtc = waived && r.otpwaiveracknowledgedatutc
                ? new Date(r.otpwaiveracknowledgedatutc).toISOString()
                : null;
            const waivedBy = waived ? (String(r.otp_waiver_by_name || '').trim() || null) : null;

            return {
                signingFileId: signingFileIdOut,
                caseId: caseIdOut,
                caseDisplayName: formatCaseDisplayName({ caseId: caseIdOut, caseName: r.casename }),
                clientDisplayName: formatClientDisplayName({ name: r.client_name, phone: r.client_phone }),
                documentDisplayName: formatDocumentDisplayName({ filename: r.filename, signingFileId: signingFileIdOut }),
                signedAtUtc,
                otpPolicy: {
                    requireOtp,
                    waivedBy,
                    waivedAtUtc,
                },
                evidenceZipAvailable: Boolean(r.signedfilekey),
            };
        });

        let nextCursor = null;
        if (hasMore && page.length) {
            const last = page[page.length - 1];
            const signedAt = last.signedat ? new Date(last.signedat) : (last.createdat ? new Date(last.createdat) : null);
            const signedAtUtc = signedAt && !Number.isNaN(signedAt.getTime()) ? signedAt.toISOString() : null;
            if (signedAtUtc) {
                nextCursor = encodeCursor({
                    signedAtUtc,
                    signingFileId: Number(last.signingfileid),
                });
            }
        }

        return res.json({ items, nextCursor });
    } catch (err) {
        return next(err);
    }
};
