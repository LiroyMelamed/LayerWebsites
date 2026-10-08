const { randomUUID } = require('node:crypto');
const { UUID } = require('../../lib/signingV2/compiler');
const { expect, fail } = require('../../lib/signingV2/errors');
const { transaction } = require('./transaction');
const {scopeParams}=require('./access');
const {partyScopeSql,authorityScopeSql}=require('./directoryAccess');
const { loadPerson } = require('./people');
const { precondition } = require('./templates');

function requireAuthorityPermission(scope) {
    if (scope.authorityManage !== true) fail('FORBIDDEN', 403);
}
function validateScope(value) {
    expect(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_AUTHORITY');
    expect(Object.keys(value).every(key => ['allSigning','roleKeys'].includes(key)), 'INVALID_AUTHORITY');
    expect(value.allSigning === undefined || typeof value.allSigning === 'boolean', 'INVALID_AUTHORITY');
    const roles = value.roleKeys || [];
    expect(Array.isArray(roles) && roles.length <= 30 && roles.every(key => typeof key === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)), 'INVALID_AUTHORITY');
    expect(value.allSigning === true || roles.length > 0, 'INVALID_AUTHORITY');
    return { allSigning: value.allSigning === true, roleKeys: [...new Set(roles)].sort() };
}

async function createAuthority(pool, scope, input) {
    return transaction(pool, db => createAuthorityInTransaction(db, scope, input));
}

async function createAuthorityInTransaction(db, scope, input) {
    requireAuthorityPermission(scope);
    expect(UUID.test(input.personId) && UUID.test(input.partyId) && UUID.test(input.evidenceArtifactId), 'INVALID_AUTHORITY');
    const authorityScope = validateScope(input.scope);
    const start = new Date(input.validFrom), end = input.validUntil ? new Date(input.validUntil) : null;
    expect(typeof input.validFrom === 'string' && /Z$/.test(input.validFrom) && Number.isFinite(+start), 'INVALID_AUTHORITY');
    expect(!end || (typeof input.validUntil === 'string' && /Z$/.test(input.validUntil) && +end > +start), 'INVALID_AUTHORITY');
        await loadPerson(db, scope, input.personId);
        const party = await db.query(`SELECT party.id FROM signing_parties party WHERE ${partyScopeSql()} AND party.id=$5 AND (party.kind='legal_entity' OR (party.kind='person' AND party.person_id<>$6))`, [...scopeParams(scope), input.partyId, input.personId]);
        const evidence = await db.query(`SELECT id FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2 AND kind='authority' AND state='ready'
            AND ($3::boolean OR created_by=$4)`, [scope.contextId, input.evidenceArtifactId, scope.all, scope.userId]);
        if (!party.rowCount || !evidence.rowCount) fail('NOT_FOUND',404);
        const authority = (await db.query(`INSERT INTO signing_authorities(id,owner_context_id,person_id,represented_party_id,
            evidence_artifact_id,scope,valid_from,valid_until,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [randomUUID(),scope.contextId,input.personId,input.partyId,input.evidenceArtifactId,authorityScope,start,end,scope.userId])).rows[0];
        await audit(db,scope,'authority_created',authority);
        return authority;
}

async function audit(db,scope,kind,authority,reason=null) {
    await db.query(`INSERT INTO signing_events_v2(owner_context_id,actor_key,kind,details)
        VALUES($1,$2,$3,$4)`,[scope.contextId,`user:${scope.userId}`,kind,{authorityId:authority.id,version:authority.version,reason}]);
}

async function changeAuthority(pool,scope,id,{expectedVersion,action,reason}) {
    requireAuthorityPermission(scope);precondition(expectedVersion);
    expect(UUID.test(id) && ['approve','revoke'].includes(action), 'INVALID_AUTHORITY');
    expect(typeof reason === 'string' && reason.trim().length > 0 && reason.length <= 1000, 'REASON_REQUIRED');
    return transaction(pool,async db=>{
        // Acceptance takes FOR SHARE on this exact head. Revocation takes the
        // conflicting lock and never locks revisions after it, avoiding a cycle.
        const result=await db.query(`SELECT a.* FROM signing_authorities a WHERE ${authorityScopeSql()} AND a.id=$5 FOR UPDATE OF a`,[...scopeParams(scope),id]);
        if(!result.rowCount) fail('NOT_FOUND',404);
        const authority=result.rows[0];
        if(authority.version!==expectedVersion) fail('VERSION_CHANGED',412);
        expect(action==='approve' ? authority.status==='pending' : authority.status!=='revoked','INVALID_AUTHORITY_STATE');
        if(action==='approve') {
            const validity=await db.query('SELECT $1::timestamptz IS NULL OR $1::timestamptz > clock_timestamp() AS valid',[authority.valid_until]);
            expect(validity.rows[0].valid,'AUTHORITY_EXPIRED');
        }
        const changed=(await db.query(action==='approve'
            ? `UPDATE signing_authorities SET status='approved',version=version+1,approved_by=$3,approved_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2 RETURNING *`
            : `UPDATE signing_authorities SET status='revoked',version=version+1,revoked_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2 AND $3::integer IS NOT NULL RETURNING *`,
        [scope.contextId,id,scope.userId])).rows[0];
        await audit(db,scope,action==='approve'?'authority_approved':'authority_revoked',changed,reason.trim());
        return changed;
    });
}

async function assertCurrentAuthorities(db, contextId, revisionId) {
    const participants=(await db.query(`SELECT person_id,represented_party_id,authority_id,authority_version,role_key
        FROM signing_participations WHERE owner_context_id=$1 AND revision_id=$2 AND capacity='representative'
        ORDER BY authority_id`,[contextId,revisionId])).rows;
    if(!participants.length) return [];
    const ids=[...new Set(participants.map(item=>item.authority_id))];
    const rows=(await db.query(`SELECT *,valid_from <= clock_timestamp() AND
        (valid_until IS NULL OR valid_until > clock_timestamp()) AS valid_now
        FROM signing_authorities WHERE owner_context_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`,[contextId,ids])).rows;
    const authorities=new Map(rows.map(item=>[item.id,item]));
    for(const participant of participants) {
        const authority=authorities.get(participant.authority_id);
        expect(authority && authority.status==='approved' && authority.valid_now && authority.version===participant.authority_version,'AUTHORITY_EXPIRED');
        expect(authority.person_id===participant.person_id && authority.represented_party_id===participant.represented_party_id,'AUTHORITY_REQUIRED');
        expect(authority.scope.allSigning===true || authority.scope.roleKeys?.includes(participant.role_key),'AUTHORITY_SCOPE_MISMATCH');
    }
    return rows.map(({valid_now,...authority})=>authority);
}

module.exports={createAuthority,createAuthorityInTransaction,changeAuthority,assertCurrentAuthorities,validateScope};
