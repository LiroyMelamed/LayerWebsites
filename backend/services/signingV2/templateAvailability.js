const { fail } = require('../../lib/signingV2/errors');

// An imported revision must not resurrect an archived source template for a new send.
// Existing packages keep their snapshots and remain readable/signable.
const availableOriginSql = `(v.definition->'origin'->>'kind' IS DISTINCT FROM 'legacy_template' OR EXISTS (
    SELECT 1 FROM signing_templates source WHERE source.id::text=v.definition->'origin'->>'templateId'
    AND NOT source.archived AND source.law_firm_tenant_id IS NOT DISTINCT FROM t.law_firm_tenant_id))`;

// Keep migrated legacy revisions out of the send picker even while their
// native template is archived. Re-importing must not silently undo an archive.
async function importedOrigins(db, scope) {
    const result = await db.query(`SELECT DISTINCT v.definition->'origin' AS origin
        FROM signing_templates t JOIN signing_template_versions v
        ON v.owner_context_id=t.owner_context_id AND v.template_id=t.id
        WHERE t.owner_context_id=$1 AND ($2::boolean OR t.owner_userid=$3)
        AND v.state='published' AND v.definition->'origin'->>'kind'='legacy_template'`,
    [scope.contextId, scope.all, scope.userId]);
    return result.rows.map(row => row.origin);
}
async function lockAvailableOrigin(db, scope, definition) {
    const origin = definition?.origin;
    if (origin?.kind !== 'legacy_template') return;
    // The caller already holds the native head lock. Keep source availability
    // stable until this publication/creation transaction commits.
    const source = await db.query(`SELECT id FROM signing_templates WHERE id::text=$1 AND NOT archived
        AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid FOR SHARE`, [origin.templateId, scope.tenantId]);
    if (!source.rowCount) fail('NOT_FOUND', 404);
}
module.exports = { availableOriginSql, importedOrigins, lockAvailableOrigin };
