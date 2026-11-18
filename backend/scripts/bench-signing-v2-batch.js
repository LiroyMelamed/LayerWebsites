#!/usr/bin/env node
'use strict';

// Destructive fixture generation is restricted to an explicitly isolated QA DB.
// No external notifications are sent. The real creation router, PostgreSQL,
// worker and Chromium renderer run unchanged; transport measurements are labelled.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');

async function main() {
    assert.equal(process.env.LEGAL_DB_QA, 'true');
    assert.match(process.env.DB_NAME || '', /^(signing_perf_qa_|document_workflow_test$)/);
    assert.ok(['127.0.0.1', 'localhost'].includes(process.env.DB_HOST) || process.env.DB_HOST?.startsWith('/tmp/'));
    assert.notEqual(process.env.NODE_ENV, 'production');
    const runs = Number(process.env.BENCH_RUNS || 30);
    const documents = Number(process.env.BENCH_DOCUMENTS || 3);
    assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 100);
    assert.ok(Number.isInteger(documents) && documents >= 3 && documents <= 10);
    const output = path.resolve(process.env.BENCH_OUTPUT || '/tmp/signing-batch-benchmark');
    await fs.mkdir(output, { recursive: true });
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_V2_WORKER_ENABLED: 'false',
        SIGNING_DEPLOYMENT_KEY: `benchmark-${randomUUID()}.invalid`,
        JWT_SECRET: randomBytes(48).toString('hex'), MULTI_TENANT_MODE: 'false',
        BACKGROUND_JOBS_ENABLED: 'false', SKIP_DB_INIT: 'true' });
    const { Client } = require('pg');
    let queryCount = 0;
    const originalQuery = Client.prototype.query;
    Client.prototype.query = function (...args) { queryCount++; return originalQuery.apply(this, args); };
    const pool = require('../config/db');
    // Repeated synthetic runs must not consume a customer's subscription. Keep
    // the real quota adapter/query path, with a complimentary isolated fixture.
    await require('../lib/billing/firmBillingService').getBillingSnapshot();
    await pool.query('UPDATE firm_billing SET billing_enabled=false');
    const { PDFDocument } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    for (let page = 0; page < 3; page++) pdf.addPage([595, 842]).drawText(`SYNTHETIC BENCHMARK / PAGE ${page + 1}`, { x: 30, y: 700 });
    const bytes = Buffer.from(await pdf.save());
    const { databaseFixture } = require('../tests/helpers/signingV2Fixture');
    const fixture = await databaseFixture(pool, { packageCount: 1, documentCount: documents, sourceBytes: bytes });
    await pool.query('UPDATE signing_owner_contexts SET deployment_key=$2 WHERE id=$1', [fixture.contextId, process.env.SIGNING_DEPLOYMENT_KEY]);
    const remoteStorage = process.env.BENCH_STORAGE === 'r2';
    if (remoteStorage) assert.equal(process.env.S3_BUCKET, 'melamedia', 'Only the QA storage bucket is allowed');
    const backing = remoteStorage ? require('../services/signingV2/runtime').objectStorage({ client: require('../utils/r2').r2, bucket: process.env.S3_BUCKET })
        : require('../tests/helpers/signingCrashStorage.cjs')(output);
    const storageStats = { sourceReads: 0, writes: 0, verifications: 0 }, outputKeys = [];
    const sourceKey = `synthetic/${fixture.contextId}/source.pdf`;
    const storage = {
        read: async (...args) => { if (args[0] === sourceKey) storageStats.sourceReads++; return backing.read(...args); },
        write: async (...args) => { assert.ok(args[0].includes(fixture.contextId)); storageStats.writes++; outputKeys.push(args[0]); return backing.write(...args); },
        verify: async (...args) => { storageStats.verifications++; return backing.verify(...args); },
    };
    await storage.write(sourceKey, bytes);
    const express = require('express');
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/signing-v2', require('../routes/signingV2Routes'));
    app.use((error, req, res, next) => res.status(error.statusCode || error.status || 500).json({ code: error.errorCode || error.code, message: error.message }));
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const token = require('jsonwebtoken').sign({ userid: fixture.scope.userId, role: 'Admin' }, process.env.JWT_SECRET);
    const call = async (route, body, key, method = 'POST') => {
        const response = await fetch(`${origin}/api/signing-v2${route}`, { method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });
        const result = await response.json();
        assert.ok(response.ok, `${response.status}: ${JSON.stringify(result)}`);
        return result;
    };
    const report = { startedAt: new Date().toISOString(), commit: process.env.BENCH_COMMIT || 'unrecorded',
        host: { platform: os.platform(), cpuCount: os.availableParallelism(), totalMemoryBytes: os.totalmem() },
        workload: { packages: 200, documentsPerPackage: documents, pagesPerDocument: 3, totalDocuments: 200 * documents },
        boundaries: { creation: 'loopback HTTP draft save + submit; real router, auth, quota queries (complimentary fixture) and committed PostgreSQL rows; excludes browser/TLS/network',
            rendering: remoteStorage ? 'real Chromium + pdf-lib and QA R2 with hash read-back' : 'real Chromium + pdf-lib, private local disk with hash read-back; excludes R2 latency',
            transport: 'synthetic adapter with 100 ms latency; NOT real provider acceptance or delivery' }, creation: [] };
    let runtime;
    const lag = monitorEventLoopDelay({ resolution: 10 }); lag.enable();
    try {
        const body = { name: 'QA performance 200 employees', templateVersionId: fixture.versionId,
            rows: Array.from({ length: 200 }, (_, i) => ({ key: `employee-${i}`, data: { employeeId: String(i).padStart(9, '0') },
                recipients: { employee: { name: `Synthetic employee ${i}`, email: `employee-${i}@example.invalid`, channel: 'email', locale: ['he','ar','en'][i % 3] } } })) };
        const preview = await call('/creation/preview', body);
        assert.equal(preview.valid, true, JSON.stringify(preview.errors));
        let last, lastDraft;
        for (let index = 0; index < runs; index++) {
            queryCount = 0; lag.reset();
            const started = performance.now();
            lastDraft = await call(`/creation/drafts/${randomUUID()}`, { expectedVersion: 0, payload: { request: body } }, null, 'PUT');
            last = (await call(`/creation/drafts/${lastDraft.id}/submit`, { expectedVersion: lastDraft.version, previewHash: preview.previewHash })).result;
            const elapsedMs = performance.now() - started, queries = queryCount;
            assert.equal(last.durable, true); assert.equal(last.packageCount, 200); assert.equal(last.documentCount, 200 * documents);
            // Independent pool query, after the HTTP reply: an acknowledgement is not sufficient.
            const counts = (await pool.query(`SELECT
                (SELECT count(*)::integer FROM signing_packages WHERE submission_id=$1) AS packages,
                (SELECT count(*)::integer FROM signing_documents d JOIN signing_packages p ON p.active_revision_id=d.revision_id WHERE p.submission_id=$1) AS documents,
                (SELECT count(*)::integer FROM signing_jobs j JOIN signing_documents d ON d.id=j.subject_id JOIN signing_packages p ON p.active_revision_id=d.revision_id
                    WHERE p.submission_id=$1 AND j.kind='prepare_document') AS render_jobs,
                (SELECT count(*)::integer FROM signing_jobs j JOIN signing_deliveries d ON d.id=j.subject_id JOIN signing_delivery_profiles dp ON dp.id=d.profile_id
                    JOIN signing_packages p ON p.active_revision_id=dp.revision_id WHERE p.submission_id=$1 AND j.kind='dispatch_delivery') AS delivery_jobs`, [last.submissionId])).rows[0];
            assert.deepEqual(counts, { packages: 200, documents: 200 * documents, render_jobs: 200 * documents, delivery_jobs: 200 });
            report.creation.push({ index, elapsedMs, queries, eventLoopMaxMs: lag.max / 1e6, submissionId: last.submissionId, counts });
            console.log(JSON.stringify({ phase: 'durable_creation', ...report.creation.at(-1) }));
        }
        const ordered = report.creation.map(run => run.elapsedMs).sort((a,b) => a-b);
        report.creationP95Ms = ordered[Math.ceil(ordered.length * 0.95) - 1];
        report.creationTarget = runs >= 30 && report.creationP95Ms <= 5000 ? 'PASS_FOR_RECORDED_BOUNDARY' : runs < 30 ? 'INSUFFICIENT_SAMPLES' : 'FAIL';
        const replay = (await call(`/creation/drafts/${lastDraft.id}/submit`, { expectedVersion: lastDraft.version, previewHash: preview.previewHash })).result;
        assert.equal(replay.submissionId, last.submissionId); assert.equal(replay.reused, true);
        // Only render the final run. Earlier admissions remain durable but inactive in this isolated DB.
        const selectedRevisions = (await pool.query('SELECT active_revision_id FROM signing_packages WHERE submission_id=$1', [last.submissionId])).rows.map(row => row.active_revision_id);
        await pool.query(`UPDATE signing_jobs j SET state='cancelled' WHERE owner_context_id=$1 AND state='pending'
            AND NOT (subject_id=ANY($2::uuid[]) OR subject_id IN (SELECT id FROM signing_documents WHERE revision_id=ANY($2::uuid[]))
                OR subject_id IN (SELECT d.id FROM signing_deliveries d JOIN signing_delivery_profiles p ON p.id=d.profile_id WHERE p.revision_id=ANY($2::uuid[])))`, [fixture.contextId, selectedRevisions]);
        if (process.env.BENCH_RENDER !== 'false') {
            const started = performance.now();
            let calls = 0;
            const provider = { send: async () => { await new Promise(resolve => setTimeout(resolve, 100)); calls++; return { providerId: `synthetic-${calls}` }; } };
            runtime = require('../services/signingV2/runtime').createRuntime({ pool, storage, provider, contextIds: [fixture.contextId],
                env: { ...process.env, SIGNING_V2_GRANT_KEY: Buffer.alloc(32, 7).toString('base64'), WEBSITE_DOMAIN: 'https://benchmark.example.invalid' } });
            runtime.start();
            let readyMs = null, sentMs = null;
            while (performance.now() - started < 900000) {
                const status = (await pool.query(`SELECT
                    (SELECT count(*)::integer FROM signing_documents WHERE revision_id=ANY($1::uuid[]) AND prepared_artifact_id IS NOT NULL) AS prepared,
                    (SELECT count(*)::integer FROM signing_deliveries d JOIN signing_delivery_profiles p ON p.id=d.profile_id
                        WHERE p.revision_id=ANY($1::uuid[]) AND d.state IN ('provider_accepted','delivered')) AS accepted,
                    (SELECT count(*)::integer FROM signing_jobs WHERE owner_context_id=$2 AND state IN ('needs_attention','uncertain')) AS failures`, [selectedRevisions, fixture.contextId])).rows[0];
                const elapsedMs = performance.now() - started;
                if (status.prepared === 200 * documents && readyMs === null) readyMs = elapsedMs;
                if (status.accepted === 200) sentMs = elapsedMs;
                console.log(JSON.stringify({ phase: 'background_progress', elapsedMs, ...status }));
                assert.equal(status.failures, 0, 'background jobs require attention');
                if (sentMs !== null) break;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            report.background = { allDocumentsReadyMs: readyMs, allSyntheticHandoffsMs: sentMs, syntheticProviderCalls: calls,
                fromConfirmationToReadyMs: readyMs === null ? null : report.creation.at(-1).elapsedMs + readyMs,
                fromConfirmationToSyntheticHandoffsMs: sentMs === null ? null : report.creation.at(-1).elapsedMs + sentMs };
            assert.notEqual(sentMs, null, 'background work did not complete within 15 minutes');
            assert.equal(calls, 200, 'no duplicate provider calls');
        }
    } catch (error) { report.error = { message: error.message, code: error.code || error.errorCode }; throw error; }
    finally {
        lag.disable(); await runtime?.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        report.finishedAt = new Date().toISOString(); report.storage = storageStats;
        await fs.writeFile(path.join(output, 'synthetic-object-keys.json'), JSON.stringify(outputKeys));
        await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        await pool.end(); Client.prototype.query = originalQuery;
    }
    console.log(JSON.stringify({ report: path.join(output, 'report.json'), target: report.creationTarget, p95Ms: report.creationP95Ms, background: report.background }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
