const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

test('renderTemplate replaces [[key]] placeholders', () => {
    const { renderTemplate } = require('../tasks/emailReminders/templates');

    const tpl = 'Hello [[client_name]], your date is [[date]].';
    const result = renderTemplate(tpl, { client_name: 'Alice', date: '2026-03-01' });
    assert.equal(result, 'Hello Alice, your date is 2026-03-01.');
});

test('renderTemplate escapes HTML in values', () => {
    const { renderTemplate } = require('../tasks/emailReminders/templates');

    const tpl = 'Name: [[name]]';
    const result = renderTemplate(tpl, { name: '<script>alert("xss")</script>' });
    assert.ok(!result.includes('<script>'));
    assert.ok(result.includes('&lt;script&gt;'));
});

test('renderTemplate leaves unmatched placeholders intact', () => {
    const { renderTemplate } = require('../tasks/emailReminders/templates');

    const tpl = 'Hello [[client_name]], ref [[unknown_field]].';
    const result = renderTemplate(tpl, { client_name: 'Bob' });
    assert.equal(result, 'Hello Bob, ref [[unknown_field]].');
});

test('getAllTemplates returns built-in templates', () => {
    // Clear any env override
    delete process.env.REMINDER_EMAIL_TEMPLATES;
    // Force re-require to pick up env change
    delete require.cache[require.resolve('../tasks/emailReminders/templates')];
    const { getAllTemplates, BUILT_IN_TEMPLATES } = require('../tasks/emailReminders/templates');

    const templates = getAllTemplates();
    const keys = Object.keys(templates);
    assert.ok(keys.length >= 5, `Expected at least 5 built-in templates, got ${keys.length}`);
    assert.ok(templates.GENERAL, 'Missing GENERAL template');
    assert.ok(templates.COURT_DATE, 'Missing COURT_DATE template');
    assert.ok(templates.DOCUMENT_REQUIRED, 'Missing DOCUMENT_REQUIRED template');
    assert.ok(templates.LICENSE_RENEWAL, 'Missing LICENSE_RENEWAL template');
    assert.ok(templates.PAYMENT, 'Missing PAYMENT template');

    // Each should have required fields
    for (const key of keys) {
        const t = templates[key];
        assert.ok(t.key, `Template ${key} missing key`);
        assert.ok(t.label, `Template ${key} missing label`);
        assert.ok(t.subject, `Template ${key} missing subject`);
        assert.ok(t.body, `Template ${key} missing body`);
    }
});

test('getAllTemplates merges env-var templates', () => {
    process.env.REMINDER_EMAIL_TEMPLATES = JSON.stringify([
        { key: 'CUSTOM', label: 'Custom', subject: 'Subject', body: 'Body' },
    ]);
    delete require.cache[require.resolve('../tasks/emailReminders/templates')];
    const { getAllTemplates } = require('../tasks/emailReminders/templates');

    const templates = getAllTemplates();
    assert.ok(templates.CUSTOM, 'Missing CUSTOM template from env');
    assert.equal(templates.CUSTOM.label, 'Custom');

    // Cleanup
    delete process.env.REMINDER_EMAIL_TEMPLATES;
});

test('getAllTemplates handles malformed env-var gracefully', () => {
    process.env.REMINDER_EMAIL_TEMPLATES = 'not-valid-json';
    delete require.cache[require.resolve('../tasks/emailReminders/templates')];
    const { getAllTemplates } = require('../tasks/emailReminders/templates');

    // Should not throw, just return built-ins
    const templates = getAllTemplates();
    assert.ok(Object.keys(templates).length >= 5);

    delete process.env.REMINDER_EMAIL_TEMPLATES;
});

test('wrapEmailHtml produces valid HTML with RTL direction', () => {
    const { wrapEmailHtml } = require('../tasks/emailReminders/templates');

    const html = wrapEmailHtml('<p>Test body</p>', { firmName: 'TestFirm' });
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('dir="rtl"'));
    assert.ok(html.includes('<p>Test body</p>'));
    assert.ok(html.includes('TestFirm'));
});
