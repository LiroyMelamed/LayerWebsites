const test = require('node:test');
const assert = require('node:assert/strict');
const { notificationProvider } = require('../services/signingV2/runtime');

test('completed copies use the incumbent signed-document campaign and scoped links with no admin CC', async () => {
    const sent = [];
    const provider = notificationProvider({
        pool: { query: async () => ({ rows: [{ person_name: 'Synthetic recipient', submission_name: 'Synthetic run', owner_name: 'Synthetic office' }] }) },
        notifyRecipient: async value => { sent.push(value); return { outcomes: { email: { ok: true, messageId: 'fake' }, sms: { ok: true, messageId: 'fake' } } }; },
    });
    const url = `https://qa.example.invalid/ViewSignedDocument/Sign#${'A'.repeat(43)}`;
    await provider.send({ deliveryId: 'fake', purpose: 'completed_copy', channel: 'email', endpoint: 'synthetic@example.invalid', url });
    const email = sent[0];
    assert.equal(email.notificationType, 'DOC_SIGNED'); assert.equal(email.email.campaignKey, 'DOC_SIGNED');
    assert.equal(email.email.contactFields.signed_document_url, url);
    assert.equal(email.email.contactFields.evidence_certificate_url, url);
    assert.equal(email.skipAdminCc, true); assert.equal(email.respectExplicitChannelChoice, true);
    assert.equal(email.sms, null); assert.equal(email.recipientUserId, null);
    for (const locale of ['he', 'ar', 'en']) await provider.send({ deliveryId: 'fake', purpose: 'completed_copy', channel: 'sms', endpoint: '+15555550100', locale, url });
    assert.match(sent[1].sms.messageBody, /אין צורך לחתום שוב/);
    assert.match(sent[2].sms.messageBody, /لا حاجة للتوقيع مجددًا/);
    assert.match(sent[3].sms.messageBody, /No further signature is needed/);
    assert.ok(sent.slice(1).every(item => item.email === null && item.sms.messageBody.endsWith(url)));
});
