const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { PDFDocument } = require('pdf-lib');
const QRCode = require('qrcode');
const { renderHtmlToPdf, renderEvidencePdf } = require('../lib/renderEvidencePdf');

test('certificate renders embedded Hebrew font and QR without depending on network idle', { timeout: 20_000 }, async () => {
  const qrDataUrl = await QRCode.toDataURL('https://example.invalid/synthetic-certificate');
  const bytes = await renderEvidencePdf({
    doc: { documentId: 1, documentName: 'בדיקה סינתטית', creationUtc: '2026-10-05', signedPdfSha256: 'a'.repeat(64) },
    sender: { name: 'שולח בדיקה' },
    signers: [{ name: 'חותם בדיקה', color: '#123456' }],
    qrDataUrl,
    brand: { companyName: 'SYNTHETIC QA ONLY', logoDataUrl: qrDataUrl },
  });
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0);
});

test('an unrelated pending connection does not block a ready PDF', { timeout: 20_000 }, async (t) => {
  let requested = false;
  let waitingImage;
  const image = Buffer.from((await QRCode.toDataURL('synthetic ready asset')).split(',')[1], 'base64');
  const finishImage = () => {
    if (requested && waitingImage) { waitingImage.writeHead(200, {'Content-Type':'image/png'}); waitingImage.end(image); waitingImage = null; }
  };
  const server = http.createServer((req, res) => {
    if (req.url === '/ready.png') { waitingImage = res; finishImage(); return; }
    requested = true;
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.write('pending');
    finishImage();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  // The image cannot become ready until the pending request reached our server.
  // This prevents a fast PDF/close from cancelling fetch before the assertion.
  const origin = `http://127.0.0.1:${server.address().port}`;
  const bytes = await renderHtmlToPdf(`<html><body>Ready document<img src="${origin}/ready.png"><script>fetch('${origin}/pending')</script></body></html>`);
  assert.equal(requested, true);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
});

test('broken certificate assets fail instead of producing an incomplete PDF', { timeout: 20_000 }, async () => {
  await assert.rejects(
    renderHtmlToPdf('<html><body><img src="data:image/png;base64,AA=="></body></html>'),
    /Evidence certificate image failed to load/
  );
  await assert.rejects(
    renderHtmlToPdf('<html><head><style>@font-face{font-family:Broken;src:url(data:font/ttf;base64,AA==)}body{font-family:Broken}</style></head><body>Required font</body></html>'),
    /Evidence certificate font failed to load/
  );
});
