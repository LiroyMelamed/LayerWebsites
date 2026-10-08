const { randomUUID, createHash } = require('node:crypto');
const { transaction } = require('./transaction');

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const safeCode = value => /^[A-Z][A-Z0-9_]{1,79}$/.test(value || '') ? value : 'UNEXPECTED_ERROR';

// Only server route patterns and an allowlisted code are recorded: never URLs,
// headers, OTP, request bodies, tokens, error messages or document contents.
function requestErrorReporter(pool, area) {
    return async (error, req, res, next) => {
        const expectedAuthFailure = ['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(error?.name);
        const status = Number(error?.httpStatus || error?.statusCode || error?.status || (expectedAuthFailure ? 401 : 500));
        if (status >= 500 || error?.errorCode === 'OTP_DELIVERY_FAILED') {
            try {
                const phase = `${area}:${req.method}:${req.route?.path || 'request'}`.slice(0, 160);
                const source = `request:${Math.floor(Date.now() / 300000)}:${createHash('sha256').update(phase).digest('hex')}`;
                await pool.query(`INSERT INTO signing_error_alerts(source_key,phase,error_code,severity)
                    VALUES($1,$2,$3,'request') ON CONFLICT
                    ((COALESCE(owner_context_id,'00000000-0000-0000-0000-000000000000'::uuid)),source_key,phase,error_code,severity)
                    DO UPDATE SET last_seen_at=clock_timestamp(),occurrences=signing_error_alerts.occurrences+1`,
                [source, phase, safeCode(error?.errorCode)]);
            } catch { console.error('[signing-v2] error alert persistence unavailable'); }
        }
        next(error);
    };
}

const WORDS = {
    he: { title: 'תקלה בתהליך מסמכים לחתימה', intro: 'זוהו שגיאות הדורשות מעקב של מנהלי הפלטפורמה.',
        phase: 'שלב', code: 'קוד תקלה', state: 'מצב בעת התקלה', count: 'עבודות שהושפעו', open: 'פתיחת מסך החתימות',
        note: 'זהו דיווח על אירוע שנרשם. המצב הנוכחי עשוי להשתנות בעקבות התאוששות אוטומטית. משלוח שתוצאתו אינה ידועה אינו נשלח שוב אוטומטית.',
        states: { retry: 'ניסיון נוסף מתוכנן', needs_attention: 'נדרש טיפול', uncertain: 'תוצאת המשלוח אינה ידועה', failed: 'נכשל', request: 'שגיאת בקשה' },
        phases: { prepare_document: 'הכנת מסמך', validate_package: 'בדיקת חבילה', activate_package: 'הפעלת חבילה', render_stage: 'הפקה לאחר חתימה', finalize_document: 'הפקת מסמך סופי', render_evidence: 'הפקת ראיות', dispatch_delivery: 'משלוח' } },
    ar: { title: 'خطأ في عملية مستندات التوقيع', intro: 'تم تسجيل أخطاء تتطلب متابعة مسؤولي المنصة.',
        phase: 'المرحلة', code: 'رمز الخطأ', state: 'الحالة عند الخطأ', count: 'المهام المتأثرة', open: 'فتح شاشة التوقيعات',
        note: 'هذا تقرير عن حدث مسجّل. قد تتغير الحالة بعد الاسترداد التلقائي. لا تُعاد الرسائل ذات النتيجة غير المعروفة تلقائيًا.',
        states: { retry: 'إعادة المحاولة مجدولة', needs_attention: 'يتطلب معالجة', uncertain: 'نتيجة الإرسال غير معروفة', failed: 'فشل', request: 'خطأ في الطلب' }, phases: {} },
    en: { title: 'Signing document workflow error', intro: 'Errors requiring platform administrator attention were recorded.',
        phase: 'Stage', code: 'Error code', state: 'State at failure', count: 'Affected work items', open: 'Open signing workspace',
        note: 'This reports a recorded event. Current status may change after automatic recovery. Messages with unknown outcomes are not resent automatically.',
        states: { retry: 'Retry scheduled', needs_attention: 'Needs attention', uncertain: 'Unknown delivery outcome', failed: 'Failed', request: 'Request error' }, phases: {} },
};

function buildAlertEmail(events, { origin, locale = 'he' }) {
    const language = WORDS[locale] ? locale : 'he', words = WORDS[language];
    const groups = new Map();
    for (const event of events) {
        const key = `${event.submission_id || ''}:${event.phase}:${event.error_code}:${event.severity}`;
        const group = groups.get(key) || { ...event, count: 0 };
        group.count++; groups.set(key, group);
    }
    const url = new URL('/AdminStack/SigningManagerScreen?panel=runs', origin).href;
    const rows = [...groups.values()].map(event => {
        const target = new URL(url);
        if (event.submission_id) target.searchParams.set('submission', event.submission_id);
        return `<tr><td>${escape(words.phases[event.phase] || event.phase)}<br><a href="${escape(target.href)}">${words.open}</a></td><td dir="ltr">${escape(event.error_code)}</td><td>${escape(words.states[event.severity])}</td><td>${event.count}</td></tr>`;
    }).join('');
    return { subject: words.title, htmlBody: `<html lang="${language}" dir="${language === 'en' ? 'ltr' : 'rtl'}"><body style="font-family:Arial,sans-serif;color:#2A4365"><h2>${words.title}</h2><p>${words.intro}</p><p dir="ltr">${escape(new URL(origin).host)}</p><table cellpadding="10" style="border-collapse:collapse" border="1"><thead><tr><th>${words.phase}</th><th>${words.code}</th><th>${words.state}</th><th>${words.count}</th></tr></thead><tbody>${rows}</tbody></table><p>${words.note}</p><p><a href="${escape(url)}">${words.open}</a></p></body></html>` };
}

function createErrorAlerts({ pool, sendEmail, origin, locale = 'he', contextIds = null, delaySeconds = 15, log = console }) {
    if (typeof sendEmail !== 'function') throw new Error('Error alert email adapter required');
    const site = new URL(/^https?:\/\//i.test(origin) ? origin : `https://${origin}`);
    if (!['https:', 'http:'].includes(site.protocol)) throw new Error('Invalid signing alert origin');
    let timer = null, inFlight = null;

    async function prepare() {
        return transaction(pool, async db => {
            const recipients = (await db.query(`SELECT DISTINCT ON (lower(trim(u.email))) u.userid,lower(trim(u.email)) AS email
                FROM platform_admins a JOIN users u ON u.userid=a.user_id
                WHERE a.is_active=TRUE AND u.email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
                ORDER BY lower(trim(u.email)),u.userid`)).rows;
            if (!recipients.length) return;
            const events = (await db.query(`SELECT * FROM signing_error_alerts WHERE batch_id IS NULL
                AND first_seen_at <= clock_timestamp()-make_interval(secs=>$1)
                AND ($2::uuid[] IS NULL OR owner_context_id=ANY($2::uuid[]))
                ORDER BY first_seen_at,id LIMIT 1000 FOR UPDATE SKIP LOCKED`, [delaySeconds, contextIds])).rows;
            // One summary per office and active platform administrator, instead of a mail per PDF.
            const offices = new Map();
            for (const event of events) { const key = event.owner_context_id; if (!offices.has(key)) offices.set(key, []); offices.get(key).push(event.id); }
            for (const ids of offices.values()) {
                const batch = randomUUID();
                await db.query('UPDATE signing_error_alerts SET batch_id=$1 WHERE id=ANY($2::uuid[])', [batch, ids]);
                await db.query(`INSERT INTO signing_error_emails(batch_id,recipient_user_id,recipient_email)
                    SELECT $1,userid,email FROM jsonb_to_recordset($2::jsonb) AS r(userid integer,email text)`, [batch, JSON.stringify(recipients)]);
            }
        });
    }

    async function deliver(row) {
        // Removal from platform administrators takes effect even after the alert was queued.
        const current = (await pool.query(`SELECT lower(trim(u.email)) AS email FROM platform_admins a JOIN users u ON u.userid=a.user_id
            WHERE a.user_id=$1 AND a.is_active=TRUE`, [row.recipient_user_id])).rows[0];
        if (!current || current.email !== row.recipient_email) {
            await pool.query("UPDATE signing_error_emails SET state='cancelled',lease_until=NULL WHERE id=$1 AND claim_token=$2", [row.id, row.claim_token]);
            return;
        }
        const events = (await pool.query('SELECT phase,error_code,severity,submission_id FROM signing_error_alerts WHERE batch_id=$1 ORDER BY first_seen_at,id', [row.batch_id])).rows;
        let outcome;
        try { outcome = await sendEmail({ toEmail: row.recipient_email, ...buildAlertEmail(events, { origin: site.origin, locale }), logLabel: 'SIGNING_ERROR_ALERT' }); }
        catch { outcome = { ok: false, errorCode: 'PROVIDER_OUTCOME_UNKNOWN' }; }
        const simulated = outcome?.simulated || outcome?.mode === 'qa-noop';
        const retryable = ['SMTP_NOT_CONFIGURED', 'EMAIL_DISABLED', 'NO_TRANSPORT'].includes(outcome?.errorCode);
        const state = outcome?.ok ? (simulated ? 'simulated' : 'provider_accepted') : retryable ? (row.attempts < 5 ? 'pending' : 'failed') : 'uncertain';
        await pool.query(`UPDATE signing_error_emails SET state=$3,lease_until=NULL,error_code=$4,provider_id=$5,
            accepted_at=CASE WHEN $3='provider_accepted' THEN clock_timestamp() ELSE NULL END,
            available_at=clock_timestamp()+make_interval(secs=>LEAST(3600,60*POWER(2,attempts)::integer))
            WHERE id=$1 AND claim_token=$2 AND state='dispatching'`,
        [row.id, row.claim_token, state, outcome?.ok ? null : safeCode(outcome?.errorCode), outcome?.messageId ? String(outcome.messageId).slice(0, 200) : null]);
        if (!outcome?.ok) log.error('[signing-v2] platform error email not confirmed', state, safeCode(outcome?.errorCode));
    }

    async function flush() {
        // A process may have died after SMTP accepted the mail. Never silently resend it.
        await pool.query("UPDATE signing_error_emails SET state='uncertain',error_code='PROVIDER_OUTCOME_UNKNOWN',lease_until=NULL WHERE state='dispatching' AND lease_until<clock_timestamp()");
        await prepare();
        const token = randomUUID();
        const rows = (await pool.query(`WITH selected AS (
            SELECT m.id FROM signing_error_emails m WHERE m.state='pending' AND m.available_at<=clock_timestamp()
                AND ($2::uuid[] IS NULL OR EXISTS(SELECT 1 FROM signing_error_alerts e WHERE e.batch_id=m.batch_id AND e.owner_context_id=ANY($2::uuid[])))
            ORDER BY m.available_at,m.id LIMIT 4 FOR UPDATE SKIP LOCKED
        ) UPDATE signing_error_emails m SET state='dispatching',attempts=m.attempts+1,claim_token=$1,lease_until=clock_timestamp()+interval '5 minutes'
            FROM selected WHERE m.id=selected.id RETURNING m.*`, [token, contextIds])).rows;
        await Promise.all(rows.map(deliver));
        return rows.length;
    }
    function tick() {
        if (!inFlight) inFlight = flush().catch(() => { log.error('[signing-v2] platform error email worker failed'); return 0; }).finally(() => { inFlight = null; });
        return inFlight;
    }
    return { prepare, flush, tick, start() { if (!timer) { timer = setInterval(tick, 10000); timer.unref?.(); } },
        async stop() { clearInterval(timer); timer = null; await inFlight; } };
}

module.exports = { createErrorAlerts, requestErrorReporter, buildAlertEmail };
