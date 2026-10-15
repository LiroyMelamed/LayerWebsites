const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const { databaseFixture } = require('./signingV2Fixture');
const { createSubmission } = require('../../services/signingV2/submissions');
const { createPreparationService } = require('../../services/signingV2/preparation');
const { createWorkflowService } = require('../../services/signingV2/workflow');
const { createGrantService } = require('../../services/signingV2/grants');
const { createDeliveryService } = require('../../services/signingV2/delivery');
const { RenderPool } = require('../../services/signingV2/renderPool');
const management = require('../../services/signingV2/management');
const jobs = require('../../services/signingV2/jobs');
const { bytesHash } = require('../../lib/signingV2/canonical');

// The endpoint prefix decides the synthetic outcome; nothing leaves the process.
function fakeProvider() {
    const calls = [], recovered = new Set();
    return { calls, recover: endpoint => recovered.add(endpoint), send: async message => {
        calls.push(message);
        if (recovered.has(message.endpoint)) return { providerId: `fake-${calls.length}` };
        if (message.endpoint.startsWith('reject')) throw Object.assign(new Error('rejected'), { definitive: true, code: 'INVALID_DESTINATION' });
        if (message.endpoint.startsWith('timeout')) throw new Error('socket hang up after request was written');
        return { providerId: `fake-${calls.length}` };
    } };
}

async function syntheticPdf(label) {
    const pdf = await PDFDocument.create(); pdf.addPage([595, 842]).drawText(label);
    return Buffer.from(await pdf.save());
}

/** A full synthetic submission whose workers run in-process against the isolated QA database. */
async function deliveryHarness(pool, { endpoints, documentCount = 2, concurrency = 2, configure } = {}) {
    const sourceBytes = await syntheticPdf('SYNTHETIC DELIVERY ONLY');
    const f = await databaseFixture(pool, { packageCount: endpoints.length, documentCount, sourceBytes, configure: async value => {
        value.packages.forEach((item, index) => { Object.values(item.delivery)[0].email = endpoints[index]; });
        return configure ? configure(value) : value.definition;
    } });
    const objects = new Map();
    const storage = { read: async () => Buffer.from(sourceBytes), write: async (key, bytes) => objects.set(key, Buffer.from(bytes)),
        verify: async (key, length, hash) => { assert.equal(objects.get(key).length, length); assert.equal(bytesHash(objects.get(key)), hash); } };
    const renderer = new RenderPool({ concurrency });
    const grantService = createGrantService({ encryptionKey: randomBytes(32), keyId: 'synthetic' });
    const workflow = createWorkflowService({ pool, grantService, authorizeActivation: async () => {} });
    const provider = fakeProvider();
    const dispatch = createDeliveryService({ pool, grantService, provider, linkFor: token => `https://qa.example.invalid/s/${token}` });
    const prepare = createPreparationService({ pool, renderer, storage });
    const handlers = { dispatch_delivery: dispatch, prepare_document: prepare, validate_package: workflow.validatePackage, activate_package: workflow.activatePackage };
    const claim = (kind, limit) => jobs.claim(pool, { contextIds: [f.contextId], workerId: 'signing-v2-qa', kinds: [kind], limit });
    const drain = async (kind, limit = 8) => {
        let total = 0;
        for (let batch = await claim(kind, limit); batch.length; batch = await claim(kind, limit)) { total += batch.length; await Promise.all(batch.map(handlers[kind])); }
        return total;
    };
    const submit = () => createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} });
    const activate = async () => { await drain('prepare_document'); await drain('validate_package'); await drain('activate_package'); };
    const targets = async submissionId => {
        const packages = (await management.listPackages(pool, f.scope, submissionId, { state: 'all', limit: 100 })).rows;
        const people = (await pool.query(`SELECT p.external_key,dp.person_id FROM signing_packages p
            JOIN signing_delivery_profiles dp ON dp.owner_context_id=p.owner_context_id AND dp.revision_id=p.active_revision_id
            WHERE p.owner_context_id=$1`, [f.contextId])).rows.reduce((map, row) => ({ ...map, [row.external_key]: row.person_id }), {});
        return { packages, byKey: Object.fromEntries(packages.map(item => [item.name, item])), people };
    };
    return { f, objects, provider, drain, submit, activate, targets, close: () => renderer.close() };
}

module.exports = { deliveryHarness, fakeProvider, syntheticPdf };
