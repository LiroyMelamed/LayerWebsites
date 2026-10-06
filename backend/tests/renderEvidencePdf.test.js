const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEvidenceHtml } = require('../lib/renderEvidencePdf');

test('evidence template preserves user text as literal text, not HTML markup', () => {
  const name = 'QA <b>literal</b> & "quoted"';
  const html = buildEvidenceHtml({
    meta: { fontDataUrl: 'data:font/ttf;base64,AA==', generatedUtc: '2026-10-03' },
    sender: { name, email: '1017@example.invalid' },
    signers: [{ name, color: '#123456', userId: 1 }],
    doc: { documentName: name, documentId: 1, creationUtc: '2026-10-03', missingNotes: [name] },
    brand: { companyName: name, logoDataUrl: 'data:image/png;base64,AA==' },
  });
  assert.ok(html.includes('QA &lt;b&gt;literal&lt;/b&gt; &amp; &quot;quoted&quot;'));
  assert.ok(!html.includes('<b>literal</b>'));
  assert.ok(html.includes('alt="QA &lt;b&gt;literal&lt;/b&gt; &amp; &quot;quoted&quot;"'));
  assert.ok(html.includes('--c:#123456'));
});
