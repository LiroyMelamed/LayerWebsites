require('./signingTemplateIsolation.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../../config/db');
const jobs = require('../../services/signingV2/jobs');
const { RenderPool } = require('../../services/signingV2/renderPool');
const { createRuntime } = require('../../services/signingV2/runtime');
const diskStorage = require('./signingCrashStorage.cjs');

process.once('message', async ({ point, contextId, directory }) => {
    process.env.SIGNING_V2_ENABLED = 'true';
    const renderer = new RenderPool({ concurrency: 1 });
    let lease;
    const halt = async () => {
        process.send({ point, lease, browserPids: renderer.slots.map(slot => slot.browserPid).filter(Boolean) });
        await new Promise(() => {});
    };
    const storage = diskStorage(directory);
    if (point === 'after_upload') {
        const verify = storage.verify;
        storage.verify = async (...args) => { await verify(...args); await halt(); };
    }
    const provider = { send: async message => {
        await fs.appendFile(path.join(directory, 'fake-provider.jsonl'), JSON.stringify({ deliveryId: message.deliveryId }) + '\n');
        await halt();
        return { providerId: 'synthetic-never-returned' };
    } };
    const runtime = createRuntime({ pool, renderer, storage, provider, contextIds: [contextId],
        env: { SIGNING_V2_GRANT_KEY: Buffer.alloc(32, 23).toString('base64'), WEBSITE_DOMAIN: 'https://qa.example.invalid' } });
    try {
        const kind = point === 'provider_accepted' ? 'dispatch_delivery' : 'prepare_document';
        [lease] = await jobs.claim(pool, { contextIds: [contextId], workerId: `crash-${process.pid}`, kinds: [kind], limit: 1 });
        if (!lease) throw new Error('No synthetic lease claimed');
        await runtime.handlers[kind](lease);
        if (point === 'after_publish') await halt();
    } catch (error) {
        process.send({ error: error.errorCode || error.message });
        await renderer.close(); await pool.end(); process.exitCode = 1;
    }
});
