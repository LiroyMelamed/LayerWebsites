const { randomUUID } = require('node:crypto');
const { UUID } = require('../../lib/signingV2/compiler');
const { fail, expect } = require('../../lib/signingV2/errors');
const { transaction } = require('./transaction');
const { packageScopeSql, scopeParams } = require('./access');

function personScopeSql(alias = 'person') {
    return `${alias}.owner_context_id=$1 AND ($2::boolean OR ${alias}.created_by=$3 OR EXISTS (
        SELECT 1 FROM signing_participations participation
        JOIN signing_package_revisions revision ON revision.owner_context_id=participation.owner_context_id AND revision.id=participation.revision_id
        JOIN signing_packages p ON p.owner_context_id=revision.owner_context_id AND p.id=revision.package_id
        WHERE participation.owner_context_id=${alias}.owner_context_id AND participation.person_id=${alias}.id AND ${packageScopeSql('p')}))`;
}

function personName(value) {
    expect(typeof value === 'string' && value.trim().length > 0 && value.length <= 300, 'INVALID_PERSON');
    return value.normalize('NFC').trim();
}
function endpoints(input = {}) {
    const result = {};
    if (input.email) {
        expect(typeof input.email === 'string' && input.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email), 'INVALID_DELIVERY');
        result.email = input.email.trim();
    }
    if (input.phone) {
        expect(/^\+[1-9]\d{7,14}$/.test(input.phone), 'INVALID_DELIVERY');
        result.phone = input.phone;
    }
    return result;
}

async function createPerson(pool, scope, input) {
    const name = personName(input.name), contacts = endpoints(input.endpoints);
    return transaction(pool, async db => {
        const linkedUserId = input.linkedUserId || null;
        if (linkedUserId) {
            expect(Number.isSafeInteger(linkedUserId) && linkedUserId > 0, 'INVALID_PERSON');
            const user = await db.query(`SELECT userid FROM users WHERE userid=$1
                AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid AND role <> 'Deleted' FOR SHARE`, [linkedUserId, scope.tenantId]);
            if (!user.rowCount) fail('NOT_FOUND', 404);
        }
        // Deliberately no email/phone lookup or conflict resolution. Linking an
        // existing person is an explicit UI choice and uses that person's UUID.
        const id = randomUUID(), partyId = randomUUID();
        const person = (await db.query(`INSERT INTO signing_people(id,owner_context_id,linked_userid,name,contact_endpoints,created_by)
            VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [id, scope.contextId, linkedUserId, name, contacts, scope.userId])).rows[0];
        const party = (await db.query(`INSERT INTO signing_parties(id,owner_context_id,kind,person_id,name,created_by)
            VALUES($1,$2,'person',$3,$4,$5) RETURNING *`, [partyId, scope.contextId, id, name, scope.userId])).rows[0];
        return { person, party };
    });
}

async function createLegalEntity(db, scope, input) {
    const name = personName(input.name);
    const registration = input.registration || null;
    if (registration) {
        expect(typeof registration.value === 'string' && registration.value.length > 0 && registration.value.length <= 80, 'INVALID_REGISTRATION');
        expect(/^[A-Z]{2}$/.test(registration.country) && typeof registration.type === 'string' && registration.type.length <= 80, 'INVALID_REGISTRATION');
    }
    return (await db.query(`INSERT INTO signing_parties(id,owner_context_id,kind,name,registration,created_by)
        VALUES($1,$2,'legal_entity',$3,$4,$5) RETURNING *`, [randomUUID(), scope.contextId, name, registration, scope.userId])).rows[0];
}

async function searchPeople(db, scope, query) {
    const term = String(query || '').trim().slice(0, 100).replace(/[%_\\]/g, '\\$&');
    return (await db.query(`SELECT person.id,name,linked_userid,contact_endpoints,person.version FROM signing_people person
        WHERE ${personScopeSql()} AND (name ILIKE $5 OR contact_endpoints->>'email' ILIKE $5 OR contact_endpoints->>'phone' ILIKE $5)
        ORDER BY name,id LIMIT 30`, [...scopeParams(scope), `%${term}%`])).rows;
}

async function loadPerson(db, scope, personId) {
    expect(UUID.test(personId), 'INVALID_PERSON');
    const result = await db.query(`SELECT person.* FROM signing_people person WHERE ${personScopeSql()} AND person.id=$5`, [...scopeParams(scope), personId]);
    if (!result.rowCount) fail('NOT_FOUND', 404);
    return result.rows[0];
}

module.exports = { createPerson, createLegalEntity, searchPeople, loadPerson, endpoints, personScopeSql };
