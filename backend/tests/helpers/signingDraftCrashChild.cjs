// Forked only by the dedicated synthetic draft recovery test.
require('./signingTemplateIsolation.cjs');
const pool = require('../../config/db');
const { submitDraft } = require('../../services/signingV2/drafts');
process.on('message', async ({ scope, id, approval, point }) => {
    try {
        const result = await submitDraft(pool, scope, id, approval, { reserveCapacity: async () => {
            if (point === 'before_commit') { process.send({ point }); await new Promise(() => {}); }
        } });
        process.send({ point: 'after_commit', submissionId: result.result.submissionId });
    } catch (error) { process.send({ error: error.errorCode || error.message }); }
});
