const { createHash, randomUUID } = require('node:crypto');
const { validateDefinition, compilePackage, admission, UUID, LOCALES } = require('../../lib/signingV2/compiler');
const { digest } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const limits = require('../../lib/signingV2/limits');
const { transaction } = require('./transaction');
const { validateSources } = require('./templates');
const { createSubmission, loadDirectory, previewHash } = require('./submissions');
const { loadPerson } = require('./people');

const LEGACY_FIELD_TYPES = { signature: 'signature', initials: 'initials', text: 'text', date: 'date', checkbox: 'checkbox', number: 'text' };
const CHANNELS = { email: ['email'], sms: ['sms'], both: ['email', 'sms'] };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Retrying the same request must reuse the same people; a different request never collides.
function stableUuid(...parts) {
    const hex = createHash('sha256').update(parts.join('\u0000')).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function normalizePhone(value) {
    const digits = String(value || '').replace(/[\s().-]/g, '');
    if (!digits) return null;
    if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
    if (/^0[2-9]\d{7,8}$/.test(digits)) return `+972${digits.slice(1)}`;
    return undefined;
}

async function loadVersion(db, scope, versionId) {
    expect(UUID.test(versionId), 'INVALID_TEMPLATE');
    const result = await db.query(`SELECT v.*,t.name AS template_name FROM signing_template_versions v
        JOIN signing_templates t ON t.owner_context_id=v.owner_context_id AND t.id=v.template_id
        WHERE v.owner_context_id=$1 AND v.id=$2 AND v.state='published' AND NOT t.archived AND ($3::boolean OR t.owner_userid=$4)`,
    [scope.contextId, versionId, scope.all, scope.userId]);
    if (!result.rowCount) fail('NOT_FOUND', 404);
    const template = result.rows[0];
    const definition = validateDefinition(template.definition);
    expect(digest(definition) === template.definition_hash, 'TEMPLATE_CHANGED');
    const sourceIds = [...new Set(definition.documents.map(document => document.sourceArtifactId))];
    const sources = (await db.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=ANY($2::uuid[])`, [scope.contextId, sourceIds])).rows;
    return { template, definition, sources: new Map(sources.map(source => [source.id, source])) };
}

function roleSummary(definition) {
    return definition.roles.map(role => ({ key: role.key, label: role.label, audience: role.audience === 'shared' ? 'shared' : 'each', stage: role.stage }));
}

async function listTemplates(db, scope) {
    const current = (await db.query(`SELECT t.id AS template_id,t.name,v.id AS version_id,v.version,v.definition,v.published_at
        FROM signing_templates t JOIN LATERAL (SELECT * FROM signing_template_versions v WHERE v.owner_context_id=t.owner_context_id
            AND v.template_id=t.id AND v.state='published' ORDER BY v.version DESC LIMIT 1) v ON TRUE
        WHERE t.owner_context_id=$1 AND NOT t.archived AND ($2::boolean OR t.owner_userid=$3) ORDER BY t.name,t.id`,
    [scope.contextId, scope.all, scope.userId])).rows;
    const imported = new Set(current.map(row => row.definition.origin?.templateId && `${row.definition.origin.templateId}:${row.definition.origin.version}`).filter(Boolean));
    const legacy = (await db.query(`SELECT id,name,version,definition FROM signing_templates t WHERE t.owner_context_id IS NULL
        AND COALESCE(t.definition->>'schemaVersion','1')='1' AND NOT t.archived
        AND t.law_firm_tenant_id IS NOT DISTINCT FROM $1::uuid AND ($2::boolean OR t.owner_userid=$3) ORDER BY t.name,t.id`,
    [scope.tenantId, scope.all, scope.userId])).rows;
    return {
        templates: current.map(row => ({ templateId: row.template_id, versionId: row.version_id, name: row.name, version: row.version,
            publishedAt: row.published_at, documentCount: row.definition.documents.length, roles: roleSummary(row.definition),
            origin: row.definition.origin || null })),
        legacy: legacy.filter(row => !imported.has(`${row.id}:${row.version}`)).map(row => ({ id: row.id, name: row.name, version: row.version,
            documentCount: row.definition.documents?.length || 0,
            roles: (row.definition.roles || []).map(role => ({ label: role.name, audience: role.kind === 'shared' || role.kind === 'lawyer' ? 'shared' : 'each' })) })),
    };
}

function convertLegacy(legacy, sources, locale) {
    const used = new Set();
    const keyFor = new Map(legacy.definition.roles.map(role => {
        let key = String(role.id).replace(/[^a-zA-Z0-9_]/g, '_');
        if (!/^[a-z]/.test(key)) key = `r${key}`;
        key = key.slice(0, 60);
        let candidate = key;
        for (let index = 1; used.has(candidate); index += 1) candidate = `${key}${index}`;
        used.add(candidate);
        return [role.id, candidate];
    }));
    const sequential = legacy.definition.signingOrder === 'sequential';
    const roles = legacy.definition.roles.map((role, index) => ({ key: keyFor.get(role.id), label: role.name,
        capacity: role.kind === 'lawyer' ? 'professional' : 'personal', min: 1, max: 1, stage: sequential ? index : 0,
        audience: role.kind === 'shared' || role.kind === 'lawyer' ? 'shared' : 'each' }));
    const stages = sequential
        ? roles.map((role, index) => ({ key: `s${index + 1}`, label: role.label, after: index ? `s${index}` : null }))
        : [{ key: 's1', label: legacy.name, after: null }];
    return { schemaVersion: 2, name: legacy.name, locale,
        origin: { kind: 'legacy_template', templateId: legacy.id, version: legacy.version },
        dataKeys: [], stages, roles, signingRules: [],
        // v2 has no OTP waiver: an imported template is never weaker than the v1 default.
        policy: { otpRequired: true, deliveryMode: 'invite' },
        documents: sources.map(({ document, artifactId, sha256 }, index) => ({ key: `d${index + 1}`, name: document.name,
            sourceArtifactId: artifactId, sourceHash: sha256,
            fields: document.fields.map((field, fieldIndex) => ({ id: `f${fieldIndex + 1}`, type: LEGACY_FIELD_TYPES[field.fieldType],
                roleKey: keyFor.get(field.roleId), occurrence: 0, pageNum: field.pageNum,
                x: field.x, y: field.y, width: field.width, height: field.height, required: field.isRequired !== false,
                ...(field.fieldLabel ? { label: field.fieldLabel } : {}) })) })) };
}

async function findImport(db, scope, legacyId, version) {
    return (await db.query(`SELECT t.id AS "templateId",v.id AS "versionId" FROM signing_templates t
        JOIN signing_template_versions v ON v.owner_context_id=t.owner_context_id AND v.template_id=t.id AND v.state='published'
        WHERE t.owner_context_id=$1 AND NOT t.archived AND t.definition->'origin'->>'templateId'=$2 AND (t.definition->'origin'->>'version')::integer=$3
        ORDER BY v.version DESC LIMIT 1`, [scope.contextId, legacyId, version])).rows[0] || null;
}

async function importLegacyTemplate(pool, scope, legacyId, { storage, readPdf, locale = 'he' }) {
    expect(UUID.test(legacyId) && LOCALES.has(locale), 'INVALID_TEMPLATE');
    const legacy = (await pool.query(`SELECT * FROM signing_templates t WHERE t.id=$1 AND t.owner_context_id IS NULL
        AND COALESCE(t.definition->>'schemaVersion','1')='1' AND NOT t.archived
        AND t.law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid AND ($3::boolean OR t.owner_userid=$4)`,
    [legacyId, scope.tenantId, scope.all, scope.userId])).rows[0];
    if (!legacy) fail('NOT_FOUND', 404);
    const existing = await findImport(pool, scope, legacy.id, legacy.version);
    if (existing) return { ...existing, reused: true };
    // Object keys are content addressed, so a retry after a crash rewrites identical bytes and the database row decides.
    const files = [];
    for (const document of legacy.definition.documents) {
        const file = await readPdf(document.fileKey);
        if (document.sha256 && file.sha256 !== document.sha256) fail('SOURCE_CHANGED', 409);
        const key = `signing-v2/${scope.contextId}/sources/${file.sha256}.pdf`;
        await storage.write(key, file.bytes, { contentType: 'application/pdf', sha256: file.sha256 });
        await storage.verify(key, file.bytes.length, file.sha256);
        files.push({ document, key, sha256: file.sha256, bytes: file.bytes.length, pages: file.geometries });
    }
    return transaction(pool, async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`signing-v2-import:${scope.contextId}:${legacy.id}`]);
        const again = await findImport(db, scope, legacy.id, legacy.version);
        if (again) return { ...again, reused: true };
        const sources = [];
        for (const file of files) {
            await db.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at,created_by)
                VALUES($1,$2,'source',$3,$3,$4,$5,'ready',$6,clock_timestamp(),$7) ON CONFLICT(owner_context_id,kind,inputs_hash) DO NOTHING`,
            [randomUUID(), scope.contextId, file.sha256, file.key, file.bytes, { pages: file.pages }, scope.userId]);
            const artifact = (await db.query(`SELECT id FROM signing_artifacts WHERE owner_context_id=$1 AND kind='source' AND inputs_hash=$2 AND state='ready'`,
                [scope.contextId, file.sha256])).rows[0];
            expect(artifact, 'INVALID_SOURCE');
            sources.push({ ...file, artifactId: artifact.id });
        }
        const definition = validateDefinition(convertLegacy(legacy, sources, locale));
        await validateSources(db, scope, definition);
        const templateId = randomUUID(), versionId = randomUUID();
        await db.query(`INSERT INTO signing_templates(id,owner_context_id,law_firm_tenant_id,owner_userid,name,definition)
            VALUES($1,$2,$3,$4,$5,$6)`, [templateId, scope.contextId, scope.tenantId, scope.userId, definition.name, definition]);
        await db.query(`INSERT INTO signing_template_versions(id,owner_context_id,template_id,version,state,definition,definition_hash,created_by,published_by,published_at)
            VALUES($1,$2,$3,1,'published',$4,$5,$6,$6,clock_timestamp())`, [versionId, scope.contextId, templateId, definition, digest(definition), scope.userId]);
        return { templateId, versionId, reused: false };
    });
}

function recipient(input, definition, path, errors) {
    const value = input || {};
    const name = typeof value.name === 'string' ? value.name.normalize('NFC').trim() : '';
    if (!name || name.length > 300) errors.push({ path: `${path}.name`, code: 'NAME_REQUIRED' });
    const email = typeof value.email === 'string' && value.email.trim() ? value.email.trim().toLowerCase() : null;
    if (email && (email.length > 254 || !EMAIL.test(email))) errors.push({ path: `${path}.email`, code: 'INVALID_EMAIL' });
    const phone = normalizePhone(value.phone);
    if (phone === undefined) errors.push({ path: `${path}.phone`, code: 'INVALID_PHONE' });
    const channels = CHANNELS[value.channel || (email ? 'email' : 'sms')];
    if (!channels) errors.push({ path: `${path}.channel`, code: 'INVALID_CHANNEL' });
    else {
        if (channels.includes('email') && !email) errors.push({ path: `${path}.email`, code: 'EMAIL_REQUIRED' });
        if (channels.includes('sms') && !phone) errors.push({ path: `${path}.phone`, code: 'PHONE_REQUIRED' });
    }
    const locale = value.locale || definition.locale;
    if (!LOCALES.has(locale)) errors.push({ path: `${path}.locale`, code: 'INVALID_LOCALE' });
    return { name, email, phone: phone || null, channels: channels || [], locale,
        ...(value.personId ? { personId: String(value.personId) } : {}) };
}

function normalize(definition, input) {
    const errors = [];
    expect(typeof input.name === 'string' && input.name.trim().length > 0 && input.name.length <= 300, 'INVALID_SUBMISSION');
    expect(Array.isArray(input.rows) && input.rows.length > 0, 'INVALID_SUBMISSION');
    expect(input.rows.length <= limits.packages, 'CAPACITY_BUDGET_EXCEEDED');
    const shared = {}, each = definition.roles.filter(role => role.audience !== 'shared');
    for (const role of definition.roles.filter(item => item.audience === 'shared')) {
        shared[role.key] = recipient(input.shared?.[role.key], definition, `shared.${role.key}`, errors);
        if (shared[role.key].personId) expect(UUID.test(shared[role.key].personId), 'INVALID_PERSON');
    }
    const keys = new Set();
    const rows = input.rows.map((row, index) => {
        const key = typeof row?.key === 'string' && row.key.trim() ? row.key.trim().slice(0, 200) : `row-${index + 1}`;
        if (keys.has(key)) errors.push({ path: `rows.${index}.key`, code: 'DUPLICATE_ROW_KEY' });
        keys.add(key);
        return { key, recipients: Object.fromEntries(each.map(role => [role.key, recipient(row?.recipients?.[role.key], definition, `rows.${index}.${role.key}`, errors)])) };
    });
    return { name: input.name.trim(), shared, rows, errors };
}

function packagesFor(definition, plan, personFor) {
    return plan.rows.map((row, index) => {
        const roles = {}, delivery = {};
        for (const role of definition.roles) {
            const person = role.audience === 'shared' ? plan.shared[role.key] : row.recipients[role.key];
            const ids = personFor(role, person, index);
            roles[role.key] = [{ personId: ids.personId, partyId: ids.partyId }];
            delivery[ids.personId] = { locale: person.locale, channels: person.channels, ...(person.email ? { email: person.email } : {}), ...(person.phone ? { phone: person.phone } : {}) };
        }
        return { externalKey: row.key, data: {}, roles, delivery };
    });
}

function rowsHash(template, plan) {
    return digest({ templateVersionId: template.id, definitionHash: template.definition_hash, name: plan.name, shared: plan.shared, rows: plan.rows });
}

async function previewCreation(pool, scope, input) {
    const { template, definition, sources } = await loadVersion(pool, scope, input.templateVersionId);
    const plan = normalize(definition, input);
    const people = new Map(), parties = new Map();
    const personFor = (role, person, index) => {
        const personId = person.personId || stableUuid('preview', role.audience === 'shared' ? role.key : `${index}:${role.key}`);
        const partyId = stableUuid('preview-party', personId);
        people.set(personId, { id: personId, name: person.name || '-', identity_key: null });
        parties.set(partyId, { id: partyId, kind: 'person', person_id: personId, name: person.name || '-' });
        return { personId, partyId };
    };
    const packages = packagesFor(definition, plan, personFor);
    const directory = { people, parties, authorities: new Map(), sources };
    const compiled = [];
    if (!plan.errors.length) packages.forEach((item, index) => {
        try { compiled.push(compilePackage(definition, item, directory)); }
        catch (error) { plan.errors.push({ path: `rows.${index}`, code: error.errorCode || 'INVALID_ROW', detail: error.extras?.fieldErrors?.[0]?.path }); }
    });
    let capacity = null;
    if (!plan.errors.length) {
        try { capacity = admission(compiled); } catch { plan.errors.push({ path: 'rows', code: 'CAPACITY_BUDGET_EXCEEDED' }); }
    }
    return {
        valid: plan.errors.length === 0, errors: plan.errors.slice(0, 200), errorCount: plan.errors.length,
        previewHash: plan.errors.length ? null : rowsHash(template, plan),
        packageCount: plan.rows.length,
        documentCount: capacity?.documents ?? null,
        recipientCount: new Set(plan.rows.flatMap(row => Object.values(row.recipients).map(person => `${person.name}|${person.email}|${person.phone}`))).size,
        shared: Object.entries(plan.shared).map(([roleKey, person]) => ({ roleKey, name: person.name, channels: person.channels })),
        sample: plan.rows.slice(0, 5).map(row => ({ key: row.key, recipients: Object.entries(row.recipients).map(([roleKey, person]) => ({ roleKey, name: person.name, channels: person.channels })) })),
        template: { versionId: template.id, name: definition.name, documents: definition.documents.map(document => ({ key: document.key, name: document.name })), roles: roleSummary(definition) },
    };
}

async function createFromRows(pool, scope, input, { reserveCapacity }) {
    expect(UUID.test(input.idempotencyKey), 'INVALID_SUBMISSION');
    const { template, definition } = await loadVersion(pool, scope, input.templateVersionId);
    const plan = normalize(definition, input);
    if (plan.errors.length) fail('INVALID_ROWS', 422, plan.errors.slice(0, 50));
    if (input.previewHash !== rowsHash(template, plan)) fail('PREVIEW_CHANGED', 412);
    const seed = [scope.contextId, scope.userId, input.idempotencyKey];
    const created = new Map();
    const personFor = (role, person, index) => {
        if (person.personId) return { personId: person.personId, partyId: null, existing: true };
        const personId = stableUuid(...seed, role.audience === 'shared' ? `shared:${role.key}` : `${index}:${role.key}`);
        const ids = { personId, partyId: stableUuid(...seed, 'party', personId) };
        created.set(personId, { ...ids, name: person.name, endpoints: { ...(person.email ? { email: person.email } : {}), ...(person.phone ? { phone: person.phone } : {}) } });
        return ids;
    };
    const packages = packagesFor(definition, plan, personFor);
    await transaction(pool, async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`signing-v2-people:${seed.join(':')}`]);
        for (const role of definition.roles.filter(item => item.audience === 'shared' && plan.shared[item.key].personId)) {
            const person = await loadPerson(db, scope, plan.shared[role.key].personId);
            const party = (await db.query(`SELECT id FROM signing_parties WHERE owner_context_id=$1 AND person_id=$2 AND kind='person' ORDER BY id LIMIT 1`,
                [scope.contextId, person.id])).rows[0];
            if (!party) fail('PARTICIPANT_NOT_AVAILABLE', 404);
            packages.forEach(item => { item.roles[role.key][0].partyId = party.id; });
        }
        const rows = [...created.values()];
        await db.query(`INSERT INTO signing_people(id,owner_context_id,name,contact_endpoints,created_by)
            SELECT id,$1,name,endpoints,$2 FROM jsonb_to_recordset($3::jsonb) AS p(id uuid,name text,endpoints jsonb) ON CONFLICT DO NOTHING`,
        [scope.contextId, scope.userId, JSON.stringify(rows.map(row => ({ id: row.personId, name: row.name, endpoints: row.endpoints })))]);
        await db.query(`INSERT INTO signing_parties(id,owner_context_id,kind,person_id,name,created_by)
            SELECT id,$1,'person',person_id,name,$2 FROM jsonb_to_recordset($3::jsonb) AS p(id uuid,person_id uuid,name text) ON CONFLICT DO NOTHING`,
        [scope.contextId, scope.userId, JSON.stringify(rows.map(row => ({ id: row.partyId, person_id: row.personId, name: row.name })))]);
        const owned = await db.query(`SELECT count(*)::integer AS count FROM signing_people WHERE owner_context_id=$1 AND id=ANY($2::uuid[])`,
            [scope.contextId, rows.map(row => row.personId)]);
        expect(owned.rows[0].count === rows.length, 'PARTICIPANT_NOT_AVAILABLE');
    });
    const directory = await transaction(pool, db => loadDirectory(db, scope, definition, packages));
    const compiled = packages.map(item => compilePackage(definition, item, directory));
    return createSubmission(pool, scope, { name: plan.name, templateVersionId: template.id, idempotencyKey: input.idempotencyKey, packages,
        previewHash: previewHash(template, packages, compiled) }, { reserveCapacity });
}

module.exports = { listTemplates, loadVersion, importLegacyTemplate, previewCreation, createFromRows, convertLegacy, normalizePhone, stableUuid };
