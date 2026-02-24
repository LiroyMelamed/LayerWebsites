/**
 * Test: render all 16 email templates from DB with sample data
 * to verify placeholders get replaced correctly.
 */
const { getEmailTemplate } = require('../services/settingsService');

function replaceVars(str, fields) {
    return str.replace(/\[\[([a-z_]+)\]\]/g, (m, k) => (fields[k] !== undefined ? fields[k] : m));
}

const testFields = {
    recipient_name: 'לירוי מלמד',
    case_title: 'תיק בדיקה 123',
    case_number: '1001',
    case_stage: 'שלב ראשוני',
    manager_name: 'עו"ד כהן',
    action_url: 'https://client.melamedlaw.co.il',
    document_name: 'חוזה שכירות',
    lawyer_name: 'עו"ד מלמד',
    rejection_reason: 'חתימה לא ברורה',
    signed_document_url: 'https://client.melamedlaw.co.il/signed/123',
    evidence_certificate_url: 'https://client.melamedlaw.co.il/cert/123',
};

async function test() {
    const keys = [
        'CASE_CREATED', 'CASE_NAME_CHANGE', 'CASE_TYPE_CHANGE', 'CASE_STAGE_CHANGE',
        'CASE_CLOSED', 'CASE_REOPENED', 'CASE_MANAGER_CHANGE', 'CASE_EST_DATE_CHANGE',
        'CASE_LICENSE_CHANGE', 'CASE_COMPANY_CHANGE', 'CASE_TAGGED',
        'SIGN_INVITE', 'SIGN_REMINDER', 'DOC_SIGNED', 'DOC_SIGNED_ATTACHMENTS', 'DOC_REJECTED',
    ];
    let pass = 0;
    let fail = 0;
    for (const key of keys) {
        try {
            const tpl = await getEmailTemplate(key);
            if (!tpl) { console.log(`FAIL ${key}: NOT FOUND in DB`); fail++; continue; }
            if (!tpl.html_body || tpl.html_body.length < 100) { console.log(`FAIL ${key}: html_body too short (${(tpl.html_body || '').length})`); fail++; continue; }

            const rendered = replaceVars(tpl.html_body, testFields);
            const leftovers = rendered.match(/\[\[[a-z_]+\]\]/g);
            if (leftovers) { console.log(`FAIL ${key}: unreplaced vars in body: ${leftovers.join(', ')}`); fail++; continue; }

            const subj = replaceVars(tpl.subject_template || '', testFields);
            const subjLeftovers = subj.match(/\[\[[a-z_]+\]\]/g);
            if (subjLeftovers) { console.log(`FAIL ${key}: unreplaced vars in subject: ${subjLeftovers.join(', ')}`); fail++; continue; }

            console.log(`OK   ${key.padEnd(24)} html=${String(tpl.html_body.length).padStart(5)}  subj="${subj}"`);
            pass++;
        } catch (e) {
            console.log(`FAIL ${key}: ${e.message}`);
            fail++;
        }
    }
    console.log(`\nResult: ${pass}/${keys.length} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
}

test();
