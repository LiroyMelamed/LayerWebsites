const { randomUUID, randomInt, randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const { digest, bytesHash } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const limits = require('../../lib/signingV2/limits');
const { UUID } = require('../../lib/signingV2/compiler');
const { signatureImage, IMAGE_TYPES } = require('../../lib/signingV2/stamp');
const { transaction } = require('./transaction');
const { loadPublicGrant } = require('./grants');
const { assertCurrentAuthorities } = require('./authorities');
const { job, enqueue } = require('./jobs');
const { personalEvidenceInput, evidenceJobInput } = require('../../lib/signingV2/personalEvidence');

const CONSENT_VERSION = 'signing-v2-consent-2026-10-07';
const OTP = Object.freeze({ ttlSeconds: 600, cooldownSeconds: 30, perSession: 5, perPersonHour: 10, attempts: 5 });
const LOCALES = new Set(['he', 'ar', 'en']);
const TEXT_MAX = 500;

const maskEmail = email => {
    const [name, domain] = String(email).split('@');
    return `${name.slice(0, 1)}•••@${domain}`;
};
const maskPhone = phone => `•••${String(phone).slice(-4)}`;

function channelsOf(endpoints) {
    const channels = [];
    if (endpoints?.phone) channels.push({ channel: 'sms', hint: maskPhone(endpoints.phone) });
    if (endpoints?.email) channels.push({ channel: 'email', hint: maskEmail(endpoints.email) });
    return channels;
}

const visibleField = field => ({ id: field.id, type: field.type, pageNum: field.pageNum, x: field.x, y: field.y,
    width: field.width, height: field.height, required: field.required !== false, ...(field.label ? { label: field.label } : {}) });

function signingDate(now) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
}

function createPublicSigningService({ pool, storage, otpKey, otpTransport = null }) {
    expect(Buffer.isBuffer(otpKey) && otpKey.length >= 32, 'GRANT_KEY_REQUIRED');
    const codeHash = (salt, session, code) => createHmac('sha256', otpKey)
        .update(`signing-v2-otp|${salt}|${session.id}|${session.manifest_hash}|${code}`).digest('hex');

    async function describe(token) {
        const grant = await loadPublicGrant(pool, token, { purpose: ['sign', 'download'] });
        const rows = (await pool.query(`SELECT d.id AS document_id,d.name,d.state AS document_state,d.document_key,d.field_bindings,
                d.final_artifact_id,r.id AS revision_id,r.package_id,r.workflow_state,r.snapshot->>'locale' AS locale,r.deadline,
                pk.external_key,s.name AS run_name,owner.name AS owner_name,person.name AS person_name,
                p.capacity,p.identity_snapshot->>'partyName' AS represented_name,pa.metadata->'pages' AS pages,t.id AS task_id,t.state AS task_state,t.stage,t.required,t.field_ids,t.version AS task_version,
                (SELECT jsonb_build_object('kind',i.kind,'reason',i.reason,'state',i.state,'resolution',i.resolution)
                    FROM signing_task_issues i WHERE i.owner_context_id=t.owner_context_id AND i.task_id=t.id
                    ORDER BY i.created_at DESC,i.id DESC LIMIT 1) AS issue,
                (SELECT COALESCE(jsonb_agg(op.identity_snapshot->>'name' ORDER BY op.role_key,op.occurrence),'[]') FROM signing_participations op
                    WHERE op.owner_context_id=r.owner_context_id AND op.revision_id=r.id AND op.person_id<>i.person_id) AS others
            FROM signing_grant_items i
            JOIN signing_documents d ON d.owner_context_id=i.owner_context_id AND d.id=i.document_id
            JOIN signing_package_revisions r ON r.owner_context_id=d.owner_context_id AND r.id=d.revision_id
            JOIN signing_packages pk ON pk.owner_context_id=r.owner_context_id AND pk.id=r.package_id
            LEFT JOIN signing_submissions s ON s.owner_context_id=pk.owner_context_id AND s.id=pk.submission_id
            JOIN users owner ON owner.userid=pk.owner_userid
            JOIN signing_people person ON person.owner_context_id=i.owner_context_id AND person.id=i.person_id
            LEFT JOIN signing_artifacts pa ON pa.owner_context_id=d.owner_context_id AND pa.id=d.prepared_artifact_id
            LEFT JOIN signing_participations p ON p.owner_context_id=d.owner_context_id AND p.revision_id=d.revision_id AND p.person_id=i.person_id
            LEFT JOIN signing_tasks t ON t.owner_context_id=d.owner_context_id AND t.document_id=d.id AND t.participation_id=p.id
                AND ($4::uuid[] IS NULL OR t.id=ANY($4::uuid[]))
            WHERE i.owner_context_id=$1 AND i.grant_id=$2 AND i.document_id=ANY($3::uuid[])
            ORDER BY pk.created_at,length(pk.external_key),pk.external_key,pk.id,d.document_key,t.stage,t.id`,
        [grant.owner_context_id, grant.id, grant.items.map(item => item.document_id),grant.allowed_task_ids])).rows;
        const profile = (await pool.query(`SELECT policy_snapshot->>'locale' AS locale FROM signing_delivery_profiles
            WHERE owner_context_id=$1 AND id=$2`, [grant.owner_context_id, grant.items[0].delivery_profile_id])).rows[0];
        const packages = new Map(), counts = { ready: 0, accepted: 0, waiting: 0 };
        for (const row of rows) {
            if (!packages.has(row.package_id)) {
                packages.set(row.package_id, { packageId: row.package_id, runName: row.run_name, ownerName: row.owner_name,
                    reference: row.external_key, otherParticipants: row.others, state: row.workflow_state,
                    locale: row.locale, deadline: row.deadline, documents: new Map(), evidence: row.workflow_state === 'complete' });
            }
            const item = packages.get(row.package_id);
            if (!item.documents.has(row.document_id)) {
                item.documents.set(row.document_id, { documentId: row.document_id, name: row.name, pages: row.pages || [],
                    final: Boolean(row.final_artifact_id), tasks: [] });
            }
            if (!row.task_id || grant.purpose === 'download') continue;
            const state = row.task_state === 'blocked' ? 'waiting' : row.task_state;
            if (state in counts) counts[state] += 1;
            const ids = new Set(row.field_ids);
            item.documents.get(row.document_id).tasks.push({ taskId: row.task_id, state, required: row.required, version: row.task_version, issue: row.issue,
                ...(row.capacity === 'representative' ? {capacity:row.capacity,partyName:row.represented_name} : {}),
                fields: row.field_bindings.filter(field => ids.has(field.id)).map(visibleField) });
        }
        return {
            readOnly: grant.purpose === 'download',
            person: { name: rows[0]?.person_name || '' },
            locale: LOCALES.has(profile?.locale) ? profile.locale : 'he',
            consentVersion: CONSENT_VERSION, expiresAt: grant.expires_at, counts, maxTasksPerSession: limits.manifestTasks,
            packages: [...packages.values()].map(item => ({ ...item, documents: [...item.documents.values()] })),
        };
    }

    async function readArtifact(contextId, artifactId) {
        const artifact = (await pool.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2 AND state='ready'`,
            [contextId, artifactId])).rows[0];
        if (!artifact) fail('ARTIFACT_NOT_READY', 409);
        const bytes = await storage.read(artifact.object_key, Number(artifact.bytes));
        expect(bytesHash(bytes) === artifact.content_sha256, 'ARTIFACT_HASH_MISMATCH');
        return { bytes, contentHash: artifact.content_sha256, kind: artifact.kind };
    }

    // The newest version this person may see: the final PDF, else the stage they sign on, else the prepared one.
    async function documentPdf(token, documentId) {
        const grant = await loadPublicGrant(pool, token, { purpose: ['sign', 'download'] });
        if (!UUID.test(String(documentId)) || !grant.items.some(item => item.document_id === documentId)) fail('NOT_FOUND', 404);
        const row = (await pool.query(`SELECT d.name,d.final_artifact_id,d.prepared_artifact_id,(SELECT t.stage_artifact_id FROM signing_tasks t
                JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
                WHERE t.owner_context_id=d.owner_context_id AND t.document_id=d.id AND p.person_id=$3 AND t.stage_artifact_id IS NOT NULL
                ORDER BY t.stage DESC LIMIT 1) AS task_artifact_id
            FROM signing_documents d WHERE d.owner_context_id=$1 AND d.id=$2`, [grant.owner_context_id, documentId, grant.person_id])).rows[0];
        const artifactId = grant.purpose === 'download' ? row.final_artifact_id : row.final_artifact_id || row.task_artifact_id || row.prepared_artifact_id;
        if (!artifactId) fail('ARTIFACT_NOT_READY', 409);
        return { ...(await readArtifact(grant.owner_context_id, artifactId)), name: row.name, final: Boolean(row.final_artifact_id) };
    }

    async function evidencePdf(token, packageId) {
        const grant = await loadPublicGrant(pool, token, { purpose: ['sign', 'download'] });
        const revision = (await pool.query(`SELECT r.id,r.revision_hash FROM signing_package_revisions r
            JOIN signing_packages pk ON pk.owner_context_id=r.owner_context_id AND pk.id=r.package_id AND pk.active_revision_id=r.id
            WHERE r.owner_context_id=$1 AND pk.id=$2 AND r.workflow_state='complete' AND r.id=ANY($3::uuid[])`,
        [grant.owner_context_id, UUID.test(String(packageId)) ? packageId : null, grant.items.map(item => item.revision_id)])).rows[0];
        if (!revision) fail('NOT_FOUND', 404);
        const artifact = (await pool.query(`SELECT id,metadata FROM signing_artifacts
            WHERE owner_context_id=$1 AND kind='evidence' AND inputs_hash=$2 AND state='ready'`,
        [grant.owner_context_id, personalEvidenceInput(revision.id, revision.revision_hash, grant.person_id)])).rows[0];
        if (!artifact) {
            // Older completed packages retain their immutable office certificate.
            // A scoped request queues one idempotent receipt-generation job, never
            // falls back to the full certificate and never sends a notification.
            const signed = await pool.query(`SELECT 1 FROM signing_actions a
                JOIN signing_participations p ON p.owner_context_id=a.owner_context_id AND p.id=a.participation_id
                WHERE a.owner_context_id=$1 AND p.revision_id=$2 AND p.person_id=$3 LIMIT 1`,
            [grant.owner_context_id, revision.id, grant.person_id]);
            if (!signed.rowCount) fail('NOT_FOUND', 404);
            await enqueue(pool, grant.owner_context_id, [job('render_evidence', revision.id, evidenceJobInput(revision.revision_hash))]);
            fail('ARTIFACT_NOT_READY', 409);
        }
        const allowedDocuments = new Set(grant.items.filter(item => item.revision_id === revision.id).map(item => item.document_id));
        if (artifact.metadata?.visibility !== 'personal' || artifact.metadata.personId !== grant.person_id
            || !Array.isArray(artifact.metadata.documentIds) || !artifact.metadata.documentIds.length
            || artifact.metadata.documentIds.some(id => !allowedDocuments.has(id))) fail('NOT_FOUND', 404);
        return readArtifact(grant.owner_context_id, artifact.id);
    }

    async function createSession(token, input = {}, meta = {}) {
        const grant = await loadPublicGrant(pool, token);
        const taskIds = input.taskIds;
        expect(Array.isArray(taskIds) && taskIds.length > 0 && taskIds.length <= limits.manifestTasks
            && taskIds.every(id => UUID.test(String(id))) && new Set(taskIds).size === taskIds.length, 'INVALID_SELECTION');
        if (grant.allowed_task_ids && taskIds.some(id => !grant.allowed_task_ids.includes(id))) fail('TASK_UNAVAILABLE', 404);
        if (input.consentVersion !== CONSENT_VERSION) fail('CONSENT_CHANGED', 409);
        const locale = LOCALES.has(input.locale) ? input.locale : 'he';
        return transaction(pool,async db=>{
        // Serialize new consent with contact correction and acceptance, in package order.
        await db.query(`SELECT p.id FROM signing_packages p JOIN signing_package_revisions r
            ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
            WHERE p.owner_context_id=$1 AND r.id=ANY($2::uuid[]) AND EXISTS(SELECT 1 FROM signing_tasks t
                WHERE t.owner_context_id=p.owner_context_id AND t.revision_id=r.id AND t.id=ANY($3::uuid[])) ORDER BY p.id FOR SHARE OF p`,
        [grant.owner_context_id,[...new Set(grant.items.map(item=>item.revision_id))],taskIds]);
        const currentGrant=await loadPublicGrant(db,token);
        const tasks = (await db.query(`SELECT t.id,t.revision_id,t.document_id,t.participation_id,t.stage,t.state,t.field_ids,
                t.stage_artifact_id,t.version,a.content_sha256 AS stage_hash,r.revision_hash
            FROM signing_tasks t
            JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id AND p.person_id=$3
            JOIN signing_package_revisions r ON r.owner_context_id=t.owner_context_id AND r.id=t.revision_id
            JOIN signing_packages pk ON pk.owner_context_id=r.owner_context_id AND pk.id=r.package_id AND pk.active_revision_id=r.id
            LEFT JOIN signing_artifacts a ON a.owner_context_id=t.owner_context_id AND a.id=t.stage_artifact_id AND a.state='ready'
            WHERE t.owner_context_id=$1 AND t.id=ANY($2::uuid[]) AND t.document_id=ANY($4::uuid[])`,
        [grant.owner_context_id, taskIds, grant.person_id, currentGrant.items.map(item => item.document_id)])).rows;
        if (tasks.length !== taskIds.length) fail('TASK_UNAVAILABLE', 404);
        for (const task of tasks) {
            if (task.state === 'accepted') fail('ALREADY_ACCEPTED', 409);
            if (task.state !== 'ready' || !task.stage_hash) fail('NOT_YOUR_TURN', 409);
        }
        const items = tasks.map(task => ({ taskId: task.id, revisionId: task.revision_id, revisionHash: task.revision_hash,
            documentId: task.document_id, participationId: task.participation_id, stage: task.stage, stageArtifactId: task.stage_artifact_id,
            stageHash: task.stage_hash, fieldIds: task.field_ids, taskVersion: task.version }))
            .sort((a, b) => (a.taskId < b.taskId ? -1 : 1));
        const manifest = { grantId: grant.id, personId: grant.person_id, consentVersion: CONSENT_VERSION, locale, items };
        const consent = { version: CONSENT_VERSION, locale, ip: meta.ip ? String(meta.ip).slice(0, 64) : null,
            userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 300) : null };
        const session = (await db.query(`INSERT INTO signing_sessions_v2(id,owner_context_id,person_id,grant_id,exact_manifest,manifest_hash,consent_snapshot,expires_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,LEAST(clock_timestamp()+make_interval(secs=>$8),$9::timestamptz)) RETURNING id,manifest_hash,expires_at`,
        [randomUUID(), grant.owner_context_id, grant.person_id, grant.id, manifest, digest(manifest), consent, limits.sessionSeconds, grant.expires_at])).rows[0];
        return { sessionId: session.id, manifestHash: session.manifest_hash, expiresAt: session.expires_at,
            taskCount: items.length, channels: channelsOf(await currentEndpoints(db, currentGrant, items[0].revisionId)) };
        });
    }

    async function lockSession(db, grant, sessionId, token) {
        if (!UUID.test(String(sessionId))) fail('SESSION_EXPIRED', 404);
        const session = (await db.query(`SELECT *,expires_at > clock_timestamp() AS live FROM signing_sessions_v2
            WHERE owner_context_id=$1 AND id=$2 AND grant_id=$3 AND person_id=$4 FOR UPDATE`,
        [grant.owner_context_id, sessionId, grant.id, grant.person_id])).rows[0];
        if (!session) fail('SESSION_EXPIRED', 404);
        if (session.revoked_at) fail('SESSION_CLOSED', 409);
        if (!session.live) fail('SESSION_EXPIRED', 410);
        const currentGrant=await loadPublicGrant(db,token);
        if (session.exact_manifest.items.some(item=>!currentGrant.items.some(allowed=>allowed.document_id===item.documentId))) fail('SESSION_CLOSED',409);
        return session;
    }

    async function challenge(token, sessionId, input = {}) {
        if (!otpTransport) fail('OTP_TRANSPORT_UNAVAILABLE', 503);
        const grant = await loadPublicGrant(pool, token);
        const planned = await transaction(pool, async db => {
            const session = await lockSession(db, grant, sessionId, token);
            if (session.verified_at) fail('ALREADY_VERIFIED', 409);
            const recent = (await db.query(`SELECT count(*)::integer AS total,
                    count(*) FILTER (WHERE created_at > clock_timestamp()-make_interval(secs=>$3))::integer AS cooling,
                    ceil(extract(epoch FROM max(created_at)+make_interval(secs=>$3)-clock_timestamp()))::integer AS wait
                FROM signing_otp_challenges_v2 WHERE owner_context_id=$1 AND session_id=$2`, [grant.owner_context_id, session.id, OTP.cooldownSeconds])).rows[0];
            if (recent.cooling) fail('OTP_COOLDOWN', 429, [{ path: 'retryAfterSeconds', code: String(Math.max(1, recent.wait)) }]);
            if (recent.total >= OTP.perSession) fail('OTP_LIMIT', 429);
            const hourly = (await db.query(`SELECT count(*)::integer AS total FROM signing_otp_challenges_v2
                WHERE owner_context_id=$1 AND person_id=$2 AND created_at > clock_timestamp()-interval '1 hour'`, [grant.owner_context_id, grant.person_id])).rows[0];
            if (hourly.total >= OTP.perPersonHour) fail('OTP_LIMIT', 429);
            const endpoints = await currentEndpoints(db, grant, session.exact_manifest.items[0].revisionId);
            const options = channelsOf(endpoints);
            const choice = options.find(item => item.channel === input.channel) || (input.channel ? null : options[0]);
            if (!choice) fail('OTP_CHANNEL_UNAVAILABLE', 422);
            const code = String(randomInt(0, 1000000)).padStart(6, '0');
            const salt = randomBytes(16).toString('hex');
            await db.query(`UPDATE signing_otp_challenges_v2 SET state='superseded' WHERE owner_context_id=$1 AND session_id=$2
                AND state IN ('pending','sent','uncertain')`, [grant.owner_context_id, session.id]);
            const row = (await db.query(`INSERT INTO signing_otp_challenges_v2(owner_context_id,session_id,person_id,manifest_hash,channel,endpoint_hint,
                    code_salt,code_hash,max_attempts,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()+make_interval(secs=>$10))
                RETURNING id,expires_at`, [grant.owner_context_id, session.id, grant.person_id, session.manifest_hash, choice.channel, choice.hint,
                salt, codeHash(salt, session, code), OTP.attempts, OTP.ttlSeconds])).rows[0];
            const person = (await db.query('SELECT name FROM signing_people WHERE owner_context_id=$1 AND id=$2', [grant.owner_context_id, grant.person_id])).rows[0];
            return { id: row.id, expiresAt: row.expires_at, channel: choice.channel, hint: choice.hint, code, locale: session.exact_manifest.locale,
                endpoint: choice.channel === 'sms' ? endpoints.phone : endpoints.email, name: person?.name || '' };
        });
        // The code leaves only after the challenge is durable, and never inside the transaction.
        let state = 'sent';
        try {
            await otpTransport.send({ channel: planned.channel, endpoint: planned.endpoint, code: planned.code, locale: planned.locale,
                ttlMinutes: OTP.ttlSeconds / 60, challengeId: String(planned.id), name: planned.name });
        } catch (error) {
            state = error?.definitive ? 'failed' : 'uncertain';
        }
        await pool.query(`UPDATE signing_otp_challenges_v2 SET state=$3,sent_at=CASE WHEN $3='sent' THEN clock_timestamp() ELSE sent_at END
            WHERE owner_context_id=$1 AND id=$2 AND state='pending'`, [grant.owner_context_id, planned.id, state]);
        if (state === 'failed') fail('OTP_DELIVERY_FAILED', 502);
        return { channel: planned.channel, hint: planned.hint, expiresAt: planned.expiresAt, cooldownSeconds: OTP.cooldownSeconds,
            delivery: state };
    }

    async function verify(token, sessionId, input = {}) {
        const grant = await loadPublicGrant(pool, token);
        const code = String(input.code ?? '');
        expect(/^\d{6}$/.test(code), 'OTP_INVALID');
        const outcome = await transaction(pool, async db => {
            const session = await lockSession(db, grant, sessionId, token);
            if (session.verified_at) return { verified: true };
            const current = (await db.query(`SELECT *,expires_at > clock_timestamp() AS live FROM signing_otp_challenges_v2
                WHERE owner_context_id=$1 AND session_id=$2 AND state IN ('pending','sent','uncertain')
                ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [grant.owner_context_id, session.id])).rows[0];
            if (!current) fail('OTP_REQUIRED', 409);
            if (!current.live) fail('OTP_EXPIRED', 410);
            expect(current.manifest_hash === session.manifest_hash, 'MANIFEST_CHANGED');
            const expected = Buffer.from(current.code_hash, 'hex');
            const presented = Buffer.from(codeHash(current.code_salt, session, code), 'hex');
            if (!timingSafeEqual(expected, presented)) {
                const attempts = current.attempts + 1;
                await db.query(`UPDATE signing_otp_challenges_v2 SET attempts=$3,state=CASE WHEN $3 >= max_attempts THEN 'exhausted' ELSE state END
                    WHERE owner_context_id=$1 AND id=$2`, [grant.owner_context_id, current.id, attempts]);
                return { verified: false, remaining: Math.max(0, current.max_attempts - attempts) };
            }
            await db.query(`UPDATE signing_otp_challenges_v2 SET state='verified',verified_at=clock_timestamp(),attempts=attempts+1
                WHERE owner_context_id=$1 AND id=$2`, [grant.owner_context_id, current.id]);
            await db.query(`UPDATE signing_sessions_v2 SET verified_challenge_id=$3,verified_at=clock_timestamp()
                WHERE owner_context_id=$1 AND id=$2`, [grant.owner_context_id, session.id, current.id]);
            return { verified: true };
        });
        // The failed attempt is committed before the error is returned.
        if (!outcome.verified) {
            if (outcome.remaining === 0) fail('OTP_ATTEMPTS_EXCEEDED', 429);
            fail('OTP_INVALID', 422, [{ path: 'remainingAttempts', code: String(outcome.remaining) }]);
        }
        return { verified: true };
    }

    function normalizeValues(items, documents, input) {
        let needsSignature = false;
        const values = {};
        for (const item of items) {
            const bindings = new Map(documents.get(item.documentId).field_bindings.map(field => [field.id, field]));
            const given = input?.[item.taskId] || {};
            expect(given && typeof given === 'object' && Object.keys(given).every(id => item.fieldIds.includes(id)), 'INVALID_VALUES', item.taskId);
            values[item.taskId] = {};
            for (const id of item.fieldIds) {
                const field = bindings.get(id);
                const required = field.required !== false;
                if (IMAGE_TYPES.has(field.type)) { needsSignature = true; continue; }
                if (field.type === 'date') continue;
                if (field.type === 'checkbox') {
                    const value = given[id] === true;
                    expect(given[id] === undefined || typeof given[id] === 'boolean', 'INVALID_VALUES', `${item.taskId}.${id}`);
                    if (required) expect(value, 'FIELD_REQUIRED', `${item.taskId}.${id}`);
                    values[item.taskId][id] = value;
                    continue;
                }
                const value = typeof given[id] === 'string' ? given[id].normalize('NFC').trim() : '';
                expect(given[id] === undefined || typeof given[id] === 'string', 'INVALID_VALUES', `${item.taskId}.${id}`);
                expect(value.length <= TEXT_MAX && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value), 'INVALID_VALUES', `${item.taskId}.${id}`);
                if (required) expect(value.length > 0, 'FIELD_REQUIRED', `${item.taskId}.${id}`);
                values[item.taskId][id] = value;
            }
        }
        return { values, needsSignature };
    }

    async function accept(token, sessionId, input = {}) {
        const grant = await loadPublicGrant(pool, token);
        expect(UUID.test(String(input.idempotencyKey)), 'IDEMPOTENCY_KEY_REQUIRED');
        expect(input.consent === true, 'CONSENT_REQUIRED');
        if (!UUID.test(String(sessionId))) fail('SESSION_EXPIRED', 404);
        const actorKey = `grant:${grant.id}`;
        const session = (await pool.query(`SELECT * FROM signing_sessions_v2 WHERE owner_context_id=$1 AND id=$2 AND grant_id=$3 AND person_id=$4`,
            [grant.owner_context_id, sessionId, grant.id, grant.person_id])).rows[0];
        if (!session) fail('SESSION_EXPIRED', 404);
        const items = session.exact_manifest.items;
        const documents = new Map((await pool.query(`SELECT id,field_bindings FROM signing_documents WHERE owner_context_id=$1 AND id=ANY($2::uuid[])`,
            [grant.owner_context_id, [...new Set(items.map(item => item.documentId))]])).rows.map(row => [row.id, row]));
        const { values, needsSignature } = normalizeValues(items, documents, input.values);
        let signature = null;
        if (needsSignature) {
            const raw = typeof input.signature === 'string' ? input.signature.replace(/^data:image\/png;base64,/, '') : '';
            expect(raw.length > 0 && raw.length <= 420000 && /^[A-Za-z0-9+/]+={0,2}$/.test(raw), 'SIGNATURE_REQUIRED');
            const bytes = Buffer.from(raw, 'base64');
            signature = { bytes, ...signatureImage(bytes), hash: bytesHash(bytes) };
        }
        const requestHash = digest({ sessionId, values, signatureHash: signature?.hash || null, consent: true });
        const previous = (await pool.query(`SELECT * FROM signing_operations WHERE owner_context_id=$1 AND actor_key=$2 AND kind='public_accept' AND idempotency_key=$3`,
            [grant.owner_context_id, actorKey, input.idempotencyKey])).rows[0];
        if (previous) {
            if (previous.request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 409);
            if (previous.state === 'complete') return { ...previous.result, reused: true };
        }
        if (!session.verified_at) fail('OTP_REQUIRED', 403);
        let upload = null;
        if (signature) {
            const id = randomUUID();
            upload = { id, key: `signing-v2/${grant.owner_context_id}/signature/${id}.png` };
            // A failed transaction leaves an unreferenced object; it is never linked to an action.
            await storage.write(upload.key, signature.bytes, { contentType: 'image/png', sha256: signature.hash });
            await storage.verify(upload.key, signature.bytes.length, signature.hash);
        }
        return transaction(pool, async db => {
            const operation = (await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state)
                VALUES($1,$2,$3,'public_accept',$4,$5,'running') ON CONFLICT (owner_context_id,actor_key,kind,idempotency_key) DO NOTHING RETURNING id`,
            [randomUUID(), grant.owner_context_id, actorKey, input.idempotencyKey, requestHash])).rows[0];
            if (!operation) {
                const existing = (await db.query(`SELECT * FROM signing_operations WHERE owner_context_id=$1 AND actor_key=$2 AND kind='public_accept' AND idempotency_key=$3`,
                    [grant.owner_context_id, actorKey, input.idempotencyKey])).rows[0];
                if (existing.request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 409);
                return { ...existing.result, reused: true };
            }
            // Lock order: packages and revisions by package id, then tasks, then the session and its grant.
            const revisionIds = [...new Set(items.map(item => item.revisionId))];
            const revisions = (await db.query(`SELECT r.id,r.revision_hash,r.workflow_state,r.package_id,p.active_revision_id,
                    r.deadline IS NULL OR r.deadline > clock_timestamp() AS before_deadline
                FROM signing_package_revisions r JOIN signing_packages p ON p.owner_context_id=r.owner_context_id AND p.id=r.package_id
                WHERE r.owner_context_id=$1 AND r.id=ANY($2::uuid[]) ORDER BY p.id FOR UPDATE OF p,r`, [grant.owner_context_id, revisionIds])).rows;
            const byRevision = new Map(revisions.map(row => [row.id, row]));
            for (const item of items) {
                const revision = byRevision.get(item.revisionId);
                if (!revision || revision.active_revision_id !== revision.id || !['active', 'attention'].includes(revision.workflow_state)) fail('REVISION_INACTIVE', 409);
                if (!revision.before_deadline) fail('DEADLINE_EXPIRED', 409);
                if (revision.revision_hash !== item.revisionHash) fail('MANIFEST_CHANGED', 409);
            }
            const tasks = new Map((await db.query(`SELECT t.*,p.capacity,p.authority_id,p.authority_version,p.role_key FROM signing_tasks t
                JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
                WHERE t.owner_context_id=$1 AND t.id=ANY($2::uuid[]) ORDER BY t.id FOR UPDATE OF t`,
            [grant.owner_context_id, items.map(item => item.taskId)])).rows.map(row => [row.id, row]));
            for (const item of items) {
                const task = tasks.get(item.taskId);
                if (task?.state === 'accepted') fail('ALREADY_ACCEPTED', 409);
                if (!task || task.state !== 'ready' || task.stage_artifact_id !== item.stageArtifactId || task.version !== item.taskVersion
                    || task.participation_id !== item.participationId) fail('MANIFEST_CHANGED', 409);
            }
            const live = await lockSession(db, grant, session.id, token);
            if (!live.verified_at || live.manifest_hash !== session.manifest_hash) fail('OTP_REQUIRED', 403);
            const grantRow = await db.query(`SELECT id FROM signing_public_grants WHERE owner_context_id=$1 AND id=$2 AND revoked_at IS NULL
                AND expires_at > clock_timestamp() FOR SHARE`, [grant.owner_context_id, grant.id]);
            if (!grantRow.rowCount) fail('LINK_UNAVAILABLE', 404);
            // A contact correction can commit after the initial public lookup. Recheck
            // scoped profile versions under the package/session fence before acceptance.
            const currentGrant = await loadPublicGrant(db,token);
            if (items.some(item => !currentGrant.items.some(allowed => allowed.document_id === item.documentId))) fail('LINK_UNAVAILABLE',404);
            await assertCurrentAuthorities(db,grant.owner_context_id,revisionIds);
            const now = (await db.query('SELECT clock_timestamp() AS now')).rows[0].now;
            let signatureArtifactId = null;
            if (signature) {
                const inputsHash = digest({ sessionId: session.id, signatureHash: signature.hash, kind: 'signature' });
                await db.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at)
                    VALUES($1,$2,'signature',$3,$4,$5,$6,'ready',$7,clock_timestamp()) ON CONFLICT(owner_context_id,kind,inputs_hash) DO NOTHING`,
                [upload.id, grant.owner_context_id, inputsHash, signature.hash, upload.key, signature.bytes.length, { width: signature.width, height: signature.height }]);
                signatureArtifactId = (await db.query(`SELECT id FROM signing_artifacts WHERE owner_context_id=$1 AND kind='signature' AND inputs_hash=$2`,
                    [grant.owner_context_id, inputsHash])).rows[0].id;
            }
            const date = signingDate(now);
            const actions = items.map(item => {
                const task = tasks.get(item.taskId);
                const bindings = new Map(documents.get(item.documentId).field_bindings.map(field => [field.id, field]));
                const fields = item.fieldIds.map(id => {
                    const field = bindings.get(id);
                    const value = IMAGE_TYPES.has(field.type) ? signatureArtifactId : field.type === 'date' ? date : values[item.taskId][id];
                    return { id, type: field.type, value };
                });
                return { id: randomUUID(), task_id: item.taskId, participation_id: item.participationId, person_id: grant.person_id,
                    payload_hash: digest({ taskId: item.taskId, fields, signatureHash: signature?.hash || null }),
                    authority_snapshot: task.authority_id ? { authorityId: task.authority_id, authorityVersion: task.authority_version, capacity: task.capacity } : null,
                    consent_snapshot: { ...live.consent_snapshot, confirmed: true, roleKey: task.role_key, capacity: task.capacity },
                    values_snapshot: { fields, stageHash: item.stageHash, date }, signature_artifact_id: signatureArtifactId };
            });
            await db.query(`INSERT INTO signing_actions(id,owner_context_id,task_id,participation_id,person_id,session_id,manifest_hash,payload_hash,
                    authority_snapshot,consent_snapshot,values_snapshot,signature_artifact_id,accepted_at)
                SELECT id,$1,task_id,participation_id,person_id,$2,$3,payload_hash,authority_snapshot,consent_snapshot,values_snapshot,signature_artifact_id,$5
                FROM jsonb_to_recordset($4::jsonb) AS a(id uuid,task_id uuid,participation_id uuid,person_id uuid,payload_hash text,
                    authority_snapshot jsonb,consent_snapshot jsonb,values_snapshot jsonb,signature_artifact_id uuid)`,
            [grant.owner_context_id, session.id, session.manifest_hash, JSON.stringify(actions), now]);
            await db.query(`UPDATE signing_tasks SET state='accepted',version=version+1 WHERE owner_context_id=$1 AND id=ANY($2::uuid[])`,
                [grant.owner_context_id, items.map(item => item.taskId)]);
            await db.query(`UPDATE signing_sessions_v2 SET revoked_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2`, [grant.owner_context_id, session.id]);
            const acceptedByRevision = new Map();
            for (const item of items) {
                if (!acceptedByRevision.has(item.revisionId)) acceptedByRevision.set(item.revisionId, []);
                acceptedByRevision.get(item.revisionId).push(item.taskId);
            }
            await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details)
                SELECT $1,(e->>'packageId')::uuid,$2,'tasks_accepted',e->'details' FROM jsonb_array_elements($3::jsonb) e`,
            [grant.owner_context_id, `person:${grant.person_id}`, JSON.stringify(revisions.map(revision => ({ packageId: revision.package_id,
                details: { sessionId: session.id, manifestHash: session.manifest_hash,
                    taskIds: acceptedByRevision.get(revision.id) } })))]);
            const progressed = await advanceMany(db, grant.owner_context_id, revisions);
            const result = { operationId: operation.id, state: 'accepted', acceptedAt: now, tasks: items.map(item => ({ taskId: item.taskId, state: 'accepted' })),
                packages: progressed };
            await db.query(`UPDATE signing_operations SET state='complete',result=$3,completed_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2`,
                [grant.owner_context_id, operation.id, result]);
            return { ...result, reused: false };
        });
    }

    return { describe, documentPdf, evidencePdf, createSession, challenge, verify, accept, CONSENT_VERSION };
}

async function currentEndpoints(db, grant, revisionId) {
    return (await db.query(`SELECT endpoints_snapshot FROM signing_delivery_profiles WHERE owner_context_id=$1 AND revision_id=$2 AND person_id=$3`,
        [grant.owner_context_id, revisionId, grant.person_id])).rows[0]?.endpoints_snapshot || {};
}

// Runs inside the accepting transaction. Only one stage is ready at a time; it is done when
// none of its required tasks are ready or need resolution. Optional tasks never hold a package back.
async function advanceMany(db, contextId, revisions) {
    if (!revisions.length) return [];
    const states = new Map((await db.query(`SELECT revision_id,count(*) FILTER (WHERE required AND state IN ('ready','declined','clarification','expired'))::integer AS ready,
            min(stage) FILTER (WHERE state='blocked') AS next
        FROM signing_tasks WHERE owner_context_id=$1 AND revision_id=ANY($2::uuid[]) GROUP BY revision_id`,
    [contextId, revisions.map(revision => revision.id)])).rows.map(row => [row.revision_id, row]));
    const finished = revisions.filter(revision => { const state = states.get(revision.id); return !state?.ready && state?.next == null; });
    const documents = new Map();
    if (finished.length) for (const row of (await db.query(`SELECT id,revision_id,document_key FROM signing_documents
        WHERE owner_context_id=$1 AND revision_id=ANY($2::uuid[]) ORDER BY revision_id,document_key`, [contextId, finished.map(revision => revision.id)])).rows) {
        if (!documents.has(row.revision_id)) documents.set(row.revision_id, []);
        documents.get(row.revision_id).push(row);
    }
    const jobs = [], dependencies = [];
    const progressed = revisions.map(revision => {
        const open = states.get(revision.id);
        expect(open, 'TASK_UNAVAILABLE');
        if (open.ready) return { packageId: revision.package_id, state: 'waiting_on_others' };
        if (open.next !== null) {
            jobs.push(job('render_stage', revision.id, digest({ revisionHash: revision.revision_hash, next: open.next })));
            return { packageId: revision.package_id, state: 'next_stage', stage: open.next };
        }
        const finals = (documents.get(revision.id) || []).map(document => job('finalize_document', document.id,
            digest({ revisionHash: revision.revision_hash, document: document.document_key, kind: 'final' })));
        const evidence = job('render_evidence', revision.id, evidenceJobInput(revision.revision_hash));
        jobs.push(...finals, evidence);
        dependencies.push(...finals.map(item => ({ job_id: evidence.id, depends_on_id: item.id })));
        return { packageId: revision.package_id, state: 'finalizing' };
    });
    // One set of reads and durable job writes for the complete frozen selection.
    await enqueue(db, contextId, jobs, dependencies);
    return progressed;
}

async function advance(db, contextId, revision) {
    return (await advanceMany(db, contextId, [revision]))[0];
}

module.exports = { createPublicSigningService, CONSENT_VERSION, OTP, advance, advanceMany };
