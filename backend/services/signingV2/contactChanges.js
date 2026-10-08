const { randomUUID } = require('node:crypto');
const { UUID } = require('../../lib/signingV2/compiler');
const { digest } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { transaction } = require('./transaction');
const { packageScopeSql, scopeParams } = require('./access');
const { endpoints } = require('./people');
const { normalizePhone } = require('./creation');

function requirePermission(scope) {
    if (scope.contactCorrect !== true) fail('FORBIDDEN', 403);
}
async function currentContact(db, scope, packageId, personId, lock = false) {
    expect(UUID.test(packageId) && UUID.test(personId), 'INVALID_ACTION');
    const pkg = (await db.query(`SELECT p.active_revision_id,r.workflow_state,r.revision_hash
        FROM signing_packages p JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
        WHERE ${packageScopeSql('p')} AND p.id=$5 ${lock ? 'FOR UPDATE OF p,r' : ''}`,
    [...scopeParams(scope), packageId])).rows[0];
    if (!pkg) fail('NOT_FOUND', 404);
    const profile = (await db.query(`SELECT dp.*,person.name FROM signing_delivery_profiles dp JOIN signing_people person
        ON person.owner_context_id=dp.owner_context_id AND person.id=dp.person_id
        WHERE dp.owner_context_id=$1 AND dp.revision_id=$2 AND dp.person_id=$3`,
    [scope.contextId, pkg.active_revision_id, personId])).rows[0];
    if (!profile) fail('NOT_FOUND', 404);
    return { pkg, profile };
}
async function readContact(db, scope, packageId, personId) {
    requirePermission(scope);
    const { pkg, profile } = await currentContact(db, scope, packageId, personId);
    return { packageId, personId, revisionId: pkg.active_revision_id, version: profile.version,
        name: profile.name, endpoints: profile.endpoints_snapshot, channels: profile.policy_snapshot.channels,
        editable: !['cancelled','superseded'].includes(pkg.workflow_state) };
}

// The version is the revocation fence for only this revision/person. Broad shared
// grants keep their other package items. Sessions that consented to this revision
// close as a whole: their frozen consent must never silently shrink or expand.
// Caller locks the package first, matching acceptance. Do not lock deliveries:
// workers hold their delivery row before acquiring the package fence.
async function invalidateProfile(db, contextId, profile, userId, reason, nextEndpoints = profile.endpoints_snapshot) {
    await db.query(`UPDATE signing_sessions_v2 s SET revoked_at=clock_timestamp()
        WHERE s.owner_context_id=$1 AND s.person_id=$2 AND s.revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.exact_manifest->'items') item WHERE item->>'revisionId'=$3)`,
    [contextId, profile.person_id, profile.revision_id]);
    const changed = (await db.query(`UPDATE signing_delivery_profiles SET endpoints_snapshot=$3,version=version+1,changed_by=$4,changed_reason=$5
        WHERE owner_context_id=$1 AND id=$2 RETURNING *`, [contextId,profile.id,nextEndpoints,userId,reason])).rows[0];
    return changed;
}
async function correctContact(pool, scope, packageId, personId, input) {
    requirePermission(scope);
    expect(UUID.test(input.idempotencyKey || '') && UUID.test(input.revisionId || '')
        && Number.isSafeInteger(input.expectedVersion) && input.expectedVersion > 0, 'INVALID_ACTION');
    expect(typeof input.reason === 'string' && input.reason.trim().length > 0 && input.reason.length <= 1000, 'REASON_REQUIRED');
    const values = input.endpoints || {};
    expect(Object.keys(values).every(key => ['email','phone'].includes(key)), 'INVALID_DELIVERY');
    const normalized = { ...(values.email ? { email: String(values.email).trim().toLowerCase() } : {}),
        ...(values.phone ? { phone: normalizePhone(values.phone) } : {}) };
    expect(!values.phone || normalized.phone, 'INVALID_DELIVERY');
    const next = endpoints(normalized), reason = input.reason.trim();
    expect(Object.keys(next).length > 0, 'INVALID_DELIVERY');
    const actor = `user:${scope.userId}`, kind = 'contact_corrected';
    const requestHash = digest({ packageId, personId, revisionId:input.revisionId,version:input.expectedVersion, next, reason });
    return transaction(pool, async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`contact:${scope.contextId}:${actor}:${input.idempotencyKey}`]);
        const { pkg, profile } = await currentContact(db, scope, packageId, personId, true);
        const prior = (await db.query(`SELECT request_hash,result FROM signing_operations
            WHERE owner_context_id=$1 AND actor_key=$2 AND kind=$3 AND idempotency_key=$4`,
        [scope.contextId,actor,kind,input.idempotencyKey])).rows[0];
        if (prior) {
            if (prior.request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT',409);
            return { ...prior.result, reused:true };
        }
        if (pkg.active_revision_id !== input.revisionId || profile.version !== input.expectedVersion) fail('VERSION_CHANGED',412);
        expect(!['cancelled','superseded'].includes(pkg.workflow_state), 'REVISION_INACTIVE');
        // Preserve the explicitly selected delivery policy. Removing a required
        // endpoint would leave a future stage impossible to deliver.
        expect(profile.policy_snapshot.channels.every(channel => next[channel === 'sms' ? 'phone' : 'email']), 'CHANNEL_UNAVAILABLE');
        const old = Object.fromEntries(Object.entries(profile.endpoints_snapshot).filter(([,value]) => value));
        expect(digest(old) !== digest(next), 'CONTACT_UNCHANGED');
        const changed = await invalidateProfile(db,scope.contextId,profile,scope.userId,reason,next);
        const result = { packageId,personId,revisionId:pkg.active_revision_id,version:changed.version,state:'saved',messageQueued:false };
        await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state,result,completed_at)
            VALUES($1,$2,$3,$4,$5,$6,'complete',$7,clock_timestamp())`,
        [randomUUID(),scope.contextId,actor,kind,input.idempotencyKey,requestHash,result]);
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details)
            VALUES($1,$2,$3,'contact_corrected',$4)`, [scope.contextId,packageId,actor,
            {personId,revisionId:pkg.active_revision_id,fromVersion:profile.version,toVersion:changed.version,reason}]);
        return { ...result,reused:false };
    });
}
module.exports = { readContact,correctContact,currentContact,invalidateProfile };
