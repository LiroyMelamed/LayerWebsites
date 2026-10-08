const { parentPort, workerData } = require('node:worker_threads');
const { createDataRenderer } = require('../../lib/signingV2/dataRenderer');

let renderer;
let running = false;
let closing = false;
async function close() {
    if (renderer) await renderer.close();
    parentPort.close();
}
parentPort.on('message', async message => {
    if (message.type === 'close') {
        closing = true;
        if (!running) await close();
        return;
    }
    if (message.type !== 'render' || running || closing) return;
    running = true;
    try {
        if (!renderer) {
            renderer = await createDataRenderer(workerData);
            parentPort.postMessage({ type: 'browser_started', pid: renderer.browserProcess?.pid });
            renderer.browserProcess?.once('exit', () => parentPort.postMessage({ type: 'browser_closed' }));
        }
        const result = message.input.html !== undefined
            ? await renderer.renderHtml({ html: message.input.html })
            : await renderer.render({ ...message.input, sourceBytes: Buffer.from(message.input.sourceBytes) });
        parentPort.postMessage({ id: message.id, result });
    } catch (error) {
        parentPort.postMessage({ id: message.id, error: { code: error.errorCode || 'RENDER_FAILED',
            message: String(error.message || '').replace(/[\r\n]+/g, ' ').slice(0, 180),
            fieldErrors: error.extras?.fieldErrors || [], retryable: !error.errorCode } });
    } finally {
        running = false;
        if (closing) await close();
    }
});
