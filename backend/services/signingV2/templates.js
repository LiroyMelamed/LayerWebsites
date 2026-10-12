const { randomUUID } = require('node:crypto');
const { validateDefinition, UUID } = require('../../lib/signingV2/compiler');
const { digest } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { transaction } = require('./transaction');
const { lockAvailableOrigin } = require('./templateAvailability');
const { snapshotBytes } = require('../../lib/signingV2/limits');

function precondition(value) {
    if (value === undefined || value === null) fail('PRECONDITION_REQUIRED', 428);
    expect(Number.isInteger(value) && value > 0, 'INVALID_PRECONDITION');
}

async function loadHead(db, scope, templateId, lock = false) {
    expect(UUID.test(templateId), 'INVALID_TEMPLATE');
    const result = await db.query(`SELECT * FROM signing_templates WHERE owner_context_id=$1 AND id=$2
        AND ($3::boolean OR owner_userid=$4) AND NOT archived ${lock ? 'FOR UPDATE' : ''}`,
    [scope.contextId, templateId, scope.all, scope.userId]);
    if (!result.rowCount) fail('NOT_FOUND', 404);
    if (lock && result.rows[0].owner_userid !== scope.userId && !scope.manage) fail('FORBIDDEN', 403);
    if (lock) await lockAvailableOrigin(db, scope, result.rows[0].definition);
    return result.rows[0];
}

async function validateSources(db, scope, definition) {
    await require('./completionMarks').assertAssets(db, scope, definition);
    const sourceIds = [...new Set(definition.documents.map(document => document.sourceArtifactId))];
    const result = await db.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=ANY($2::uuid[])
        AND kind='source' AND state='ready' FOR SHARE`, [scope.contextId, sourceIds]);
    if (result.rowCount !== sourceIds.length) fail('INVALID_SOURCE', 404);
    const sources = new Map(result.rows.map(source => [source.id, source]));
    for (const document of definition.documents) {
        const source = sources.get(document.sourceArtifactId);
        expect(source.content_sha256 === document.sourceHash, 'SOURCE_CHANGED', document.key);
        for (const field of document.fields) {
            const page = source.metadata?.pages?.[field.pageNum - 1];
            expect(page && field.y + field.height <= 800 * page.height / page.width, 'INVALID_GEOMETRY', `${document.key}.${field.id}`);
        }
    }
}

async function createDraft(pool, scope, input) {
    // Draft saving is allowed to contain missing authoring information. Publishing
    // is the strict compiler boundary, so incomplete work is never discarded.
    expect(input.definition?.schemaVersion === 2 && typeof input.definition.name === 'string' && input.definition.name.trim().length > 0, 'INVALID_TEMPLATE');
    const definitionHash = digest(input.definition);
    expect(Buffer.byteLength(JSON.stringify(input.definition)) <= snapshotBytes, 'CAPACITY_BUDGET_EXCEEDED');
    if (input.draftId != null) expect(UUID.test(input.draftId), 'INVALID_TEMPLATE');
    return transaction(pool, async db => {
        const draftId = input.draftId || randomUUID();
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`signing-template-draft:${draftId}`]);
        const existing = (await db.query('SELECT * FROM signing_template_versions WHERE id=$1', [draftId])).rows[0];
        if (existing) {
            if (existing.owner_context_id !== scope.contextId || existing.created_by !== scope.userId) fail('NOT_FOUND', 404);
            await loadHead(db, scope, existing.template_id, true);
            if (existing.edit_version !== 1 || existing.state !== 'draft' || existing.definition_hash !== definitionHash
                || (input.templateId && input.templateId !== existing.template_id)
                || (input.baseVersionId !== undefined && input.baseVersionId !== existing.base_version_id)) fail('VERSION_CHANGED', 412);
            return existing;
        }
        let templateId = input.templateId;
        let version = 1;
        let baseVersionId = null;
        if (templateId) {
            await loadHead(db, scope, templateId, true);
            const base = (await db.query("SELECT id FROM signing_template_versions WHERE owner_context_id=$1 AND template_id=$2 AND state='published' ORDER BY version DESC LIMIT 1", [scope.contextId, templateId])).rows[0];
            baseVersionId = base?.id || null;
            if (input.baseVersionId !== undefined && input.baseVersionId !== baseVersionId) fail('VERSION_CHANGED', 412);
            const latest = await db.query('SELECT COALESCE(max(version),0) AS version FROM signing_template_versions WHERE owner_context_id=$1 AND template_id=$2', [scope.contextId, templateId]);
            version = latest.rows[0].version + 1;
            await db.query('UPDATE signing_templates SET lifecycle_version=lifecycle_version+1,updated_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2', [scope.contextId, templateId]);
        } else {
            templateId = randomUUID();
            await db.query(`INSERT INTO signing_templates(id,owner_context_id,law_firm_tenant_id,owner_userid,name,definition)
                VALUES($1,$2,$3,$4,$5,$6)`, [templateId, scope.contextId, scope.tenantId, scope.userId, input.definition.name.trim(), input.definition]);
        }
        return (await db.query(`INSERT INTO signing_template_versions(id,owner_context_id,template_id,version,definition,definition_hash,created_by,base_version_id)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [draftId, scope.contextId, templateId, version, input.definition, definitionHash, scope.userId, baseVersionId])).rows[0];
    });
}

async function saveDraft(pool, scope, templateId, versionId, definition, expectedVersion) {
    precondition(expectedVersion);
    expect(UUID.test(versionId) && definition?.schemaVersion === 2, 'INVALID_TEMPLATE');
    const definitionHash = digest(definition);
    expect(Buffer.byteLength(JSON.stringify(definition)) <= snapshotBytes, 'CAPACITY_BUDGET_EXCEEDED');
    return transaction(pool, async db => {
        await loadHead(db, scope, templateId, true);
        const updated = await db.query(`UPDATE signing_template_versions SET definition=$1,definition_hash=$2,edit_version=edit_version+1
            WHERE owner_context_id=$3 AND template_id=$4 AND id=$5 AND state='draft' AND edit_version=$6 AND created_by=$7 RETURNING *`,
        [definition, definitionHash, scope.contextId, templateId, versionId, expectedVersion, scope.userId]);
        if (!updated.rowCount) fail('VERSION_CHANGED', 412);
        await db.query('UPDATE signing_templates SET lifecycle_version=lifecycle_version+1,updated_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2', [scope.contextId, templateId]);
        return updated.rows[0];
    });
}

async function publish(pool, scope, templateId, versionId, expectedVersion, expectedHash) {
    precondition(expectedVersion);
    expect(UUID.test(versionId), 'INVALID_TEMPLATE');
    return transaction(pool, async db => {
        await loadHead(db, scope, templateId, true);
        const result = await db.query(`SELECT * FROM signing_template_versions WHERE owner_context_id=$1 AND template_id=$2 AND id=$3 FOR UPDATE`, [scope.contextId, templateId, versionId]);
        if (!result.rowCount) fail('NOT_FOUND', 404);
        const draft = result.rows[0];
        if (draft.created_by !== scope.userId) fail('NOT_FOUND', 404);
        if (draft.state !== 'draft' || draft.edit_version !== expectedVersion || draft.definition_hash !== expectedHash) fail('VERSION_CHANGED', 412);
        const latest = (await db.query("SELECT id FROM signing_template_versions WHERE owner_context_id=$1 AND template_id=$2 AND state='published' ORDER BY version DESC LIMIT 1", [scope.contextId, templateId])).rows[0];
        if ((latest?.id || null) !== draft.base_version_id) fail('VERSION_CHANGED', 412);
        const definition = validateDefinition(draft.definition);
        if (definition.policy.soloApproval) {
            const actor=(await db.query(`SELECT u.role,u.firm_staff_role_id,EXISTS(SELECT 1 FROM platform_admins a WHERE a.user_id=u.userid AND a.is_active) AS platform_admin
                FROM users u JOIN signing_owner_contexts c ON c.id=$1 AND c.law_firm_tenant_id IS NOT DISTINCT FROM u.law_firm_tenant_id WHERE u.userid=$2`,[scope.contextId,scope.userId])).rows[0];
            if (!actor || !(actor.platform_admin || (actor.role==='Admin' && !actor.firm_staff_role_id))) fail('SOLO_PROFILE_ADMIN_REQUIRED',403);
        }
        await validateSources(db, scope, definition);
        const published = (await db.query(`UPDATE signing_template_versions SET state='published',definition=$1,definition_hash=$2,
            published_by=$3,published_at=clock_timestamp(),edit_version=edit_version+1 WHERE id=$4 RETURNING *`,
        [definition, digest(definition), scope.userId, draft.id])).rows[0];
        await db.query(`UPDATE signing_templates SET name=$1,version=$2,definition=$3,lifecycle_version=lifecycle_version+1,updated_at=clock_timestamp()
            WHERE owner_context_id=$4 AND id=$5`, [definition.name, draft.version, definition, scope.contextId, templateId]);
        return published;
    });
}

module.exports = { createDraft, saveDraft, publish, loadHead, validateSources, precondition };
