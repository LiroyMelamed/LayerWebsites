'use strict';
const crypto = require('node:crypto');
const { fail, courtNumber, phones, positiveId } = require('./validation');
const secrets = require('./secrets');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DEMO_UPDATES = [
    { source: 'demo-decision-1', number: '90001-10-26', title: 'החלטת דמה', body: 'זהו עדכון סינתטי לבדיקת שיוך. אין לו משמעות משפטית.', date: '2026-10-14T09:00:00Z' },
    { source: 'demo-hearing-1', number: '90002-10-26', title: 'מועד דיון לדוגמה', body: 'אירוע דמה לבדיקת קליטת עדכונים. אינו נרשם ביומן ואינו נשלח ללקוחות.', date: '2026-10-14T10:00:00Z' },
    { source: 'demo-unmatched-1', number: '90003-10-26', title: 'עדכון דמה ללא שיוך', body: 'אפשר לשייך את המספר לתיק הדגמה ולסנכרן שוב.', date: '2026-10-14T11:00:00Z' },
];

function createIntegrationService({ pool, provider, env = process.env }) {
    const office = value => { if (value !== null && !UUID.test(String(value))) fail('INVALID_OFFICE', 'משרד לא תקין'); return value; };
    const binding = c => `${c.law_firm_tenant_id || 'dedicated'}:${c.id}:whatsapp`;
    const token = c => JSON.parse(secrets.open(c.secret_ciphertext, binding(c), env)).token;
    async function tx(fn) {
        const c = await pool.connect();
        try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; }
        catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    }
    async function connection(db, tenantId, name, lock = '') {
        return (await db.query(`SELECT * FROM office_integrations WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND provider=$2 ${lock}`, [office(tenantId), name])).rows[0];
    }
    async function ensure(db, tenantId, name) {
        await db.query(`INSERT INTO office_integrations(law_firm_tenant_id,provider) VALUES($1,$2) ON CONFLICT(law_firm_tenant_id,provider) DO NOTHING`, [office(tenantId), name]);
        return connection(db, tenantId, name, 'FOR UPDATE');
    }
    function publicConnection(c) {
        if (!c) return null;
        return { id: c.id, enabled: c.enabled, status: c.status, settings: c.settings, displayPhone: c.display_phone,
            connected: Boolean(c.secret_ciphertext), tokenExpiresAt: c.token_expires_at, lastCheckedAt: c.last_checked_at, lastSyncedAt: c.last_synced_at };
    }
    function signupConfig() {
        const demoOnly = env.WHATSAPP_DEMO_ONLY === 'true';
        const ready = !demoOnly && Boolean(env.WHATSAPP_META_APP_ID && env.WHATSAPP_META_APP_SECRET && env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID && /^[a-f0-9]{64}$/i.test(env.INTEGRATIONS_ENCRYPTION_KEY || '') && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
        return { ready, appId: ready ? env.WHATSAPP_META_APP_ID : null, configId: ready ? env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID : null,
            version: env.WHATSAPP_GRAPH_VERSION || 'v25.0', liveEnabled: !demoOnly && env.WHATSAPP_LIVE_ENABLED === 'true' };
    }
    async function snapshot(tenantId) {
        office(tenantId);
        const [connections, links, updates, groups, cases] = await Promise.all([
            pool.query('SELECT * FROM office_integrations WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1', [tenantId]),
            pool.query('SELECT l.*, c.casename FROM court_case_links l JOIN cases c ON c.caseid=l.case_id WHERE l.law_firm_tenant_id IS NOT DISTINCT FROM $1 AND c.law_firm_tenant_id IS NOT DISTINCT FROM $1 ORDER BY l.court_number', [tenantId]),
            pool.query('SELECT * FROM court_updates WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 ORDER BY occurred_at DESC LIMIT 100', [tenantId]),
            pool.query('SELECT id,case_id,mode,status,subject,recipients,invite_link,error_code,created_at FROM case_whatsapp_groups WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 ORDER BY created_at DESC LIMIT 50', [tenantId]),
            pool.query('SELECT caseid,casename FROM cases WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND integration_demo=true ORDER BY caseid DESC LIMIT 100', [tenantId]),
        ]);
        return { court: publicConnection(connections.rows.find(c => c.provider === 'court_demo')), whatsapp: publicConnection(connections.rows.find(c => c.provider === 'whatsapp')),
            links: links.rows, updates: updates.rows, groups: groups.rows, demoCases: cases.rows, signup: signupConfig() };
    }
    async function saveCourt(tenantId, input) {
        if (typeof input.enabled !== 'boolean') fail('INVALID_SETTINGS', 'יש לבחור אם הסנכרון פעיל');
        const label = String(input.label || '').trim();
        if (label.length > 120) fail('INVALID_SETTINGS', 'שם החיבור ארוך מדי');
        await tx(async db => {
            const c = await ensure(db, tenantId, 'court_demo');
            await db.query(`UPDATE office_integrations SET enabled=$2,status=$3,settings=$4,updated_at=now() WHERE id=$1`, [c.id, input.enabled, input.enabled ? 'demo' : 'disconnected', { label, mode: 'demo' }]);
        });
    }
    async function seedDemo(tenantId) {
        return tx(async db => {
            const c = await ensure(db, tenantId, 'court_demo'); // serialize duplicate clicks
            if (!c.enabled) fail('COURT_DISABLED', 'יש להפעיל את חיבור הדמה תחילה', 409);
            const ids = [];
            for (const [index, number] of ['90001-10-26', '90002-10-26'].entries()) {
                const existing = (await db.query('SELECT case_id FROM court_case_links WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND court_number=$2', [tenantId, number])).rows[0];
                if (existing) { ids.push(existing.case_id); continue; }
                const row = (await db.query(`INSERT INTO cases(casename,law_firm_tenant_id,integration_demo,currentstage,isclosed,createdat,updatedat) VALUES($1,$2,true,1,false,now(),now()) RETURNING caseid`, [`תיק הדגמה ${index + 1} — נט המשפט`, tenantId])).rows[0];
                await db.query('INSERT INTO court_case_links(law_firm_tenant_id,case_id,court_number,is_primary) VALUES($1,$2,$3,true)', [tenantId, row.caseid, number]);
                ids.push(row.caseid);
            }
            return ids;
        });
    }
    async function linkCourt(tenantId, input) {
        const number = courtNumber(input.courtNumber), caseId = positiveId(input.caseId);
        return tx(async db => {
            const c = await ensure(db, tenantId, 'court_demo');
            if (!c.enabled) fail('COURT_DISABLED', 'חיבור הדמה כבוי', 409);
            const target = (await db.query('SELECT caseid FROM cases WHERE caseid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 AND integration_demo=true FOR UPDATE', [caseId, tenantId])).rows[0];
            if (!target) fail('DEMO_CASE_REQUIRED', 'בשלב זה ניתן לשייך רק לתיק הדגמה של המשרד', 404);
            const linked = await db.query(`INSERT INTO court_case_links(law_firm_tenant_id,case_id,court_number) VALUES($1,$2,$3)
                ON CONFLICT(law_firm_tenant_id,court_number) DO UPDATE SET case_id=excluded.case_id
                WHERE court_case_links.case_id=excluded.case_id RETURNING id`, [tenantId, caseId, number]);
            if (!linked.rows.length) fail('COURT_NUMBER_IN_USE', 'מספר תיק בית המשפט כבר משויך לתיק אחר במשרד', 409);
            await db.query('UPDATE court_case_links SET is_primary=true WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM court_case_links WHERE case_id=$2 AND is_primary)', [linked.rows[0].id, caseId]);
            await db.query('UPDATE court_updates SET case_id=$3 WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND court_number=$2', [tenantId, number, caseId]);
        });
    }
    async function syncCourt(tenantId) {
        return tx(async db => {
            const c = await ensure(db, tenantId, 'court_demo');
            if (!c.enabled) fail('COURT_DISABLED', 'חיבור הדמה כבוי', 409);
            for (const event of DEMO_UPDATES) await db.query(`INSERT INTO court_updates(law_firm_tenant_id,source_id,court_number,title,body,occurred_at,case_id)
                VALUES($1,$2,$3,$4,$5,$6,(SELECT l.case_id FROM court_case_links l JOIN cases c ON c.caseid=l.case_id
                    WHERE l.law_firm_tenant_id IS NOT DISTINCT FROM $1 AND c.law_firm_tenant_id IS NOT DISTINCT FROM $1 AND l.court_number=$3 AND (c.integration_demo OR $7)))
                ON CONFLICT(law_firm_tenant_id,source_id) DO NOTHING`, [tenantId, event.source, event.number, event.title, event.body, event.date, env.WHATSAPP_DEMO_ONLY === 'true']);
            await db.query('UPDATE office_integrations SET last_synced_at=now(),updated_at=now() WHERE id=$1', [c.id]);
        });
    }
    async function saveWhatsapp(tenantId, input) {
        if (typeof input.enabled !== 'boolean' || !['demo','live'].includes(input.mode)) fail('INVALID_SETTINGS', 'הגדרות החיבור אינן תקינות');
        const recipients = phones(input.recipients);
        if (input.includeCaseManager !== undefined && typeof input.includeCaseManager !== 'boolean') fail('INVALID_SETTINGS', 'יש לבחור אם להזמין את מנהל התיק');
        const includeCaseManager = input.includeCaseManager === true;
        if (includeCaseManager && recipients.length > 6) fail('GROUP_CAPACITY', 'בהזמנת מנהל התיק ניתן להגדיר עד שישה מספרים קבועים');
        if (input.enabled && !recipients.length && !includeCaseManager) fail('RECIPIENT_REQUIRED', 'יש להוסיף מספר להזמנה או לבחור בהזמנת מנהל התיק');
        const templateName = String(input.templateName || ''), templateLanguage = String(input.templateLanguage || 'he');
        const templateParameters = input.templateParameters || [];
        if (!/^[a-z0-9_]{0,100}$/.test(templateName) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(templateLanguage) || !Array.isArray(templateParameters) || templateParameters.length > 10 || templateParameters.some(p => typeof p !== 'string' || p.length > 500)) fail('INVALID_TEMPLATE', 'פרטי התבנית אינם תקינים');
        return tx(async db => {
            const c = await ensure(db, tenantId, 'whatsapp');
            if (input.enabled && input.mode === 'live') {
                if (!signupConfig().liveEnabled || !c.secret_ciphertext || c.status !== 'ready' || !templateName || (c.token_expires_at && new Date(c.token_expires_at) <= new Date())) fail('WHATSAPP_NOT_READY', 'יש לחבר מספר, לאמת זכאות לקבוצות ולאשר תבנית הזמנה לפני הפעלה', 409);
                if (c.settings.templateName !== templateName || c.settings.templateLanguage !== templateLanguage || JSON.stringify(c.settings.templateParameters || []) !== JSON.stringify(templateParameters)) fail('TEMPLATE_CHECK_REQUIRED', 'יש לשמור את התבנית כשהאפשרות כבויה ולבדוק מוכנות לפני הפעלה', 409);
            }
            const changed = c.settings.templateName !== templateName || c.settings.templateLanguage !== templateLanguage || JSON.stringify(c.settings.templateParameters || []) !== JSON.stringify(templateParameters);
            await db.query(`UPDATE office_integrations SET enabled=$2,settings=$3,status=$4,updated_at=now() WHERE id=$1`, [c.id, input.enabled, { mode: input.mode, recipients, includeCaseManager, templateName, templateLanguage, templateParameters }, changed && c.secret_ciphertext ? 'connected' : c.status]);
            if (!input.enabled || c.settings.mode !== input.mode) await cancelPending(db, c.id);
        });
    }
    async function cancelPending(db, connectionId) {
        // Keep unresolved group creation observable so a late webhook can still link
        // the group. Cancel unsent invitations permanently, including after re-enable.
        await db.query(`UPDATE case_whatsapp_groups SET
            status=CASE WHEN status IN ('queued','created') THEN 'cancelled' ELSE status END,
            recipients=(SELECT COALESCE(jsonb_agg(CASE WHEN r->>'status'='pending' THEN r || '{"status":"cancelled"}'::jsonb WHEN r->>'status'='sending' THEN r || '{"status":"uncertain"}'::jsonb ELSE r END),'[]'::jsonb) FROM jsonb_array_elements(recipients) r),
            updated_at=now() WHERE connection_id=$1 AND status IN ('queued','creating','awaiting_webhook','created','uncertain')`, [connectionId]);
    }
    async function startSignup(tenantId, userId) {
        if (!signupConfig().ready) fail('META_SETUP_REQUIRED', 'חיבור Meta טרם הוגדר על ידי מנהל הפלטפורמה', 503);
        const state = crypto.randomBytes(32).toString('base64url');
        await pool.query(`INSERT INTO integration_signup_sessions(law_firm_tenant_id,user_id,state_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')`, [office(tenantId), positiveId(userId), crypto.createHash('sha256').update(state).digest('hex')]);
        return { ...signupConfig(), state };
    }
    async function completeSignup(tenantId, userId, input) {
        if (!signupConfig().ready) fail('META_SETUP_REQUIRED', 'חיבור Meta טרם הוגדר', 503);
        if (!/^[A-Za-z0-9_-]{43}$/.test(String(input.state))) fail('INVALID_SIGNUP_STATE', 'יש להתחיל מחדש את החיבור', 403);
        const session = await pool.query(`UPDATE integration_signup_sessions SET consumed_at=now() WHERE state_hash=$1 AND user_id=$2 AND law_firm_tenant_id IS NOT DISTINCT FROM $3 AND expires_at>now() AND consumed_at IS NULL RETURNING id`, [crypto.createHash('sha256').update(input.state).digest('hex'), userId, office(tenantId)]);
        if (!session.rowCount) fail('INVALID_SIGNUP_STATE', 'החיבור פג או כבר נוצל. יש להתחיל שוב', 403);
        const result = await provider.completeSignup(input);
        await tx(async db => {
            const c = await ensure(db, tenantId, 'whatsapp');
            // Disconnect deletes outstanding sessions, even if Meta's response is
            // already on its way. Never restore a revoked connection afterwards.
            const active = await db.query('SELECT id FROM integration_signup_sessions WHERE id=$1 FOR UPDATE', [session.rows[0].id]);
            if (!active.rowCount) fail('INVALID_SIGNUP_STATE', 'החיבור בוטל. יש להתחיל שוב', 403);
            if (c.phone_number_id && c.phone_number_id !== result.phoneId) fail('DISCONNECT_FIRST', 'יש לנתק את המספר הקודם לפני החלפתו', 409);
            const encrypted = secrets.seal(JSON.stringify({ token: result.token, pin: result.pin }), binding(c), env);
            try {
                await db.query(`UPDATE office_integrations SET secret_ciphertext=$2,phone_number_id=$3,waba_id=$4,display_phone=$5,token_expires_at=$6,status=$7,enabled=false,last_checked_at=now(),updated_at=now() WHERE id=$1`, [c.id, encrypted, result.phoneId, result.wabaId, result.displayPhone, result.expiresAt, result.eligible ? 'connected' : 'oba_required']);
            } catch (e) { if (e.code === '23505') fail('PHONE_ALREADY_CONNECTED', 'המספר כבר מחובר למשרד אחר', 409); throw e; }
        });
    }
    async function checkWhatsapp(tenantId) {
        const c = await connection(pool, tenantId, 'whatsapp');
        if (!c?.secret_ciphertext) fail('WHATSAPP_DISCONNECTED', 'יש לחבר WhatsApp תחילה', 409);
        try {
            const ready = await provider.readiness(c, token(c));
            const status = !ready.eligible ? 'oba_required' : !ready.templateReady ? 'template_required' : 'ready';
            await pool.query(`UPDATE office_integrations SET status=$2,enabled=CASE WHEN $2='ready' THEN enabled ELSE false END,last_checked_at=now(),updated_at=now() WHERE id=$1 AND secret_ciphertext=$3 AND settings=$4`, [c.id, status, c.secret_ciphertext, c.settings]);
            return { status };
        } catch {
            await pool.query(`UPDATE office_integrations SET status='reauthorization_required',enabled=false,last_checked_at=now() WHERE id=$1 AND secret_ciphertext=$2`, [c.id, c.secret_ciphertext]);
            fail('META_CHECK_FAILED', 'לא ניתן לאמת את החיבור כרגע. יש לבדוק את ההרשאה ולנסות שוב', 502);
        }
    }
    async function disconnectWhatsapp(tenantId) {
        await tx(async db => {
            const c = await ensure(db, tenantId, 'whatsapp');
            await db.query(`UPDATE office_integrations SET enabled=false,status='disconnected',secret_ciphertext=NULL,phone_number_id=NULL,waba_id=NULL,display_phone=NULL,token_expires_at=NULL,updated_at=now() WHERE id=$1`, [c.id]);
            await cancelPending(db, c.id);
            await db.query('DELETE FROM integration_signup_sessions WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1', [tenantId]);
        });
    }
    async function enqueueCase(db, caseId, tenantId, forceDemo = false) {
        const c = await connection(db, tenantId, 'whatsapp', 'FOR SHARE');
        if (!c?.enabled) { if (forceDemo) fail('WHATSAPP_DISABLED', 'יש להפעיל את יצירת קבוצות הדמה תחילה', 409); return null; }
        const record = (await db.query(`SELECT c.caseid,c.casename,c.integration_demo,c.whatsappgrouplink,m.phonenumber AS manager_phone
            FROM cases c LEFT JOIN users m ON m.userid=c.casemanagerid AND m.law_firm_tenant_id IS NOT DISTINCT FROM c.law_firm_tenant_id
            WHERE c.caseid=$1 AND c.law_firm_tenant_id IS NOT DISTINCT FROM $2`, [caseId, tenantId])).rows[0];
        if (!record || record.whatsappgrouplink) return null;
        const mode = c.settings.mode;
        if (forceDemo && (!record.integration_demo || mode !== 'demo')) fail('DEMO_REQUIRED', 'בדיקת קבוצה זמינה רק במצב דמה ובתיק הדגמה', 409);
        if (mode === 'live' && (record.integration_demo || !signupConfig().liveEnabled || c.status !== 'ready')) return null;
        if (!['demo','live'].includes(mode)) return null;
        const recipients = phones(c.settings.recipients || []);
        let errorCode = null;
        if (c.settings.includeCaseManager) {
            // Demonstration cases have no real staff; this synthetic recipient is
            // confined to demo cases and can never reach live dispatch.
            const raw = record.integration_demo && mode === 'demo' ? '+972500000009' : record.manager_phone;
            if (!raw) errorCode = 'MANAGER_PHONE_MISSING';
            else {
                try { const [managerPhone] = phones([raw]); if (!recipients.includes(managerPhone)) recipients.push(managerPhone); }
                catch { errorCode = 'MANAGER_PHONE_INVALID'; }
            }
        }
        if (recipients.length > 7) errorCode = 'GROUP_CAPACITY';
        if (!recipients.length && !errorCode) return null;
        const jobId = crypto.randomUUID(), subject = `תיק ${caseId} · ${jobId.slice(0, 8)}`;
        return (await db.query(`INSERT INTO case_whatsapp_groups(id,law_firm_tenant_id,case_id,connection_id,mode,subject,recipients,template_name,template_language,phone_number_id,waba_id,template_parameters,status,error_code)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(case_id) DO NOTHING RETURNING id`, [jobId, tenantId, caseId, c.id, mode, subject, JSON.stringify(recipients.map(phone => ({ phone, status: 'pending' }))), c.settings.templateName, c.settings.templateLanguage, c.phone_number_id, c.waba_id, JSON.stringify(c.settings.templateParameters || []), errorCode ? 'needs_attention' : 'queued', errorCode])).rows[0]?.id || null;
    }
    async function previewGroup(tenantId, caseId) {
        return tx(db => enqueueCase(db, positiveId(caseId), tenantId, true));
    }
    return { snapshot, saveCourt, seedDemo, linkCourt, syncCourt, saveWhatsapp, startSignup, completeSignup, checkWhatsapp, disconnectWhatsapp, enqueueCase, previewGroup,
        tx, connection, token, binding, signupConfig, pool, env, provider };
}
module.exports = { createIntegrationService, DEMO_UPDATES };
