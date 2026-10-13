const { fail, expect } = require('../../lib/signingV2/errors');
const { UUID } = require('../../lib/signingV2/compiler');
const { getCurrentTenantId, isMultiTenantMode } = require('../../lib/tenant/tenantContext');
const { createGrantService, loadPublicGrant } = require('./grants');

// A customer directory is not signing authority. Only an explicit linked_userid
// and a still-valid, already-issued public grant may enter this read-only index.
async function clientScope(db, req, env, enabled) {
    const userId = Number(req.user?.UserId);
    if (!Number.isSafeInteger(userId) || userId < 1) fail('UNAUTHORIZED', 401);
    const actor = (await db.query('SELECT userid,role,law_firm_tenant_id FROM users WHERE userid=$1', [userId])).rows[0];
    if (!actor || !['User', 'Client'].includes(actor.role)) fail('FORBIDDEN', 403);
    const tenantId = getCurrentTenantId() || req.tenant?.id || null;
    if ((isMultiTenantMode() && !tenantId)
        || String(actor.law_firm_tenant_id || '') !== String(tenantId || '')
        || String(req.firmTenantId || '') !== String(tenantId || '')) fail('FORBIDDEN', 403);
    if (!enabled) return { userId, tenantId, contextId: null };
    const deploymentKey = String(env.SIGNING_DEPLOYMENT_KEY || env.WEBSITE_DOMAIN || '').trim().toLowerCase();
    if (!deploymentKey || deploymentKey.length > 200) fail('CONTEXT_REQUIRED', 403);
    // Unlike office authoring, a portal read never creates an owner context.
    const context = (await db.query(`SELECT id FROM signing_owner_contexts
        WHERE deployment_key=$1 AND scope_key=$2 AND law_firm_tenant_id IS NOT DISTINCT FROM $3::uuid`,
    [deploymentKey, tenantId || 'dedicated', tenantId])).rows[0];
    return { userId, tenantId, contextId: context?.id || null };
}

// Keep these eligibility predicates identical to loadPublicGrant: they are also
// checked through that function after decryption on every deliberate open.
const validItemsSql = `
    FROM signing_public_grants g
    JOIN signing_people person ON person.owner_context_id=g.owner_context_id AND person.id=g.person_id
    JOIN signing_grant_items i ON i.owner_context_id=g.owner_context_id AND i.grant_id=g.id AND i.person_id=g.person_id
    JOIN signing_delivery_profiles dp ON dp.owner_context_id=i.owner_context_id AND dp.id=i.delivery_profile_id
    JOIN signing_package_revisions r ON r.owner_context_id=i.owner_context_id AND r.id=i.revision_id
    JOIN signing_packages pk ON pk.owner_context_id=r.owner_context_id AND pk.id=r.package_id
    JOIN signing_documents d ON d.owner_context_id=i.owner_context_id AND d.id=i.document_id AND d.revision_id=i.revision_id
    WHERE g.owner_context_id=$1 AND person.linked_userid=$2
        AND g.purpose IN ('sign','download') AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()
        AND dp.version=i.delivery_profile_version AND pk.active_revision_id=r.id
        AND r.workflow_state IN ('active','attention','complete')
        AND ((g.purpose='sign' AND (r.deadline IS NULL OR r.deadline>clock_timestamp()))
            OR (g.purpose='download' AND r.workflow_state='complete' AND d.state='final'
                AND EXISTS (SELECT 1 FROM signing_artifacts a WHERE a.owner_context_id=d.owner_context_id
                    AND a.id=d.final_artifact_id AND a.state='ready')))`;

function personalStatus(row) {
    if (row.purpose === 'sign' && row.ready > 0) return 'pending';
    if (row.waiting > 0) return 'waiting';
    if (row.declined > 0) return 'declined';
    if (row.cancelled > 0) return 'cancelled';
    if (row.total > 0 && row.accepted === row.total) return 'signed';
    return 'view_only';
}

function createClientPortalService({ pool, env = process.env, grantService = null }) {
    const enabled = () => env.SIGNING_V2_ENABLED === 'true';
    let decryptor = grantService;
    async function list(req) {
        const active = enabled(), scope = await clientScope(pool, req, env, active);
        if (!active || !scope.contextId) return { enabled: active, documents: [] };
        const rows = (await pool.query(`WITH eligible AS (
            SELECT g.id AS grant_id,g.purpose,g.person_id,g.allowed_task_ids,g.created_at AS grant_created_at,
                d.id AS document_id,d.name,d.state AS document_state,d.revision_id,d.owner_context_id,d.final_artifact_id,d.prepared_artifact_id,
                pk.id AS package_id,pk.case_id,pk.created_at ${validItemsSql}
        ) SELECT e.*,c.caseid AS visible_case_id,c.casename,
            tasks.total,tasks.ready,tasks.waiting,tasks.accepted,tasks.declined,tasks.cancelled,tasks.signed_at,
            (e.document_state='final' AND EXISTS (SELECT 1 FROM signing_artifacts a
                WHERE a.owner_context_id=e.owner_context_id AND a.id=e.final_artifact_id AND a.state='ready')) AS is_final,
            EXISTS (SELECT 1 FROM signing_artifacts a WHERE a.owner_context_id=e.owner_context_id AND a.state='ready'
                AND a.id=CASE WHEN e.purpose='download' THEN e.final_artifact_id
                    ELSE COALESCE(e.final_artifact_id,(
                        SELECT t.stage_artifact_id FROM signing_tasks t
                        JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
                        WHERE t.owner_context_id=e.owner_context_id AND t.document_id=e.document_id
                            AND p.person_id=e.person_id AND t.stage_artifact_id IS NOT NULL
                        ORDER BY t.stage DESC LIMIT 1),e.prepared_artifact_id) END) AS can_download
            FROM eligible e
            LEFT JOIN cases c ON c.caseid=e.case_id
                AND (to_jsonb(c)->>'law_firm_tenant_id') IS NOT DISTINCT FROM $3::text
                AND (c.userid=$2 OR EXISTS (SELECT 1 FROM case_users cu WHERE cu.caseid=c.caseid AND cu.userid=$2))
            CROSS JOIN LATERAL (
                SELECT count(*)::integer AS total,
                    count(*) FILTER (WHERE t.state='ready' AND stage_artifact.id IS NOT NULL)::integer AS ready,
                    count(*) FILTER (WHERE t.state='blocked' OR (t.state='ready' AND stage_artifact.id IS NULL))::integer AS waiting,
                    count(*) FILTER (WHERE t.state='accepted')::integer AS accepted,
                    count(*) FILTER (WHERE t.state='declined')::integer AS declined,
                    count(*) FILTER (WHERE t.state IN ('cancelled','expired'))::integer AS cancelled,
                    max(a.accepted_at) FILTER (WHERE t.state='accepted') AS signed_at
                FROM signing_tasks t
                JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
                    AND p.person_id=e.person_id
                LEFT JOIN signing_artifacts stage_artifact ON stage_artifact.owner_context_id=t.owner_context_id
                    AND stage_artifact.id=t.stage_artifact_id AND stage_artifact.state='ready'
                LEFT JOIN signing_actions a ON a.owner_context_id=t.owner_context_id AND a.task_id=t.id AND a.person_id=e.person_id
                WHERE t.owner_context_id=e.owner_context_id AND t.document_id=e.document_id
                    AND (e.allowed_task_ids IS NULL OR t.id=ANY(e.allowed_task_ids))
            ) tasks
            ORDER BY e.created_at DESC,e.document_id,
                (e.purpose='sign' AND tasks.ready>0) DESC,
                (e.purpose='sign' AND tasks.waiting>0) DESC,
                (e.allowed_task_ids IS NULL) DESC,e.grant_created_at DESC,e.grant_id`,
        [scope.contextId, scope.userId, scope.tenantId])).rows;
        // A document may have both an invitation and a narrower reminder/copy.
        // Prefer a grant that actually exposes a ready task, then a waiting task.
        const documents = new Map();
        for (const row of rows) {
            if (documents.has(row.document_id)) {
                // A returning signer may have a new ready-task grant plus a
                // still-valid grant for their earlier accepted stage. Keep that
                // history without changing the grant selected for current work.
                const document = documents.get(row.document_id);
                if (row.signed_at && (!document.PersonalSignedAt
                    || new Date(row.signed_at).getTime() > new Date(document.PersonalSignedAt).getTime())) {
                    document.PersonalSignedAt = row.signed_at;
                }
                continue;
            }
            documents.set(row.document_id, {
                DocumentId: row.document_id, GrantId: row.grant_id, PackageId: row.package_id,
                FileName: row.name, CaseId: row.visible_case_id || null, CaseName: row.casename || null,
                CreatedAt: row.created_at, PersonalStatus: personalStatus(row),
                CanSignNow: row.purpose === 'sign' && row.ready > 0,
                PersonalSignedAt: row.signed_at || null, CanDownload: row.can_download,
                IsFinal: row.is_final,
            });
        }
        return { enabled: true, documents: [...documents.values()] };
    }

    async function open(req, documentId, grantId) {
        const active = enabled(), scope = await clientScope(pool, req, env, active);
        if (!active || !scope.contextId || !UUID.test(String(documentId)) || !UUID.test(String(grantId))) fail('NOT_FOUND', 404);
        const grant = (await pool.query(`SELECT g.id,g.owner_context_id,g.person_id,g.purpose,g.token_hash,g.encrypted_token
            ${validItemsSql} AND d.id=$3 AND g.id=$4`, [scope.contextId, scope.userId, documentId, grantId])).rows[0];
        if (!grant) fail('NOT_FOUND', 404);
        if (!decryptor) {
            const key = Buffer.from(String(env.SIGNING_V2_GRANT_KEY || ''), 'base64');
            expect(key.length === 32, 'GRANT_KEY_REQUIRED');
            decryptor = createGrantService({ encryptionKey: key, keyId: env.SIGNING_V2_GRANT_KEY_ID || '1' });
        }
        const token = decryptor.tokenForDelivery(grant);
        const live = await loadPublicGrant(pool, token, { purpose: ['sign', 'download'] });
        if (live.owner_context_id !== scope.contextId || live.id !== grantId || live.person_id !== grant.person_id
            || !live.items.some(item => item.document_id === documentId)) fail('NOT_FOUND', 404);
        // Recheck explicit ownership after the public grant check. No session,
        // consent, challenge, renewal, delivery or signing mutation occurs here.
        const stillOwned = await pool.query(`SELECT 1 FROM signing_people p JOIN users u ON u.userid=p.linked_userid
            WHERE p.owner_context_id=$1 AND p.id=$2 AND u.userid=$3 AND u.role IN ('User','Client')
                AND u.law_firm_tenant_id IS NOT DISTINCT FROM $4::uuid`,
        [scope.contextId, live.person_id, scope.userId, scope.tenantId]);
        if (!stillOwned.rowCount) fail('NOT_FOUND', 404);
        return { url: `/ViewSignedDocument/Sign#${token}` };
    }
    return { list, open };
}

module.exports = { createClientPortalService };
