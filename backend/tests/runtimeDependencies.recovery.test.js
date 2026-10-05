const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const axios = require('axios');
const nodemailer = require('nodemailer');

test('HTTP client preserves request headers and cancellation after dependency update', async (t) => {
    let slowRequest;
    const slowArrived = new Promise(resolve => { slowRequest = resolve; });
    const server = http.createServer((req, res) => {
        if (req.url === '/slow') { slowRequest(); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ authorization: req.headers.authorization, query: new URL(req.url, 'http://localhost').searchParams.get('q') }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const client = axios.create({ baseURL: `http://127.0.0.1:${server.address().port}`, proxy: false });
    client.interceptors.request.use(config => { config.headers.Authorization = 'Bearer synthetic-only'; return config; });
    const response = await client.get('/lookup', { params: { q: 'בדיקת חתימה' } });
    assert.deepEqual(response.data, { authorization: 'Bearer synthetic-only', query: 'בדיקת חתימה' });
    const controller = new AbortController();
    const pending = client.get('/slow', { signal: controller.signal });
    const rejected = assert.rejects(pending, error => axios.isCancel(error) && error.code === 'ERR_CANCELED');
    await slowArrived;
    controller.abort();
    await rejected;
});

test('mail client keeps Hebrew display names and attachment bytes without contacting SMTP', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    const attachment = Buffer.from('synthetic evidence only\n', 'utf8');
    const result = await transport.sendMail({
        from: { name: 'משרד בדיקה', address: 'sender@example.invalid' },
        to: { name: 'לקוח בדיקה', address: 'recipient@example.invalid' },
        replyTo: 'reply@example.invalid',
        subject: 'מסמך לבדיקה',
        text: 'הודעה סינתטית בלבד',
        attachments: [{ filename: 'evidence.txt', content: attachment, contentType: 'text/plain' }],
    });
    assert.deepEqual(result.envelope, { from: 'sender@example.invalid', to: ['recipient@example.invalid'] });
    const message = result.message.toString('utf8');
    assert.match(message, /From: =\?UTF-8\?B\?.* <sender@example\.invalid>/i);
    assert.match(message, /Reply-To: reply@example\.invalid/i);
    assert.match(message, /Content-Disposition: attachment; filename=evidence\.txt/i);
    assert.ok(message.includes(attachment.toString('base64')));
});
