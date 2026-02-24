/**
 * Quick test: render all 19 SMS templates from platform_settings
 * with sample data and print results.
 */
const { renderTemplate } = require('../utils/templateRenderer');
const { getSetting } = require('../services/settingsService');

async function testAll() {
    const templates = [
        'SIGN_INVITE_SMS', 'DOC_SIGNED_SMS', 'DOC_REJECTED_SMS', 'SIGN_REMINDER_SMS',
        'CASE_TAGGED_SMS', 'CASE_NAME_CHANGE_SMS', 'CASE_TYPE_CHANGE_SMS',
        'CASE_MANAGER_CHANGE_SMS', 'CASE_COMPANY_CHANGE_SMS', 'CASE_EST_DATE_CHANGE_SMS',
        'CASE_LICENSE_CHANGE_SMS', 'GENERAL_SMS', 'PAYMENT_SMS', 'LICENSE_RENEWAL_SMS',
        'CASE_CREATED_SMS', 'CASE_STAGE_CHANGED_SMS',
        'CASE_CLOSED_SMS', 'CASE_REOPENED_SMS', 'BIRTHDAY_SMS'
    ];
    const data = {
        recipientName: '\u05dc\u05d9\u05e8\u05d5\u05d9 \u05de\u05dc\u05de\u05d3',
        caseName: '\u05ea\u05d9\u05e7 \u05d1\u05d3\u05d9\u05e7\u05d4 123',
        caseNumber: '42',
        stageName: '\u05d4\u05d2\u05e9\u05ea \u05de\u05e1\u05de\u05db\u05d9\u05dd',
        managerName: '\u05e2\u05d5"\u05d3 \u05db\u05d4\u05df',
        firmName: '\u05de\u05e9\u05e8\u05d3 \u05de\u05dc\u05de\u05d3',
        websiteUrl: 'https://melamedlaw.co.il',
        documentName: '\u05d7\u05d5\u05d6\u05d4 \u05e9\u05db\u05d9\u05e8\u05d5\u05ea',
        rejectionReason: '\u05d7\u05ea\u05d9\u05de\u05d4 \u05dc\u05d0 \u05d1\u05e8\u05d5\u05e8\u05d4',
    };

    let allOk = true;
    for (const key of templates) {
        const tmpl = await getSetting('templates', key, '(NO DEFAULT)');
        const rendered = renderTemplate(tmpl, data);
        const hasUnresolved = /\{\{\w+\}\}/.test(rendered);
        const status = hasUnresolved ? 'WARN unresolved vars' : 'OK';
        if (hasUnresolved) allOk = false;
        console.log(`${status} | ${key}`);
        console.log(`  Template: ${tmpl}`);
        console.log(`  Rendered: ${rendered}`);
        console.log('');
    }

    console.log(allOk ? '\n=== ALL TEMPLATES RENDER OK ===' : '\n=== SOME TEMPLATES HAVE ISSUES ===');
    process.exit(0);
}

testAll().catch(e => { console.error(e); process.exit(1); });
