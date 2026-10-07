const { randomUUID } = require('node:crypto');
const { digest } = require('../../lib/signingV2/canonical');
const { validateDefinition, compilePackage } = require('../../lib/signingV2/compiler');

function compilerFixture({ documentCount = 3 } = {}) {
    const personId = randomUUID(), partyId = randomUUID(), sourceId = randomUUID();
    const sourceHash = 'a'.repeat(64);
    const directory = {
        people: new Map([[personId, { id: personId, name: 'עובד בדיקה / موظف تجريبي', identity_key: 'synthetic-person-1' }]]),
        parties: new Map([[partyId, { id: partyId, name: 'Synthetic person', kind: 'person', person_id: personId }]]),
        authorities: new Map(),
        sources: new Map([[sourceId, { id: sourceId, kind: 'source', content_sha256: sourceHash, state: 'ready', bytes: 2048, metadata: { pages: [{ width: 595, height: 842 }] } }]]),
    };
    const definition = validateDefinition({ schemaVersion: 2, name: 'Employee pack', locale: 'he',
        dataKeys: [{ key: 'employeeId', type: 'identifier', required: true }, { key: 'salary', type: 'decimal', required: false }],
        stages: [{ key: 'employee', label: 'Employee', after: null }],
        roles: [{ key: 'employee', label: 'Employee', capacity: 'personal', min: 1, max: 1, stage: 0 }],
        signingRules: [{ type: 'specific', roles: [{ key: 'employee', occurrence: 0 }] }],
        policy: { otpRequired: true, deliveryMode: 'invite' },
        documents: Array.from({ length: documentCount }, (_, index) => ({ key: `document${index}`, name: `Document ${index + 1}`,
            sourceArtifactId: sourceId, sourceHash,
            fields: [
                { id: 'employeeId', type: 'data', dataKey: 'employeeId', pageNum: 1, x: 30, y: 30, width: 200, height: 40, fontSize: 14, overflow: 'block' },
                { id: 'signature', type: 'signature', roleKey: 'employee', occurrence: 0, pageNum: 1, x: 30, y: 100, width: 200, height: 60, required: true },
            ] })),
    });
    const input = { externalKey: 'employee-1', data: { employeeId: '000012345' },
        roles: { employee: [{ personId, partyId }] },
        delivery: { [personId]: { locale: 'he', channels: ['email'], email: 'employee@example.invalid' } } };
    return { definition, directory, input, personId, partyId, sourceId };
}

async function databaseFixture(pool, { packageCount = 1, documentCount = 3, sourceBytes } = {}) {
    const fixture = compilerFixture({ documentCount });
    if (sourceBytes) {
        const { PDFDocument } = require('pdf-lib');
        const { pageGeometryFromPdfLibPage } = require('../../lib/signingGeometry');
        const { bytesHash } = require('../../lib/signingV2/canonical');
        const pdf = await PDFDocument.load(sourceBytes);
        const source = fixture.directory.sources.get(fixture.sourceId);
        source.content_sha256 = bytesHash(sourceBytes); source.bytes = sourceBytes.length;
        source.metadata.pages = pdf.getPages().map(page => {
            const geometry = pageGeometryFromPdfLibPage(page);
            return { width: geometry.visualWidth, height: geometry.visualHeight };
        });
        const definition = JSON.parse(JSON.stringify(fixture.definition));
        definition.documents.forEach(document => { document.sourceHash = source.content_sha256; });
        fixture.definition = validateDefinition(definition);
    }
    const contextId = randomUUID(), templateId = randomUUID(), versionId = randomUUID();
    const user = (await pool.query(`INSERT INTO users(name,email,role,passwordhash) VALUES($1,$2,'Admin','synthetic-only') RETURNING userid`,
        ['Synthetic v2 owner', `${randomUUID()}@example.invalid`])).rows[0];
    await pool.query(`INSERT INTO signing_owner_contexts(id,deployment_key,scope_key) VALUES($1,$2,'dedicated')`, [contextId, `qa-${randomUUID()}.invalid`]);
    const packages = [];
    const people = [], parties = [];
    for (let index = 0; index < packageCount; index += 1) {
        const personId = randomUUID(), partyId = randomUUID();
        people.push({ id: personId, name: `Synthetic employee ${index}`, identity_key: `${contextId}-${index}` });
        parties.push({ id: partyId, person_id: personId, name: `Employee ${index}` });
        packages.push({ externalKey: `employee-${index}`, data: { employeeId: String(index).padStart(9, '0') },
            roles: { employee: [{ personId, partyId }] },
            // Deliberately shared contact. It must never merge people or grants.
            delivery: { [personId]: { locale: ['he', 'ar', 'en'][index % 3], channels: ['email'], email: 'synthetic-shared@example.invalid' } } });
    }
    await pool.query(`INSERT INTO signing_people(id,owner_context_id,name,identity_key,identity_verified_at)
        SELECT id,$1,name,identity_key,now() FROM jsonb_to_recordset($2::jsonb) AS p(id uuid,name text,identity_key text)`, [contextId, JSON.stringify(people)]);
    await pool.query(`INSERT INTO signing_parties(id,owner_context_id,kind,person_id,name)
        SELECT id,$1,'person',person_id,name FROM jsonb_to_recordset($2::jsonb) AS p(id uuid,person_id uuid,name text)`, [contextId, JSON.stringify(parties)]);
    const source = fixture.directory.sources.get(fixture.sourceId);
    await pool.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at)
        VALUES($1,$2,'source',$3,$3,$4,$5,'ready',$6,now())`,
    [source.id, contextId, source.content_sha256, `synthetic/${contextId}/source.pdf`, source.bytes, source.metadata]);
    await pool.query(`INSERT INTO signing_templates(id,owner_context_id,owner_userid,name,definition)
        VALUES($1,$2,$3,$4,$5)`, [templateId, contextId, user.userid, fixture.definition.name, fixture.definition]);
    const definitionHash = digest(fixture.definition);
    await pool.query(`INSERT INTO signing_template_versions(id,owner_context_id,template_id,version,state,definition,definition_hash,created_by,published_by,published_at)
        VALUES($1,$2,$3,1,'published',$4,$5,$6,$6,now())`, [versionId, contextId, templateId, fixture.definition, definitionHash, user.userid]);
    const directory = { ...fixture.directory, people: new Map(people.map(person => [person.id, person])),
        parties: new Map(parties.map(party => [party.id, { ...party, kind: 'person' }])) };
    const revisionHashes = packages.map(item => compilePackage(fixture.definition, item, directory).hash);
    const input = { name: 'Synthetic capacity', templateVersionId: versionId, idempotencyKey: randomUUID(), packages,
        previewHash: digest({ templateVersionId: versionId, definitionHash, packages, revisionHashes }) };
    return { ...fixture, contextId, templateId, versionId, input,
        scope: { contextId, userId: user.userid, tenantId: null, all: true, assignedCases: false, caseView: true, caseAll: true } };
}

module.exports = { compilerFixture, databaseFixture };
