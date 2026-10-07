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

    async function issueRevisionGrants(db,revision,documents) {
        const profiles=(await db.query(`SELECT * FROM signing_delivery_profiles WHERE owner_context_id=$1 AND revision_id=$2 ORDER BY id`,
            [revision.owner_context_id,revision.id])).rows;
        const grants=[],items=[];
        for(const profile of profiles) {
            const token=randomBytes(32).toString('base64url');
            const grant={id:randomUUID(),owner_context_id:revision.owner_context_id,person_id:profile.person_id,purpose:'sign',
                token_hash:bytesHash(Buffer.from(token)),profile_id:profile.id};
            grant.encrypted_token=seal(token,grant);grants.push(grant);
            for(const source of revision.snapshot.documents.filter(doc=>doc.readPersonIds.includes(profile.person_id))) {
                const document=documents.find(doc=>doc.document_key===source.key);
                expect(document,'PREFLIGHT_MISMATCH');
                items.push({grant_id:grant.id,person_id:profile.person_id,document_id:document.id,
                    delivery_profile_id:profile.id,delivery_profile_version:profile.version});
            }
            expect(items.some(item=>item.grant_id===grant.id),'EMPTY_GRANT');
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
        [revision.owner_context_id,JSON.stringify(grants)]);
        return {grantCount:grants.length};
    }
    return { issueRevisionGrants,tokenForDelivery };
}

async function loadPublicGrant(db,token,{purpose='sign'}={}) {
    if(typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail('LINK_UNAVAILABLE',404);
    const result=await db.query(`SELECT id,owner_context_id,person_id,purpose,expires_at FROM signing_public_grants
        WHERE token_hash=$1 AND purpose=$2 AND revoked_at IS NULL AND expires_at > clock_timestamp()`,[bytesHash(Buffer.from(token)),purpose]);
    if(!result.rowCount) fail('LINK_UNAVAILABLE',404);
    const grant=result.rows[0];
    const items=(await db.query(`SELECT i.* FROM signing_grant_items i
        JOIN signing_delivery_profiles dp ON dp.owner_context_id=i.owner_context_id AND dp.id=i.delivery_profile_id
        JOIN signing_package_revisions r ON r.owner_context_id=i.owner_context_id AND r.id=i.revision_id
        JOIN signing_packages p ON p.owner_context_id=r.owner_context_id AND p.id=r.package_id
        WHERE i.owner_context_id=$1 AND i.grant_id=$2 AND i.person_id=$3 AND dp.version=i.delivery_profile_version
        AND p.active_revision_id=r.id AND r.workflow_state IN ('active','attention','complete')
        AND (r.deadline IS NULL OR r.deadline > clock_timestamp()) ORDER BY i.document_id`,[grant.owner_context_id,grant.id,grant.person_id])).rows;
    if(!items.length) fail('LINK_UNAVAILABLE',404);
    return {...grant,items};
}

module.exports={createGrantService,loadPublicGrant};
