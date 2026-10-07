const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { bytesHash } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { hasAreaAction, normalizeRolePermissions } = require('../../lib/firmRolePermissions');
const jobs = require('./jobs');
const { createPreparationService } = require('./preparation');
const { createWorkflowService } = require('./workflow');
const { createGrantService } = require('./grants');
const { createDeliveryService, markAbandonedDispatches } = require('./delivery');
const { RenderPool } = require('./renderPool');

function objectStorage({ client, bucket }) {
    expect(client && typeof bucket === 'string' && bucket.length > 0, 'STORAGE_REQUIRED');
    async function read(key, expectedBytes) {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const chunks = [];
        let length = 0;
        for await (const chunk of response.Body) {
            length += chunk.length;
            if (expectedBytes && length > expectedBytes) fail('ARTIFACT_HASH_MISMATCH');
            chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks);
        if (expectedBytes) expect(bytes.length === expectedBytes, 'ARTIFACT_HASH_MISMATCH');
        return bytes;
    }
    return {
        read,
        write: (key, bytes, { contentType = 'application/pdf' } = {}) => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType })),
        // A read-back hash, not a HEAD: an object store can acknowledge a write it later serves differently.
        verify: async (key, length, hash) => expect(bytesHash(await read(key, length)) === hash, 'ARTIFACT_HASH_MISMATCH'),
    };
}

// The v2 batch shares the office lock and the monthly document quota with v1 bulk sending.
function officeQuota({ checkFirmLimits }) {
    return async function reserveCapacity(db, scope, capacity) {
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`signing-batches:${scope.tenantId || 'dedicated'}`]);
        const used = (await db.query(`SELECT COALESCE(sum(document_count),0)::integer AS documents FROM signing_submissions
            WHERE owner_context_id=$1 AND committed_at >= date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
        [scope.contextId])).rows[0].documents;
        const check = await checkFirmLimits({ action: 'upload_signing_file',
            increments: { documentsCreatedThisMonth: used + capacity.documents, storageBytesTotal: capacity.estimatedOutputBytes } });
        if (check?.enforcementMode === 'block' && check.blocks?.length) fail('LIMIT_EXCEEDED', 402);
    };
}

// Activation happens later than creation; the creator's current access decides, not the access at enqueue time.
async function authorizeActivation(db, revision) {
    expect(process.env.SIGNING_V2_ENABLED === 'true', 'ACTIVATION_NOT_AUTHORIZED');
    const owner = (await db.query(`SELECT u.role,u.firm_staff_role_id,r.permissions,r.is_active FROM signing_packages p
        JOIN users u ON u.userid=p.owner_userid LEFT JOIN firm_staff_roles r ON r.id=u.firm_staff_role_id
        WHERE p.owner_context_id=$1 AND p.id=$2`, [revision.owner_context_id, revision.package_id])).rows[0];
    expect(owner && ['Admin', 'Lawyer', 'Staff'].includes(owner.role), 'ACTIVATION_NOT_AUTHORIZED');
    if (owner.firm_staff_role_id) {
        expect(owner.is_active === true && hasAreaAction(normalizeRolePermissions(owner.permissions), 'signing', 'upload'), 'ACTIVATION_NOT_AUTHORIZED');
    } else {
        expect(['Admin', 'Lawyer'].includes(owner.role), 'ACTIVATION_NOT_AUTHORIZED');
    }
}

const MESSAGES = {
    he: (name, owner, url) => `שלום ${name}, ממתינים לחתימתך מסמכים מאת ${owner}. ${url}`,
    ar: (name, owner, url) => `مرحبًا ${name}، هناك مستندات من ${owner} بانتظار توقيعك. ${url}`,
    en: (name, owner, url) => `Hello ${name}, documents from ${owner} are waiting for your signature. ${url}`,
};

function notificationProvider({ pool, notifyRecipient }) {
    return { async send(message) {
        const found = (await pool.query(`SELECT person.name AS person_name,s.name AS submission_name,owner.name AS owner_name
            FROM signing_deliveries d
            JOIN signing_delivery_profiles dp ON dp.owner_context_id=d.owner_context_id AND dp.id=d.profile_id
            JOIN signing_people person ON person.owner_context_id=dp.owner_context_id AND person.id=dp.person_id
            JOIN signing_package_revisions r ON r.owner_context_id=dp.owner_context_id AND r.id=dp.revision_id
            JOIN signing_packages p ON p.owner_context_id=r.owner_context_id AND p.id=r.package_id
            JOIN signing_submissions s ON s.owner_context_id=p.owner_context_id AND s.id=p.submission_id
            JOIN users owner ON owner.userid=p.owner_userid WHERE d.id=$1`, [message.deliveryId])).rows[0];
        if (!found) throw Object.assign(new Error('delivery not found'), { definitive: true, code: 'DELIVERY_NOT_FOUND' });
        const email = message.channel === 'email';
        const type = message.purpose === 'reminder' ? 'SIGN_REMINDER' : 'SIGN_INVITE';
        const result = await notifyRecipient({ recipientUserId: null, notificationType: type, respectExplicitChannelChoice: true, skipAdminCc: true,
            recipientEmail: email ? message.endpoint : null, recipientPhone: email ? null : message.endpoint,
            email: email ? { campaignKey: type, contactFields: { recipient_name: found.person_name, document_name: found.submission_name,
                lawyer_name: found.owner_name, action_url: message.url } } : null,
            sms: email ? null : { messageBody: (MESSAGES[message.locale] || MESSAGES.he)(found.person_name, found.owner_name, message.url) } });
        const outcome = result?.outcomes?.[email ? 'email' : 'sms'];
        if (outcome?.ok === true) return { providerId: outcome.messageId || null };
        if (outcome && outcome.attempted === false) throw Object.assign(new Error('not attempted'), { definitive: true, code: 'PROVIDER_REJECTED' });
        // Anything else may already have reached the provider; the delivery service records it as uncertain.
        throw new Error('provider outcome unknown');
    } };
}

function grantKey(env) {
    const key = Buffer.from(String(env.SIGNING_V2_GRANT_KEY || ''), 'base64');
    expect(key.length === 32, 'GRANT_KEY_REQUIRED');
    return key;
}

function linkFor(env) {
    const raw = String(env.WEBSITE_DOMAIN || '').trim().replace(/\/+$/, '');
    expect(raw.length > 0, 'CONTEXT_REQUIRED');
    const origin = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    // Native clients open this path family in a browser sheet. The token stays in the fragment, out of access logs and Referer headers.
    return token => `${origin.origin}/ViewSignedDocument/Sign#${token}`;
}

function createRuntime({ pool, env = process.env, storage, provider, renderer, contextIds = null, log = console }) {
    const grantService = createGrantService({ encryptionKey: grantKey(env), keyId: env.SIGNING_V2_GRANT_KEY_ID || '1' });
    const pool_ = renderer || new RenderPool({ concurrency: Math.min(4, Math.max(1, Number(env.SIGNING_V2_RENDERERS) || 2)) });
    const workflow = createWorkflowService({ pool, grantService, authorizeActivation });
    const handlers = {
        prepare_document: createPreparationService({ pool, renderer: pool_, storage }),
        validate_package: workflow.validatePackage,
        activate_package: workflow.activatePackage,
    };
    // Without an explicit provider, invitations stay queued; nothing is sent and nothing is marked failed.
    if (provider) handlers.dispatch_delivery = createDeliveryService({ pool, grantService, provider, linkFor: linkFor(env) });
    const workerId = `signing-v2:${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`.slice(0, 100);
    let timer = null, running = false, stopped = false, recoveredAt = 0;

    async function runLease(kind, lease) {
        try { await handlers[kind](lease); }
        catch (error) {
            const code = /^[A-Z][A-Z0-9_]{1,79}$/.test(error?.errorCode || '') ? error.errorCode : 'WORKER_ERROR';
            if (code === 'WORKER_LEASE_LOST') return;
            try { await jobs.failed(pool, lease, { code, retryable: !['REVISION_INACTIVE', 'ACTIVATION_NOT_AUTHORIZED', 'INVALID_SOURCE'].includes(code) }); }
            catch (failure) { if (failure?.errorCode !== 'WORKER_LEASE_LOST') throw failure; }
            log.error('[signing-v2] job failed', kind, code);
        }
    }

    async function tick() {
        if (running || stopped) return 0;
        running = true;
        let processed = 0;
        try {
            if (Date.now() - recoveredAt > 30000) {
                recoveredAt = Date.now();
                await jobs.recoverExpired(pool);
                await markAbandonedDispatches(pool);
            }
            for (const kind of ['prepare_document', 'validate_package', 'activate_package', 'dispatch_delivery']) {
                if (!handlers[kind]) continue;
                const batch = await jobs.claim(pool, { workerId, kinds: [kind], limit: kind === 'prepare_document' ? Math.min(8, pool_.concurrency * 2) : 8, contextIds });
                processed += batch.length;
                await Promise.all(batch.map(lease => runLease(kind, lease)));
            }
        } catch (error) {
            log.error('[signing-v2] worker tick failed', error?.errorCode || error?.code || 'ERROR');
        } finally {
            running = false;
        }
        return processed;
    }

    return {
        grantService, handlers, workerId, tick,
        // Drains until a full pass finds nothing; used by QA harnesses and measurements.
        async drain() { let total = 0; for (let count = await tick(); count; count = await tick()) total += count; return total; },
        start(intervalMs = Number(env.SIGNING_V2_WORKER_INTERVAL_MS) || 1000) {
            if (timer) return;
            timer = setInterval(tick, intervalMs);
            timer.unref?.();
        },
        async stop() { stopped = true; if (timer) clearInterval(timer); timer = null; if (!renderer) await pool_.close(); },
    };
}

function startFromEnvironment({ pool, env = process.env, log = console }) {
    if (env.SIGNING_V2_ENABLED !== 'true' || env.SIGNING_V2_WORKER_ENABLED !== 'true') return null;
    const { r2, BUCKET } = require('../../utils/r2');
    const provider = env.SIGNING_V2_PROVIDER === 'notifications'
        ? notificationProvider({ pool, notifyRecipient: (...args) => require('../notifications/notificationOrchestrator').notifyRecipient(...args) })
        : null;
    const runtime = createRuntime({ pool, env, storage: objectStorage({ client: r2, bucket: BUCKET }), provider, log });
    runtime.start();
    log.log(`[signing-v2] worker started (provider: ${provider ? 'notifications' : 'none, invitations stay queued'})`);
    return runtime;
}

module.exports = { createRuntime, startFromEnvironment, objectStorage, officeQuota, authorizeActivation, notificationProvider, linkFor };
