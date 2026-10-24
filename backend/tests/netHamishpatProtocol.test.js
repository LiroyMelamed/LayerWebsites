'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { CONTRACT, LIMITS, OPERATIONS, NetHamishpatProtocolError,
    buildReadOnlyRequest, parseReadOnlyResponse } = require('../services/integrations/netHamishpatProtocol');

// Every identity, case and payload in this file is synthetic. These assertions
// exercise a public-mirror codec profile, not court authentication or live data.
const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const TEMP = 'http://tempuri.org/';
const CASE = Object.freeze({ number: 12345, month: 5, year: 2026 });
const context = operation => ({ operation, requestId: 42, caseIdentification: CASE });
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const bytes = value => Buffer.from(value, 'utf8');
function soap(operation, inner) {
    return bytes(`<s:Envelope xmlns:s="${SOAP}"><s:Body><${operation}Response xmlns="${TEMP}">` +
        `<${operation}Result>${escape(inner)}</${operation}Result></${operation}Response></s:Body></s:Envelope>`);
}
function payload(operation, rows = '', options = {}) {
    const root = operation === 'GetDecisionList' ? 'GetDecisionResponse' : 'GetProcessListResponse';
    return `<${root}><ResponseHeader><RequestId>${options.requestId ?? 42}</RequestId>` +
        `<MessageId>${options.messageId ?? 0}</MessageId><MessageDesc>${escape(options.messageDesc || '')}</MessageDesc>` +
        `</ResponseHeader>${options.omitData ? '' : `<ResponseData>${rows}</ResponseData>`}</${root}>`;
}
const decision = (id = '101', extra = '') => `<Decision><CaseID>99999999</CaseID><DecisionID>${id}</DecisionID>${extra}</Decision>`;
const parse = (operation, inner) => parseReadOnlyResponse({ ...context(operation), body: soap(operation, inner) });
const fails = (code, extra = {}) => error => error instanceof NetHamishpatProtocolError &&
    error.code === code && Object.entries(extra).every(([key, value]) => error[key] === value);

test('only three read-only operations have fixed HTTPS court endpoints and exact WSDL SOAP actions', () => {
    assert.deepEqual(Object.keys(OPERATIONS), ['GetDecisionList', 'GetProcessList', 'GetProtocolList']);
    for (const operation of Object.keys(OPERATIONS)) {
        const result = buildReadOnlyRequest({ ...context(operation), userId: '123456782', userType: 'תז' });
        const service = operation === 'GetProtocolList' ? 'ProtocolListSI' : 'DecisionSI';
        assert.equal(result.endpoint, `https://secure.court.gov.il/NGCS.SoftwareCompaniesInterfaces.SI/${service}.asmx`);
        assert.equal(result.method, 'POST');
        assert.deepEqual(result.headers, { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${TEMP}${operation}"` });
        assert.ok(Buffer.isBuffer(result.body));
        assert.deepEqual(result.context, context(operation));
        assert.equal(result.contract.status, 'PUBLIC_MIRROR_PROFILE_NOT_LIVE_VALIDATED');
    }
    for (const operation of ['GetDocument', 'SubmitDocInSubmissionTask', '__proto__', 'toString', '', null])
        assert.throws(() => buildReadOnlyRequest({ ...context(operation), userId: '123456782' }), fails('UNSUPPORTED_OPERATION'));
});

test('requests put one escaped UTF-8 inner XML string inside the correct SOAP parameter and root', () => {
    const roots = { GetDecisionList: 'GetDecisionRequest', GetProcessList: 'GetProcessListRequest', GetProtocolList: 'GetProtocolRequest' };
    for (const operation of Object.keys(roots)) {
        const xml = buildReadOnlyRequest({ ...context(operation), userId: '123456782' }).body.toString('utf8');
        assert.match(xml, /<strRequestXML>&lt;\?xml version=&quot;1\.0&quot; encoding=&quot;utf-8&quot;\?&gt;/);
        assert.ok(xml.includes(`&lt;${roots[operation]}&gt;`));
        assert.ok(xml.includes('&lt;UserType&gt;תז&lt;/UserType&gt;'));
        assert.ok(xml.includes('&lt;RequestId&gt;42&lt;/RequestId&gt;'));
        assert.ok(xml.includes('&lt;NumeratorGroupID&gt;1&lt;/NumeratorGroupID&gt;'));
        assert.ok(xml.includes('&lt;CaseNumber&gt;12345&lt;/CaseNumber&gt;'));
        assert.ok(xml.includes('&lt;CaseMonth&gt;5&lt;/CaseMonth&gt;'));
        assert.ok(xml.includes('&lt;CaseYear&gt;2026&lt;/CaseYear&gt;'));
        assert.equal(xml.includes('<RequestHeader>'), false);
        assert.equal(xml.includes('<requestXML>'), false);
    }
});

test('invalid identities, request IDs, case fields and caller endpoint overrides are rejected without echo', () => {
    const valid = { ...context('GetDecisionList'), userId: '123456782' };
    const invalid = [
        { userId: '000000000' }, { userId: '123456789' }, { userId: '12345678' },
        { userId: 123456782 }, { userId: '123456782\n' }, { userId: '<UserId>123456782</UserId>' },
        { userType: 'ID' }, { userType: 'ת"ז' }, { userType: 'תז\n' }, { userType: null },
        ...[0, -1, 2147483648, 1.5, '42', 'synthetic-guid', NaN].map(requestId => ({ requestId })),
        ...[{ year: 26 }, { year: '2026' }, { year: 10000 }, { month: 0 }, { month: 13 },
            { number: 0 }, { number: 10000000 }, { number: '12345' }, { number: '<x/>' },
            { previousCaseId: '999' }].map(value => ({ caseIdentification: { ...CASE, ...value } })),
        { caseIdentification: '12345-05-26' }, { endpoint: 'https://foreign.example.invalid/' },
    ];
    for (const value of invalid) {
        const input = { ...valid, ...value };
        assert.throws(() => buildReadOnlyRequest(input), error => {
            assert.equal(error.code, 'INVALID_REQUEST');
            assert.equal(error.message, 'INVALID_REQUEST');
            assert.equal(Object.hasOwn(error, 'userId'), false);
            return true;
        });
    }
});

test('decision profile normalizes known fields and preserves source date without a timezone guess', () => {
    const inner = payload('GetDecisionList', decision('101', '<DecisionNumber>2</DecisionNumber>' +
        '<DecisionName>החלטה סינתטית &amp; בדיקה</DecisionName><DecisionSignatureDate>2026-05-12T10:20:30.1234567</DecisionSignatureDate>' +
        '<DecisionSignatureUserName>חותם לדוגמה</DecisionSignatureUserName><DecisionTypeID>8</DecisionTypeID>' +
        '<IsInstruction>False</IsInstruction><IsDecisionInProtocol>true</IsDecisionInProtocol>' +
        '<PrivillageID>0</PrivillageID><DocumentID>500000002</DocumentID>'));
    const body = soap('GetDecisionList', inner);
    const result = parseReadOnlyResponse({ ...context('GetDecisionList'), body });
    assert.deepEqual(result.items, [{ kind: 'decision', caseId: '99999999', decisionId: '101', decisionNumber: 2,
        title: 'החלטה סינתטית & בדיקה', signedAt: '2026-05-12T10:20:30.1234567', signedBy: 'חותם לדוגמה',
        decisionTypeId: 8, isInstruction: false, isDecisionInProtocol: true, privilegeId: 0, documentId: '500000002' }]);
    assert.equal(result.status, 'success');
    assert.equal(result.providerMessageId, 0);
    assert.equal(result.provenance.responseSha256, createHash('sha256').update(body).digest('hex'));
    assert.equal(result.provenance.authentication, 'NOT_VERIFIED_BY_CODEC');
    assert.equal(result.provenance.caseBinding, 'REQUEST_CONTEXT_ONLY');
    assert.equal(result.provenance.contract, CONTRACT);
    assert.equal(JSON.stringify(result).includes('ResponseHeader'), false);
});

test('process profile returns typed EntityData without coercing large external identifiers', () => {
    const result = parse('GetProcessList', payload('GetProcessList', '<EntityData><ProcessGroupID>102</ProcessGroupID>' +
        '<ProcessNumber>3</ProcessNumber><EntityID>99999999999999999999</EntityID><EntityType>1</EntityType>' +
        '<EntityDisplayName>בקשה לדוגמה</EntityDisplayName><EntityDate>2026-05-12T10:00:00+03:00</EntityDate>' +
        '<IsProcessOpeningEntity>True</IsProcessOpeningEntity><DocumentTypeID>7</DocumentTypeID><DocumentID>500000003</DocumentID></EntityData>'));
    assert.deepEqual(result.items, [{ kind: 'entity', processGroupId: '102', processNumber: 3,
        entityId: '99999999999999999999', entityType: 1, title: 'בקשה לדוגמה', occurredAt: '2026-05-12T10:00:00+03:00',
        isProcessOpeningEntity: true, documentTypeId: 7, documentId: '500000003' }]);
});

test('only exact header MessageId 1868 means documented empty data, with no contradictory records', () => {
    for (const omitData of [false, true]) {
        const result = parse('GetDecisionList', payload('GetDecisionList', '', { messageId: 1868, omitData,
            messageDesc: 'אין נתונים לדוגמה' }));
        assert.equal(result.status, 'empty');
        assert.equal(result.providerMessageId, 1868);
        assert.deepEqual(result.items, []);
    }
    assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', decision(), { messageId: 1868 })),
        fails('CONTRADICTORY_EMPTY_RESPONSE', { providerMessageId: 1868 }));
    const ordinary = parse('GetDecisionList', payload('GetDecisionList', decision('1868')));
    assert.equal(ordinary.items[0].decisionId, '1868');
    assert.equal(ordinary.status, 'success');
});

test('provider error codes stay structured while private descriptions and arbitrary occurrences of 1868 are not echoed', () => {
    for (const messageId of [1848, 1849, 2594, 2627, 2681, 5533]) {
        assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', '', {
            messageId, messageDesc: '1868 private synthetic description 99999999' })), error => {
            assert.ok(fails('COURT_PROVIDER_REJECTED', { providerMessageId: messageId })(error));
            assert.equal(error.message.includes('99999999'), false);
            assert.equal(error.message.includes('description'), false);
            return true;
        });
    }
    assert.equal(parse('GetDecisionList', payload('GetDecisionList', '', { messageDesc: '1868' })).status, 'success');
    assert.throws(() => parse('GetDecisionList', payload('GetDecisionList').replace('<MessageId>0</MessageId>', '')), fails('UNSUPPORTED_RESPONSE_SHAPE'));
    for (const messageId of ['unknown', '-1', '01', '2147483648'])
        assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', '', { messageId })), fails('UNSUPPORTED_RESPONSE_SHAPE'));
});

test('empty and zero success headers remain distinct from an undocumented missing response structure', () => {
    for (const messageId of ['', 0]) {
        const result = parse('GetDecisionList', payload('GetDecisionList', '', { messageId, messageDesc: 'הבקשה הושלמה בהצלחה' }));
        assert.equal(result.status, 'success');
        assert.equal(result.providerMessageId, messageId === '' ? null : 0);
        assert.deepEqual(result.items, []);
    }
    assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', '', { omitData: true })), fails('UNSUPPORTED_RESPONSE_SHAPE'));
    assert.throws(() => parse('GetDecisionList', '<GetDecisionResponse/>'), fails('UNSUPPORTED_RESPONSE_SHAPE'));
});

test('request correlation is mandatory and errors never contain the echoed ID', () => {
    assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', '', { requestId: 999888777 })), error => {
        assert.ok(fails('RESPONSE_REQUEST_ID_MISMATCH')(error));
        assert.equal(error.message.includes('999888777'), false);
        return true;
    });
    for (const requestId of ['0', '042', '2147483648', '42.0', 'private-id'])
        assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', '', { requestId })), fails('INVALID_RESPONSE_REQUEST_ID'));
});

test('SOAP faults are recognized without exposing fault text or treating embedded numbers as empty data', () => {
    const body = bytes(`<s:Envelope xmlns:s="${SOAP}"><s:Body><s:Fault><faultcode>s:Server</faultcode>` +
        '<faultstring>1868 private synthetic identifier 999888777</faultstring></s:Fault></s:Body></s:Envelope>');
    assert.throws(() => parseReadOnlyResponse({ ...context('GetDecisionList'), body }), error => {
        assert.ok(fails('SOAP_FAULT')(error));
        assert.equal(error.message.includes('1868'), false);
        assert.equal(Object.hasOwn(error, 'providerMessageId'), false);
        return true;
    });
});

test('SOAP namespace, action wrapper, result parameter and inner root cannot be substituted', () => {
    const valid = soap('GetDecisionList', payload('GetDecisionList', decision())).toString('utf8');
    const variants = [
        valid.replaceAll(SOAP, 'http://www.w3.org/2003/05/soap-envelope'),
        valid.replaceAll(TEMP, 'https://foreign.example.invalid/'),
        valid.replaceAll('GetDecisionListResponse', 'GetProcessListResponse'),
        valid.replaceAll('GetDecisionListResult', 'requestXML'),
        valid.replaceAll('GetDecisionResponse', 'UnknownResponse'),
        valid.replace('&lt;ResponseHeader&gt;', '&lt;ResponseHeader xmlns=&quot;https://foreign.example.invalid/&quot;&gt;'),
        valid.replace('<s:Body>', '<s:Header/><s:Body>'),
    ];
    for (const body of variants)
        assert.throws(() => parseReadOnlyResponse({ ...context('GetDecisionList'), body: bytes(body) }), fails('UNSUPPORTED_RESPONSE_SHAPE'));
});

test('DTD, custom entities, processing instructions and external references are refused at either XML layer', () => {
    const valid = soap('GetDecisionList', payload('GetDecisionList')).toString('utf8');
    const external = '<!DOCTYPE data [<!ENTITY leak SYSTEM "file:///synthetic-private-file">]>';
    for (const body of [external + valid, '<?unsafe data?>' + valid,
        valid.replace('<s:Body>', '<s:Body>&undeclared;'),
        soap('GetDecisionList', external + payload('GetDecisionList')).toString('utf8'),
        soap('GetDecisionList', '<?unsafe data?>' + payload('GetDecisionList')).toString('utf8')]) {
        assert.throws(() => parseReadOnlyResponse({ ...context('GetDecisionList'), body: bytes(body) }),
            error => error instanceof NetHamishpatProtocolError && ['UNSAFE_XML', 'INVALID_XML'].includes(error.code));
    }
});

test('unsupported attributes and nested result markup fail closed instead of selecting by local name', () => {
    const valid = soap('GetDecisionList', payload('GetDecisionList')).toString('utf8');
    for (const body of [valid.replace('<GetDecisionListResult>', '<GetDecisionListResult href="https://foreign.example.invalid/">'),
        valid.replace('<GetDecisionListResult>', '<GetDecisionListResult><nested/>'),
        valid.replace('&lt;ResponseData&gt;', '&lt;ResponseData xmlns:xsi=&quot;http://www.w3.org/2001/XMLSchema-instance&quot; xsi:nil=&quot;true&quot;&gt;')])
        assert.throws(() => parseReadOnlyResponse({ ...context('GetDecisionList'), body: bytes(body) }),
            error => error instanceof NetHamishpatProtocolError && ['UNSUPPORTED_XML_ATTRIBUTE', 'UNSUPPORTED_RESPONSE_SHAPE'].includes(error.code));
});

test('unknown fields, duplicate headers/containers, unexpected record wrappers and duplicate IDs are never silently dropped', () => {
    const valid = payload('GetDecisionList', decision());
    const variants = [
        valid.replace('</Decision>', '<UnknownField>data</UnknownField></Decision>'),
        valid.replace('</ResponseHeader>', '<MessageId>0</MessageId></ResponseHeader>'),
        valid.replace('<ResponseData>', '<ResponseHeader/><ResponseData>'),
        valid.replace('</ResponseData>', '</ResponseData><ResponseData/>'),
        valid.replace('<Decision>', '<Unexpected><Decision>').replace('</Decision>', '</Decision></Unexpected>'),
        valid.replace('</GetDecisionResponse>', '<Unexpected/></GetDecisionResponse>'),
        valid.replace('<DecisionID>101</DecisionID>', ''),
    ];
    for (const inner of variants) assert.throws(() => parse('GetDecisionList', inner), fails('UNSUPPORTED_RESPONSE_SHAPE'));
    assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', decision() + decision())), fails('DUPLICATE_RESPONSE_ITEM'));
});

test('known scalar fields are validated and absent optional fields remain null', () => {
    const empty = parse('GetDecisionList', payload('GetDecisionList', decision())).items[0];
    assert.equal(empty.documentId, null);
    assert.equal(empty.signedAt, null);
    assert.equal(empty.isInstruction, null);
    for (const extra of ['<DocumentID>../file</DocumentID>', '<DecisionNumber>1.5</DecisionNumber>',
        '<IsInstruction>yes</IsInstruction>', '<DecisionSignatureDate>2026-02-30T10:00:00</DecisionSignatureDate>',
        '<DecisionSignatureDate>2026-05-12T24:00:00Z</DecisionSignatureDate>',
        '<DecisionSignatureDate>2026-05-12T10:00:00+14:30</DecisionSignatureDate>',
        '<DecisionSignatureDate>12/05/2026</DecisionSignatureDate>', '<DecisionName><nested/></DecisionName>'])
        assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', decision('101', extra))), fails('UNSUPPORTED_RESPONSE_SHAPE'));
});

test('decision responses cannot combine different internal court cases, while distinct decisions in one case are retained', () => {
    const sameCase = parse('GetDecisionList', payload('GetDecisionList', decision('101') + decision('102')));
    assert.deepEqual(sameCase.items.map(value => value.decisionId), ['101', '102']);
    const differentCase = decision('102').replace('<CaseID>99999999</CaseID>', '<CaseID>88888888</CaseID>');
    assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', decision('101') + differentCase)), fails('MIXED_RESPONSE_CASE_IDS'));
});

test('byte, UTF-8, XML depth, element, field and item limits apply before returning records', () => {
    for (const body of ['', '<Envelope/>'])
        assert.throws(() => parseReadOnlyResponse({ ...context('GetDecisionList'), body }), fails('INVALID_XML_BYTES'));
    assert.throws(() => parseReadOnlyResponse({ ...context('GetDecisionList'), body: Buffer.alloc(LIMITS.responseBytes + 1) }), fails('RESPONSE_SIZE_LIMIT'));
    assert.throws(() => parseReadOnlyResponse({ ...context('GetDecisionList'), body: Buffer.from([0xc3, 0x28]) }), fails('INVALID_XML_BYTES'));
    assert.throws(() => parse('GetDecisionList', '<x>'.repeat(LIMITS.depth + 1) + '</x>'.repeat(LIMITS.depth + 1)), fails('XML_STRUCTURE_LIMIT'));
    assert.throws(() => parse('GetDecisionList', '<x>' + '<v/>'.repeat(LIMITS.elements) + '</x>'), fails('XML_STRUCTURE_LIMIT'));
    assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', decision('101', `<DecisionName>${'a'.repeat(LIMITS.fieldCharacters + 1)}</DecisionName>`))), fails('UNSUPPORTED_RESPONSE_SHAPE'));
    const many = Array.from({ length: LIMITS.items + 1 }, (_, i) => decision(String(i + 1))).join('');
    assert.throws(() => parse('GetDecisionList', payload('GetDecisionList', many)), fails('RESPONSE_ITEM_LIMIT'));
});

test('UTF-8 BOM and a CDATA SOAP string are accepted without accepting unknown XML encodings', () => {
    const inner = payload('GetDecisionList', decision('101', '<DecisionName>&quot;בדיקה&quot;</DecisionName>'));
    const body = bytes(`\uFEFF<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="${SOAP}"><s:Body>` +
        `<GetDecisionListResponse xmlns="${TEMP}"><GetDecisionListResult><![CDATA[${inner}]]></GetDecisionListResult>` +
        '</GetDecisionListResponse></s:Body></s:Envelope>');
    assert.equal(parseReadOnlyResponse({ ...context('GetDecisionList'), body }).items[0].title, '"בדיקה"');
    assert.throws(() => parseReadOnlyResponse({ ...context('GetDecisionList'), body: bytes('<?xml version="1.0" encoding="UTF-16"?>' + soap('GetDecisionList', inner).toString('utf8')) }), fails('UNSUPPORTED_XML_ENCODING'));
});

test('protocol request preparation cannot become success through guessed protocol response fixtures or 1868', () => {
    for (const code of [0, 1868]) {
        const inner = `<GetProtocolResponse><ResponseHeader><RequestId>42</RequestId><MessageId>${code}</MessageId>` +
            '</ResponseHeader><ResponseData/></GetProtocolResponse>';
        assert.throws(() => parse('GetProtocolList', inner), fails('UNVERIFIED_RESPONSE_PROFILE'));
    }
});
