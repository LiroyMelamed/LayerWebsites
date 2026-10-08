const { randomUUID, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { bytesHash } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { grantSeconds } = require('../../lib/signingV2/limits');

// The private token is recoverable only by the delivery service. Public lookups
// use its hash. Neither a token nor its ciphertext belongs in client DTOs/logs.
function createGrantService({ encryptionKey, keyId = '1' }) {
    expect(Buffer.isBuffer(encryptionKey) && encryptionKey.length === 32, 'GRANT_KEY_REQUIRED');
    expect(typeof keyId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(keyId), 'GRANT_KEY_REQUIRED');
    const key = Buffer.from(encryptionKey);
    const aad = grant => Buffer.from(`${grant.owner_context_id}:${grant.id}:${grant.person_id}:${grant.purpose}`);
    function seal(token,grant) {
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',key,iv);
        cipher.setAAD(aad(grant));
        const encrypted = Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
        return { version:1,keyId,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64') };
    }
    function tokenForDelivery(grant) {
        const value = grant.encrypted_token;
        expect(value?.version === 1 && value.keyId === keyId, 'GRANT_KEY_UNAVAILABLE');
        let token;
        try {
            const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));
            decipher.setAAD(aad(grant));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
            token=Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8');
        } catch { fail('GRANT_TOKEN_UNAVAILABLE'); }
        expect(bytesHash(Buffer.from(token)) === grant.token_hash, 'GRANT_TOKEN_UNAVAILABLE');
        return token;
    }

    // A person who takes part in several packages of one run shares a single
    // grant for all of them, so one link and one invitation cover the run.
    async function sharedGrant(db,revision,profile,submissionId) {
        const token=randomBytes(32).toString('base64url');
        const grant={id:randomUUID(),owner_context_id:revision.owner_context_id,person_id:profile.person_id,purpose:'sign',
            token_hash:bytesHash(Buffer.from(token))};
        grant.encrypted_token=seal(token,grant);
        await db.query(`INSERT INTO signing_public_grants(id,owner_context_id,person_id,purpose,token_hash,encrypted_token,expires_at,submission_id)
            VALUES($1,$2,$3,'sign',$4,$5,LEAST(clock_timestamp()+make_interval(secs=>$6),COALESCE($7::timestamptz,'infinity')),$8)
            ON CONFLICT (owner_context_id,submission_id,person_id,purpose) WHERE submission_id IS NOT NULL AND revoked_at IS NULL DO NOTHING`,
        [grant.id,grant.owner_context_id,grant.person_id,grant.token_hash,grant.encrypted_token,grantSeconds,revision.deadline,submissionId]);
        return (await db.query(`SELECT id FROM signing_public_grants WHERE owner_context_id=$1 AND submission_id=$2 AND person_id=$3
            AND purpose='sign' AND revoked_at IS NULL`,[grant.owner_context_id,submissionId,grant.person_id])).rows[0].id;
    }

    async function issueRevisionGrants(db,revision,documents) {
        const profiles=(await db.query(`SELECT dp.*,pk.submission_id,(SELECT count(DISTINCT other.id) FROM signing_participations op
                JOIN signing_package_revisions other ON other.owner_context_id=op.owner_context_id AND other.id=op.revision_id
                JOIN signing_packages opk ON opk.owner_context_id=other.owner_context_id AND opk.id=other.package_id AND opk.active_revision_id=other.id
                WHERE op.owner_context_id=dp.owner_context_id AND op.person_id=dp.person_id AND opk.submission_id=pk.submission_id) AS run_packages
            FROM signing_delivery_profiles dp
            JOIN signing_package_revisions r ON r.owner_context_id=dp.owner_context_id AND r.id=dp.revision_id
            JOIN signing_packages pk ON pk.owner_context_id=r.owner_context_id AND pk.id=r.package_id
            WHERE dp.owner_context_id=$1 AND dp.revision_id=$2 ORDER BY dp.id`,
        [revision.owner_context_id,revision.id])).rows;
        const grants=[],items=[],links=[];
        for(const profile of profiles) {
            let grantId;
            if(profile.submission_id && Number(profile.run_packages)>1) {
                grantId=await sharedGrant(db,revision,profile,profile.submission_id);
            } else {
                const token=randomBytes(32).toString('base64url');
                const grant={id:randomUUID(),owner_context_id:revision.owner_context_id,person_id:profile.person_id,purpose:'sign',
                    token_hash:bytesHash(Buffer.from(token))};
                grant.encrypted_token=seal(token,grant);grants.push(grant);grantId=grant.id;
            }
            links.push({id:grantId,profile_id:profile.id});
            for(const source of revision.snapshot.documents.filter(doc=>doc.readPersonIds.includes(profile.person_id))) {
                const document=documents.find(doc=>doc.document_key===source.key);
                expect(document,'PREFLIGHT_MISMATCH');
                items.push({grant_id:grantId,person_id:profile.person_id,document_id:document.id,
                    delivery_profile_id:profile.id,delivery_profile_version:profile.version});
            }
            expect(items.some(item=>item.grant_id===grantId && item.delivery_profile_id===profile.id),'EMPTY_GRANT');
        }
        await db.query(`INSERT INTO signing_public_grants(id,owner_context_id,person_id,purpose,token_hash,encrypted_token,expires_at)
            SELECT id,$1,person_id,'sign',token_hash,encrypted_token,LEAST(clock_timestamp()+make_interval(secs=>$3),COALESCE($4::timestamptz,'infinity'))
            FROM jsonb_to_recordset($2::jsonb) AS g(id uuid,person_id uuid,token_hash text,encrypted_token jsonb)`,
        [revision.owner_context_id,JSON.stringify(grants),grantSeconds,revision.deadline]);
        await db.query(`INSERT INTO signing_grant_items(owner_context_id,grant_id,person_id,document_id,revision_id,delivery_profile_id,delivery_profile_version)
            SELECT $1,grant_id,person_id,document_id,$2,delivery_profile_id,delivery_profile_version
            FROM jsonb_to_recordset($3::jsonb) AS i(grant_id uuid,person_id uuid,document_id uuid,delivery_profile_id uuid,delivery_profile_version integer)`,
        [revision.owner_context_id,revision.id,JSON.stringify(items)]);
        await db.query(`UPDATE signing_deliveries d SET grant_id=g.id FROM jsonb_to_recordset($2::jsonb) AS g(id uuid,profile_id uuid)
            WHERE d.owner_context_id=$1 AND d.profile_id=g.profile_id AND d.state='pending' AND d.purpose='invitation' AND d.grant_id IS NULL`,
        [revision.owner_context_id,JSON.stringify(links)]);
        return {grantCount:new Set(links.map(link=>link.id)).size};
    }
    // Issued only by the fenced delivery worker after checking exact final
    // artifacts and profile version. No submission-wide aggregation for copies.
    async function issueDownloadGrant(db, { contextId, revisionId, personId, profileId, profileVersion, documents }) {
        expect(documents.length > 0, 'EMPTY_GRANT');
        const token = randomBytes(32).toString('base64url');
        const grant = { id: randomUUID(), owner_context_id: contextId, person_id: personId, purpose: 'download',
            token_hash: bytesHash(Buffer.from(token)) };
        grant.encrypted_token = seal(token, grant);
        await db.query(`INSERT INTO signing_public_grants(id,owner_context_id,person_id,purpose,token_hash,encrypted_token,expires_at)
            VALUES($1,$2,$3,'download',$4,$5,clock_timestamp()+make_interval(secs=>$6))`,
        [grant.id, contextId, personId, grant.token_hash, grant.encrypted_token, grantSeconds]);
        await db.query(`INSERT INTO signing_grant_items(owner_context_id,grant_id,person_id,document_id,revision_id,delivery_profile_id,delivery_profile_version)
            SELECT $1,$2,$3,unnest($4::uuid[]),$5,$6,$7`,
        [contextId, grant.id, personId, documents.map(document => document.documentId), revisionId, profileId, profileVersion]);
        return grant;
    }
    // A reviewed follow-up never reuses the broader invitation of a shared person.
    // Its task list cannot grow when another stage or another package becomes ready.
    async function issueFollowupGrant(db, { contextId, revisionId, personId, profileId, profileVersion, tasks, deadline }) {
        expect(tasks.length > 0, 'EMPTY_GRANT');
        const token = randomBytes(32).toString('base64url');
        const grant = { id: randomUUID(),owner_context_id: contextId,person_id: personId,purpose:'sign',token_hash:bytesHash(Buffer.from(token)) };
        grant.encrypted_token = seal(token,grant);
        await db.query(`INSERT INTO signing_public_grants(id,owner_context_id,person_id,purpose,token_hash,encrypted_token,expires_at,allowed_task_ids)
            VALUES($1,$2,$3,'sign',$4,$5,LEAST(clock_timestamp()+make_interval(secs=>$6),COALESCE($7::timestamptz,'infinity')),$8)`,
        [grant.id,contextId,personId,grant.token_hash,grant.encrypted_token,grantSeconds,deadline,tasks.map(task=>task.taskId)]);
        await db.query(`INSERT INTO signing_grant_items(owner_context_id,grant_id,person_id,document_id,revision_id,delivery_profile_id,delivery_profile_version)
            SELECT $1,$2,$3,unnest($4::uuid[]),$5,$6,$7`,
        [contextId,grant.id,personId,[...new Set(tasks.map(task=>task.documentId))],revisionId,profileId,profileVersion]);
        return grant;
    }
    async function issueBulkGrant(db,{contextId,personId,purpose,items}) {
        expect(items.length>0 && ['sign','download'].includes(purpose) && items.every(item=>item.personId===personId),'EMPTY_GRANT');
        const tasks=[...new Set(items.flatMap(item=>item.tasks.map(task=>task.taskId)))];
        expect(purpose==='download' || tasks.length>0,'EMPTY_GRANT');
        const documents=items.flatMap(item=>[...new Set((purpose==='download'?item.documents:item.tasks).map(doc=>doc.documentId))]
            .map(documentId=>({documentId,revisionId:item.revisionId,profileId:item.profileId,profileVersion:item.profileVersion})));
        expect(documents.length>0,'EMPTY_GRANT');
        const token=randomBytes(32).toString('base64url');
        const grant={id:randomUUID(),owner_context_id:contextId,person_id:personId,purpose,token_hash:bytesHash(Buffer.from(token))};
        grant.encrypted_token=seal(token,grant);
        const deadlines=purpose==='sign'?items.map(item=>item.deadline).filter(Boolean).map(value=>Date.parse(value)):[];
        const deadline=deadlines.length?new Date(Math.min(...deadlines)).toISOString():null;
        await db.query(`INSERT INTO signing_public_grants(id,owner_context_id,person_id,purpose,token_hash,encrypted_token,expires_at,allowed_task_ids)
            VALUES($1,$2,$3,$4,$5,$6,LEAST(clock_timestamp()+make_interval(secs=>$7),COALESCE($8::timestamptz,'infinity')),$9)`,
            [grant.id,contextId,personId,purpose,grant.token_hash,grant.encrypted_token,grantSeconds,deadline,purpose==='sign'?tasks:null]);
        await db.query(`INSERT INTO signing_grant_items(owner_context_id,grant_id,person_id,document_id,revision_id,delivery_profile_id,delivery_profile_version)
            SELECT $1,$2,$3,(v->>'documentId')::uuid,(v->>'revisionId')::uuid,(v->>'profileId')::uuid,(v->>'profileVersion')::integer
            FROM jsonb_array_elements($4::jsonb) v`,[contextId,grant.id,personId,JSON.stringify(documents)]);
        return grant;
    }
    return { issueRevisionGrants, tokenForDelivery, issueDownloadGrant, issueFollowupGrant, issueBulkGrant };
}

async function loadPublicGrant(db,token,{purpose='sign'}={}) {
    if(typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail('LINK_UNAVAILABLE',404);
    const result=await db.query(`SELECT id,owner_context_id,person_id,purpose,expires_at,allowed_task_ids FROM signing_public_grants
        WHERE token_hash=$1 AND purpose=ANY($2::text[]) AND revoked_at IS NULL AND expires_at > clock_timestamp()`,[bytesHash(Buffer.from(token)),Array.isArray(purpose) ? purpose : [purpose]]);
    if(!result.rowCount) fail('LINK_UNAVAILABLE',404);
    const grant=result.rows[0];
    const items=(await db.query(`SELECT i.* FROM signing_grant_items i
        JOIN signing_delivery_profiles dp ON dp.owner_context_id=i.owner_context_id AND dp.id=i.delivery_profile_id
        JOIN signing_package_revisions r ON r.owner_context_id=i.owner_context_id AND r.id=i.revision_id
        JOIN signing_packages p ON p.owner_context_id=r.owner_context_id AND p.id=r.package_id
        WHERE i.owner_context_id=$1 AND i.grant_id=$2 AND i.person_id=$3 AND dp.version=i.delivery_profile_version
        AND p.active_revision_id=r.id AND r.workflow_state IN ('active','attention','complete')
        AND (($4='sign' AND (r.deadline IS NULL OR r.deadline > clock_timestamp()))
            OR ($4='download' AND r.workflow_state='complete' AND EXISTS (SELECT 1 FROM signing_documents d
                JOIN signing_artifacts a ON a.owner_context_id=d.owner_context_id AND a.id=d.final_artifact_id AND a.state='ready'
                WHERE d.owner_context_id=i.owner_context_id AND d.id=i.document_id AND d.state='final')))
        ORDER BY i.document_id`,[grant.owner_context_id,grant.id,grant.person_id,grant.purpose])).rows;
    if(!items.length) fail('LINK_UNAVAILABLE',404);
    return {...grant,items};
}

module.exports={createGrantService,loadPublicGrant};
