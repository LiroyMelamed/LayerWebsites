const { randomUUID } = require('node:crypto');
const { UUID } = require('../../lib/signingV2/compiler');
const { digest, bytesHash } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const limits = require('../../lib/signingV2/limits');
const { transaction } = require('./transaction');
const { scopeParams } = require('./access');
const {partyScopeSql,authorityScopeSql}=require('./directoryAccess');
const people = require('./people');
const authorities = require('./authorities');
const { precondition } = require('./templates');

function requireSend(scope) { if (scope.send !== true) fail('FORBIDDEN', 403); }
function requireApproval(scope) { if (scope.authorityManage !== true) fail('FORBIDDEN', 403); }
const personView = row => ({ id: row.id, name: row.name, endpoints: row.contact_endpoints, version: row.version, identityVerified: !!row.identity_verified_at });
const partyView = row => ({ id: row.id, name: row.name, kind: row.kind, personId: row.person_id, registration: row.registration, version: row.version });
const authorityView = row => ({ id: row.id, personId: row.person_id, partyId: row.represented_party_id, evidenceArtifactId: row.evidence_artifact_id,
    scope: row.scope, validFrom: row.valid_from, validUntil: row.valid_until, status: row.status, version: row.version, approvedAt: row.approved_at });

// Creation retries share the same transaction as the directory record. Results
// contain IDs only: recovery reads current scoped data, never a stale private copy.
async function createEntry(pool, scope, kind, input, key) {
    if (kind === 'authority') requireApproval(scope); else requireSend(scope);
    expect(['person','party','authority'].includes(kind) && UUID.test(key), 'INVALID_SUBMISSION');
    const requestHash = digest(input);
    const result = await transaction(pool, async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`directory:${scope.contextId}:${scope.userId}:${kind}:${key}`]);
        const previous = (await db.query(`SELECT request_hash,result FROM signing_operations WHERE owner_context_id=$1 AND actor_key=$2 AND kind=$3 AND idempotency_key=$4`,
            [scope.contextId, `user:${scope.userId}`, `directory_${kind}`, key])).rows[0];
        if (previous) { if (previous.request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT',409); return { ...previous.result, reused: true }; }
        let id;
        if (kind === 'person') {
            const endpoints={...input.endpoints};
            if(endpoints.phone) {const phone=require('./creation').normalizePhone(endpoints.phone);expect(phone,'INVALID_DELIVERY');endpoints.phone=phone;}
            if(endpoints.email)endpoints.email=String(endpoints.email).trim().toLowerCase();
            id=(await people.createPersonInTransaction(db,scope,{...input,endpoints})).person.id;
        }
        else if (kind === 'party') id = (await people.createLegalEntity(db,scope,input)).id;
        else id = (await authorities.createAuthorityInTransaction(db,scope,input)).id;
        await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state,result,completed_at)
            VALUES($1,$2,$3,$4,$5,$6,'complete',$7,clock_timestamp())`,
        [randomUUID(),scope.contextId,`user:${scope.userId}`,`directory_${kind}`,key,requestHash,{id}]);
        return {id,reused:false};
    });
    if (kind === 'person') {
        const person=await people.loadPerson(pool,scope,result.id);
        const party=(await pool.query("SELECT * FROM signing_parties WHERE owner_context_id=$1 AND person_id=$2 AND kind='person'",[scope.contextId,person.id])).rows[0];
        return { ...result, person:personView(person), party:partyView(party) };
    }
    if (kind === 'party') return { ...result, party: partyView(await loadParty(pool,scope,result.id)) };
    return { ...result, authority: authorityView(await loadAuthority(pool,scope,result.id)) };
}

async function loadParty(db,scope,id) {
    expect(UUID.test(id),'INVALID_PARTY');
    const row=(await db.query(`SELECT party.* FROM signing_parties party WHERE ${partyScopeSql()} AND party.id=$5`,[...scopeParams(scope),id])).rows[0];
    if(!row) fail('NOT_FOUND',404); return row;
}
async function loadAuthority(db,scope,id) {
    expect(UUID.test(id),'INVALID_AUTHORITY');
    const row=(await db.query(`SELECT a.* FROM signing_authorities a WHERE ${authorityScopeSql()} AND a.id=$5`,[...scopeParams(scope),id])).rows[0];
    if(!row) fail('NOT_FOUND',404);return row;
}
async function searchDirectory(db,scope,query='') {
    requireSend(scope);
    const term=String(query).trim().slice(0,100).replace(/[%_\\]/g,'\\$&');
    const found=await people.searchPeople(db,scope,query);
    const parties=(await db.query(`SELECT party.* FROM signing_parties party WHERE ${partyScopeSql()} AND party.name ILIKE $5 ORDER BY party.name,party.id LIMIT 30`,[...scopeParams(scope),`%${term}%`])).rows;
    return {people:found.map(personView),parties:parties.map(partyView),canManageAuthority:scope.authorityManage===true};
}
async function personAuthorities(db,scope,personId) {
    requireSend(scope);const person=await people.loadPerson(db,scope,personId);
    const rows=(await db.query(`SELECT a.*,to_jsonb(party) AS party_data FROM signing_authorities a JOIN signing_parties party
        ON party.owner_context_id=a.owner_context_id AND party.id=a.represented_party_id
        WHERE ${authorityScopeSql()} AND a.person_id=$5
        ORDER BY a.valid_from DESC,a.id LIMIT 100`,[...scopeParams(scope),personId])).rows;
    return {person:personView(person),parties:[...new Map(rows.map(row=>[row.party_data.id,partyView(row.party_data)])).values()],authorities:rows.map(authorityView),canManageAuthority:scope.authorityManage===true};
}
async function registerEvidence(pool,scope,fileKey,{readPdf,storage}) {
    requireApproval(scope);
    expect(typeof fileKey==='string' && fileKey.length<=1000 && fileKey.startsWith(`users/${scope.userId}/`),'INVALID_SOURCE');
    const file=await readPdf(fileKey,{maxBytes:limits.sourceBytesPerDocument});const hash=bytesHash(file.bytes);
    expect(file.sha256===hash && file.bytes.length>0 && file.bytes.length<=limits.sourceBytesPerDocument && file.geometries?.length>0 && file.geometries.length<=limits.sourcePagesPerDocument,'INVALID_SOURCE');
    const inputsHash=digest({authorityEvidence:1,contextId:scope.contextId,userId:scope.userId,hash});
    const objectKey=`signing-v2/${scope.contextId}/authorities/${inputsHash}.pdf`;
    await storage.write(objectKey,file.bytes);await storage.verify(objectKey,file.bytes.length,hash);
    await pool.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at,created_by)
        VALUES($1,$2,'authority',$3,$4,$5,$6,'ready',$7,clock_timestamp(),$8) ON CONFLICT(owner_context_id,kind,inputs_hash) DO NOTHING`,
    [randomUUID(),scope.contextId,inputsHash,hash,objectKey,file.bytes.length,{pages:file.geometries},scope.userId]);
    const row=(await pool.query("SELECT id,content_sha256,bytes FROM signing_artifacts WHERE owner_context_id=$1 AND kind='authority' AND inputs_hash=$2",[scope.contextId,inputsHash])).rows[0];
    return {id:row.id,hash:row.content_sha256,bytes:Number(row.bytes)};
}
async function evidenceFile(db,scope,id,storage) {
    requireApproval(scope);expect(UUID.test(id),'INVALID_SOURCE');
    const row=(await db.query(`SELECT artifact.* FROM signing_artifacts artifact WHERE artifact.owner_context_id=$1 AND artifact.id=$5 AND artifact.kind='authority' AND artifact.state='ready' AND ($2::boolean OR artifact.created_by=$3 OR EXISTS (SELECT 1 FROM signing_authorities a WHERE a.evidence_artifact_id=artifact.id AND ${authorityScopeSql()}))`,[...scopeParams(scope),id])).rows[0];
    if(!row)fail('NOT_FOUND',404);const bytes=await storage.read(row.object_key,Number(row.bytes));expect(bytesHash(bytes)===row.content_sha256,'ARTIFACT_HASH_MISMATCH');return {bytes};
}
async function verifyIdentity(pool,scope,id,input) {
    requireApproval(scope);precondition(input.expectedVersion);
    const identity=input.identity;
    expect(identity && /^[A-Z]{2}$/.test(identity.country) && typeof identity.type==='string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(identity.type)
        && typeof identity.value==='string' && identity.value.trim().length>0 && identity.value.length<=100,'INVALID_PERSON');
    expect(UUID.test(input.evidenceArtifactId),'INVALID_SOURCE');
    expect(typeof input.reason==='string' && input.reason.trim().length>0 && input.reason.length<=1000,'REASON_REQUIRED');
    // Retain a context-bound equality key, not a raw government identifier in
    // snapshots/events or HTTP responses. No contact-based identity inference.
    const identityKey=digest({contextId:scope.contextId,country:identity.country,type:identity.type,value:identity.value.normalize('NFC').trim()});
    return transaction(pool,async db=>{
        await people.loadPerson(db,scope,id);
        const person=(await db.query('SELECT * FROM signing_people WHERE owner_context_id=$1 AND id=$2 FOR UPDATE',[scope.contextId,id])).rows[0];
        if(person.version!==input.expectedVersion)fail('VERSION_CHANGED',412);
        const evidence=await db.query(`SELECT id FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2 AND kind='authority' AND state='ready' AND ($3::boolean OR created_by=$4)`,[scope.contextId,input.evidenceArtifactId,scope.all,scope.userId]);
        if(!evidence.rowCount)fail('NOT_FOUND',404);
        // Changing an already verified identity requires explicit correction,
        // never turning an existing person's accepted actions into someone else.
        expect(!person.identity_key || person.identity_key===identityKey,'IDENTITY_ALREADY_VERIFIED');
        const duplicate=await db.query('SELECT id FROM signing_people WHERE owner_context_id=$1 AND identity_key=$2 AND id<>$3',[scope.contextId,identityKey,id]);
        if(duplicate.rowCount)fail('IDENTITY_ALREADY_EXISTS',409);
        let changed;
        try { changed=(await db.query('UPDATE signing_people SET identity_key=$3,identity_verified_at=clock_timestamp(),version=version+1 WHERE owner_context_id=$1 AND id=$2 RETURNING *',[scope.contextId,id,identityKey])).rows[0]; }
        catch(error){if(error.code==='23505')fail('IDENTITY_ALREADY_EXISTS',409);throw error;}
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,actor_key,kind,details) VALUES($1,$2,'person_identity_reviewed',$3)`,
        [scope.contextId,`user:${scope.userId}`,{personId:id,version:changed.version,evidenceArtifactId:input.evidenceArtifactId,reason:input.reason.trim()}]);
        return personView(changed);
    });
}
module.exports={createEntry,searchDirectory,personAuthorities,registerEvidence,evidenceFile,verifyIdentity,personView,partyView,authorityView,loadParty,loadAuthority};
