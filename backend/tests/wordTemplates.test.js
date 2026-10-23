'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { importDocx, createBinding, materializeDocx } = require('../lib/wordTemplates');
const { clientDocumentValues } = require('../lib/wordTemplates/clientValues');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const C = 'http://schemas.openxmlformats.org/package/2006/content-types';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
function fixture(body, extra = {}) {
    const zip = new AdmZip();
    const files = {
        '[Content_Types].xml': `<Types xmlns="${C}"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
        '_rels/.rels': `<Relationships xmlns="${R}"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
        'word/document.xml': `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
        'docProps/core.xml': '<original metadata="preserve"><text>original metadata</text></original>',
        ...extra,
    };
    for (const [name, data] of Object.entries(files)) zip.addFile(name, Buffer.from(data));
    return zip.toBuffer();
}
const paragraph = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
function bind(model, field, start, end, overrides = {}) {
    return createBinding(model, { id: `b${start}`, field, part: 'word/document.xml', paragraphId: 'p0', start, end, ...overrides });
}
function xml(buffer, part = 'word/document.xml') { return new AdmZip(buffer).readAsText(part); }
function code(expected) { return e => { assert.equal(e.code, expected); return true; }; }

test('complex nested fields protect cached results across paragraphs and stop at the final end', () => {
    const field = type => `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`;
    const source = fixture(`<w:p>${field('begin')}<w:r><w:instrText>TOC</w:instrText></w:r>${field('separate')}</w:p>`
        + paragraph('cached ____') + `<w:p>${field('begin')}${field('separate')}</w:p>`
        + paragraph('nested ____') + `<w:p>${field('end')}</w:p>` + paragraph('outer ____')
        + `<w:p>${field('end')}</w:p>` + paragraph('normal ____'));
    const model = importDocx(source);
    const paragraphs = model.parts[0].paragraphs;
    assert.deepEqual(paragraphs.map(p => p.editable), [false, false, false, false, false, false, false, true]);
    for (const index of [1, 3, 5]) assert.throws(() => bind(model, 'client.fullName', 0, 4,
        { paragraphId: `p${index}` }), code('UNSUPPORTED_SELECTION'));
    const binding = bind(model, 'client.fullName', 7, 11, { paragraphId: 'p7' });
    const result = materializeDocx(source, { sourceHash: model.sourceHash, bindings: [binding], values: { 'client.fullName': 'Test person' } });
    const updated = importDocx(result.buffer).parts[0].paragraphs;
    assert.equal(updated[7].text, 'normal Test person');
    assert.equal(updated[1].text, 'cached ____');
    assert.equal(updated[3].text, 'nested ____');
});

test('malformed or unclosed complex fields cannot expose editable cached results', () => {
    for (const type of ['begin', 'end', 'separate', 'unknown']) {
        const model = importDocx(fixture(`<w:p><w:r><w:fldChar w:fldCharType="${type}"/></w:r></w:p>` + paragraph('____')));
        assert.equal(model.parts[0].paragraphs[1].editable, false);
        assert.throws(() => bind(model, 'client.fullName', 0, 4, { paragraphId: 'p1' }), code('UNSUPPORTED_SELECTION'));
    }
});

test('imports text across runs, table cells, headers and footers with entity decoding', () => {
    const source = fixture('<w:p><w:r><w:t>שוכר </w:t></w:r><w:r><w:t>____ &amp; test</w:t></w:r></w:p><w:tbl><w:tr><w:tc>' + paragraph('חברה') + '</w:tc></w:tr></w:tbl>', {
        'word/header1.xml': `<w:hdr xmlns:w="${W}">${paragraph('משרד ____')}</w:hdr>`,
        'word/footer1.xml': `<w:ftr xmlns:w="${W}">${paragraph('עמוד ____')}</w:ftr>`,
    });
    const model = importDocx(source);
    assert.equal(model.sourceHash, crypto.createHash('sha256').update(source).digest('hex'));
    assert.equal(model.offsetUnit, 'utf16');
    assert.equal(model.parts.find(p => p.name === 'word/document.xml').paragraphs[0].text, 'שוכר ____ & test');
    assert.equal(model.parts.find(p => p.name === 'word/document.xml').paragraphs[1].text, 'חברה');
    assert.deepEqual(model.parts.find(p => p.name === 'word/document.xml').paragraphs[0].blanks, [{ start: 5, end: 9 }]);
    assert.equal(model.parts.length, 3);
});

test('materializes split runs with first-run formatting, XML escaping, repeats and leading zeros', () => {
    const original = fixture('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ת״ז __</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>__ ושוב ____ סוף</w:t></w:r></w:p>', { 'word/media/logo.png': Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]) });
    const before = Buffer.from(original);
    const model = importDocx(original);
    const first = bind(model, 'client.identityNumber', 4, 8);
    const second = bind(model, 'client.identityNumber', 14, 18, { id: 'repeat' });
    const result = materializeDocx(original, { sourceHash: model.sourceHash, bindings: [first, second], values: { 'client.identityNumber': '001234567' } });
    assert.equal(importDocx(result.buffer).parts[0].paragraphs[0].text, 'ת״ז 001234567 ושוב 001234567 סוף');
    assert.match(xml(result.buffer), /<w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">ת״ז 001234567<\/w:t>/u);
    assert.match(xml(result.buffer), /<w:rPr><w:i\/><\/w:rPr>/u);
    for (const part of ['docProps/core.xml', 'word/media/logo.png', '_rels/.rels', '[Content_Types].xml']) {
        assert.deepEqual(new AdmZip(result.buffer).readFile(part), new AdmZip(original).readFile(part));
    }
    assert.deepEqual(original, before);
    assert.equal(result.requiresPdfConversion, true);
    assert.equal(result.requiresFreshSigningGeometry, true);
    assert.equal(result.bindings[0].valueHash, crypto.createHash('sha256').update('001234567').digest('hex'));
    assert.ok(!JSON.stringify(result.bindings).includes('001234567'));
});

test('replaces several nonoverlapping selections in one run without offset drift', () => {
    const source = fixture(paragraph('שם ____ ת״ז ____'));
    const model = importDocx(source);
    const result = materializeDocx(source, { sourceHash: model.sourceHash,
        bindings: [bind(model, 'client.fullName', 3, 7), bind(model, 'client.identityNumber', 12, 16)],
        values: { 'client.fullName': 'אב & בן <ג>', 'client.identityNumber': '000000001' } });
    assert.equal(importDocx(result.buffer).parts[0].paragraphs[0].text, 'שם אב & בן <ג> ת״ז 000000001');
    assert.ok(xml(result.buffer).includes('אב &amp; בן &lt;ג&gt;'));
});

test('supports table, header and footer role/case/office bindings', () => {
    const source = fixture('<w:tbl><w:tr><w:tc>' + paragraph('____') + '</w:tc></w:tr></w:tbl>', {
        'word/header1.xml': `<w:hdr xmlns:w="${W}">${paragraph('____')}</w:hdr>`,
        'word/footer1.xml': `<w:ftr xmlns:w="${W}">${paragraph('____')}</w:ftr>`,
    });
    const model = importDocx(source);
    const bindings = [bind(model, 'role.lessor.companyNumber', 0, 4),
        bind(model, 'office.name', 0, 4, { id: 'header', part: 'word/header1.xml' }),
        bind(model, 'case.reference', 0, 4, { id: 'footer', part: 'word/footer1.xml' })];
    const result = materializeDocx(source, { sourceHash: model.sourceHash, bindings,
        values: { 'role.lessor.companyNumber': '005123456', 'office.name': 'משרד הדגמה', 'case.reference': '0001/26' } });
    assert.ok(xml(result.buffer).includes('005123456'));
    assert.ok(xml(result.buffer, 'word/header1.xml').includes('משרד הדגמה'));
    assert.ok(xml(result.buffer, 'word/footer1.xml').includes('0001/26'));
});

test('rejects stale source bytes and independently stale selection anchors', () => {
    const source = fixture(paragraph('____'));
    const model = importDocx(source);
    const binding = bind(model, 'client.fullName', 0, 4);
    assert.throws(() => materializeDocx(fixture(paragraph('changed')), { sourceHash: model.sourceHash, bindings: [binding], values: {} }), code('STALE_DOCX_SOURCE'));
    for (const property of ['sourceHash', 'paragraphHash', 'selectedTextHash']) {
        assert.throws(() => materializeDocx(source, { sourceHash: model.sourceHash, bindings: [{ ...binding, [property]: 'stale' }], values: {} }), code('STALE_OR_INVALID_BINDING'));
    }
});

test('rejects overlapping ranges, duplicate identifiers and arbitrary fields', () => {
    const source = fixture(paragraph('________'));
    const model = importDocx(source);
    const a = bind(model, 'client.fullName', 0, 5);
    const b = bind(model, 'client.identityNumber', 3, 8);
    assert.throws(() => materializeDocx(source, { sourceHash: model.sourceHash, bindings: [a, b], values: { 'client.fullName': 'Name' } }), code('OVERLAPPING_BINDINGS'));
    assert.throws(() => materializeDocx(source, { sourceHash: model.sourceHash, bindings: [a, a], values: { 'client.fullName': 'Name' } }), code('STALE_OR_INVALID_BINDING'));
    assert.throws(() => bind(model, 'client.password', 0, 1), code('INVALID_BINDING'));
});

test('required values block materialization; strings preserve numbers; optional blanks clear', () => {
    const source = fixture(paragraph('____'));
    const model = importDocx(source);
    const binding = bind(model, 'client.identityNumber', 0, 4);
    for (const values of [{}, { 'client.identityNumber': '' }, { 'client.identityNumber': '  ' }]) {
        assert.throws(() => materializeDocx(source, { sourceHash: model.sourceHash, bindings: [binding], values }), code('MISSING_REQUIRED_VALUE'));
    }
    assert.throws(() => materializeDocx(source, { sourceHash: model.sourceHash, bindings: [binding], values: { 'client.identityNumber': 123 } }), code('VALUE_MUST_BE_STRING'));
    const result = materializeDocx(source, { sourceHash: model.sourceHash, bindings: [{ ...binding, required: false }], values: {} });
    assert.equal(importDocx(result.buffer).parts[0].paragraphs[0].text, '');
});

test('rejects invisible control values, multiline layout changes and broken surrogate selections', () => {
    const source = fixture(paragraph('💙____'));
    const model = importDocx(source);
    assert.throws(() => bind(model, 'client.fullName', 1, 6), code('INVALID_SELECTION_RANGE'));
    const binding = bind(model, 'client.fullName', 2, 6);
    for (const value of ['a\nb', 'a\tb', '\0', '\ud800']) {
        assert.throws(() => materializeDocx(source, { sourceHash: model.sourceHash, bindings: [binding], values: { 'client.fullName': value } }), code('INVALID_FIELD_VALUE'));
    }
});

test('tabs and breaks are visible but cannot be replaced by a cross-gap selection', () => {
    const source = fixture('<w:p><w:r><w:t>AA</w:t><w:tab/><w:t>BB</w:t><w:br/><w:t>CC</w:t></w:r></w:p>');
    const model = importDocx(source);
    assert.equal(model.parts[0].paragraphs[0].text, 'AA\tBB\nCC');
    assert.throws(() => bind(model, 'client.fullName', 0, 5), code('UNSUPPORTED_SELECTION'));
});

for (const [label, body] of [
    ['tracked changes', '<w:ins>' + paragraph('____') + '</w:ins>'],
    ['content controls', '<w:sdt><w:sdtContent>' + paragraph('____') + '</w:sdtContent></w:sdt>'],
    ['Word fields', '<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:t>____</w:t></w:r></w:p>'],
    ['text boxes', '<w:txbxContent>' + paragraph('____') + '</w:txbxContent>'],
]) test(`clearly refuses editable selection in ${label}`, () => {
    const model = importDocx(fixture(body));
    assert.equal(model.parts[0].paragraphs[0].editable, false);
    assert.throws(() => bind(model, 'client.fullName', 0, 4), code('UNSUPPORTED_SELECTION'));
});

test('rejects malformed XML, DTD, custom entities and CDATA', () => {
    for (const document of ['<broken>', `<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document xmlns:w="${W}">&x;</w:document>`, `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t><![CDATA[____]]></w:t></w:r></w:p></w:body></w:document>`]) {
        assert.throws(() => importDocx(fixture('', { 'word/document.xml': document })), e => ['INVALID_XML', 'UNSAFE_XML', 'UNSUPPORTED_XML_CDATA'].includes(e.code));
    }
});

test('rejects external relationships, active embedded content and signed packages', () => {
    assert.throws(() => importDocx(fixture(paragraph('____'), { 'word/_rels/document.xml.rels': `<Relationships xmlns="${R}"><Relationship Id="x" Type="hyperlink" Target="https://example.invalid" TargetMode="External"/></Relationships>` })), code('EXTERNAL_OR_ACTIVE_RELATIONSHIP'));
    for (const name of ['word/vbaProject.bin', 'word/embeddings/embedded.docx', '_xmlsignatures/sig1.xml']) {
        assert.throws(() => importDocx(fixture(paragraph('____'), { [name]: 'no active content' })), code('ACTIVE_OR_SIGNED_PACKAGE_UNSUPPORTED'));
    }
});

test('ordinary package metadata relationships remain accepted', () => {
    const source = fixture(paragraph('____'), { '_rels/.rels': `<Relationships xmlns="${R}"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` });
    assert.equal(importDocx(source).parts[0].paragraphs[0].text, '____');
});

test('rejects active Word instructions even split across runs without external relationships', () => {
    for (const body of [
        '<w:p><w:r><w:instrText>INCLUDE</w:instrText></w:r><w:r><w:instrText>TEXT "file:///etc/passwd"</w:instrText></w:r></w:p>',
        '<w:p><w:fldSimple w:instr="DDEAUTO source target"><w:r><w:t>____</w:t></w:r></w:fldSimple></w:p>',
    ]) assert.throws(() => importDocx(fixture(body)), code('ACTIVE_WORD_FIELD_UNSUPPORTED'));
});

test('rejects legacy relative image references that could resolve outside the package', () => {
    const source = fixture(paragraph('____'), { 'word/drawings/legacy.vml': '<root><image src="../../private.png"/></root>' });
    assert.throws(() => importDocx(source), code('EXTERNAL_OR_ACTIVE_RELATIONSHIP'));
});

test('rejects broken internal package targets and non-DOCX archives', () => {
    assert.throws(() => importDocx(fixture(paragraph('____'), { '_rels/.rels': `<Relationships xmlns="${R}"><Relationship Id="x" Type="officeDocument" Target="../outside.xml"/></Relationships>` })), code('BROKEN_PACKAGE_RELATIONSHIP'));
    assert.throws(() => importDocx(Buffer.from('plain document')), code('DOCX_SIZE_LIMIT'));
    const zip = new AdmZip(); zip.addFile('anything.txt', Buffer.from('hello'));
    assert.throws(() => importDocx(zip.toBuffer()), code('NOT_A_DOCX'));
});

test('rejects path traversal, duplicate names and forged compressed expansion', () => {
    const source = fixture(paragraph('____'));
    const traversal = Buffer.from(source);
    // Independent ZIP writer emits same-length paths in local and central headers.
    const needle = Buffer.from('docProps/core.xml');
    for (let at = traversal.indexOf(needle); at >= 0; at = traversal.indexOf(needle, at + needle.length)) Buffer.from('../props/core.xml').copy(traversal, at);
    assert.throws(() => importDocx(traversal), code('UNSAFE_ZIP_PATH'));
    const duplicate = Buffer.from(source);
    for (let at = duplicate.indexOf(needle); at >= 0; at = duplicate.indexOf(needle, at + needle.length)) Buffer.from('word/document.xml').copy(duplicate, at);
    assert.throws(() => importDocx(duplicate), code('DUPLICATE_ZIP_PART'));
    const expansion = fixture(paragraph('____'), { 'word/media/bomb.txt': 'A'.repeat(1024 * 1024) });
    assert.throws(() => importDocx(expansion), code('ZIP_EXPANSION_LIMIT'));
    const forged = Buffer.from(source);
    const central = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    forged.writeUInt32LE(0xffffffff, central + 24);
    assert.throws(() => importDocx(forged), code('ZIP_EXPANSION_LIMIT'));
});

test('rejects CRC corruption and encrypted ZIP flags', () => {
    const source = fixture(paragraph('____'));
    const corrupt = Buffer.from(source);
    const central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    corrupt.writeUInt32LE(12345, central + 16);
    assert.throws(() => importDocx(corrupt), code('INVALID_ZIP'));
    const encrypted = Buffer.from(source); encrypted.writeUInt16LE(1, central + 8);
    assert.throws(() => importDocx(encrypted), code('UNSUPPORTED_ZIP'));
});

test('client values keep human contact and organization identities separate across PascalCase responses', () => {
    const row = Object.freeze({ Name: 'דנה ישראלי', CompanyName: 'חברת דוגמה בע״מ', Email: 'contact@example.invalid', PhoneNumber: '0500012345',
        ClientProfile: { partyType: 'organization', identity: { type: 'passport', number: '001234567', country: '' },
            organization: { registrationNumber: '005123456', registrationCountry: '' },
            address: { line1: 'רחוב דוגמה 12', line2: 'קומה 2', city: 'עיר דוגמה', postalCode: '0012345', country: '' } } });
    const before = JSON.stringify(row);
    assert.deepEqual(clientDocumentValues(row), {
        'client.fullName': 'דנה ישראלי', 'client.companyName': 'חברת דוגמה בע״מ',
        'client.identityNumber': '001234567', 'client.companyNumber': '005123456',
        'client.address': 'רחוב דוגמה 12, קומה 2, עיר דוגמה, 0012345',
        'client.email': 'contact@example.invalid', 'client.phone': '0500012345',
    });
    assert.equal(JSON.stringify(row), before);
});

test('client values support lowercase DB rows and existing company aliases without identifier coercion', () => {
    const profile = { partyType: 'organization', identity: { number: '000000001' }, organization: { registrationNumber: '000000002' } };
    for (const companyKey of ['companyname', 'company']) {
        const values = clientDocumentValues({ name: 'Human contact', [companyKey]: 'Separate legal entity', email: 'x@example.invalid', phonenumber: '+0012345', client_profile: profile });
        assert.equal(values['client.fullName'], 'Human contact');
        assert.equal(values['client.companyName'], 'Separate legal entity');
        assert.equal(values['client.identityNumber'], '000000001');
        assert.equal(values['client.companyNumber'], '000000002');
        assert.equal(values['client.phone'], '+0012345');
        assert.equal(values['client.address'], '');
    }
});

test('person records never expose organization registration as identity or company number', () => {
    const values = clientDocumentValues({ name: 'Person', companyname: 'Employer', clientProfile: {
        partyType: 'person', identity: { number: '000012345' }, organization: { registrationNumber: '005123456' }, address: { city: 'City' },
    } });
    assert.equal(values['client.identityNumber'], '000012345');
    assert.equal(values['client.companyNumber'], '');
    assert.equal(values['client.companyName'], 'Employer');
    assert.equal(values['client.address'], 'City');
});

test('omitted profiles and missing legacy fields stay empty with no inferred identity or country', () => {
    const empty = Object.fromEntries(['fullName', 'companyName', 'identityNumber', 'companyNumber', 'address', 'email', 'phone'].map(key => [`client.${key}`, '']));
    assert.deepEqual(clientDocumentValues(null), empty);
    assert.deepEqual(clientDocumentValues({}), empty);
    const old = clientDocumentValues({ Name: 'Existing person', PhoneNumber: '0500012345', Email: null });
    assert.equal(old['client.fullName'], 'Existing person');
    assert.equal(old['client.identityNumber'], '');
    assert.equal(old['client.companyNumber'], '');
    assert.equal(old['client.address'], '');
    assert.equal(old['client.email'], '');
});

test('client profile validation is enforced and aliases follow canonical precedence', () => {
    assert.throws(() => clientDocumentValues({ client_profile: { identity: { number: 123 } } }), e => e.code === 'INVALID_CLIENT_PROFILE');
    const values = clientDocumentValues({ name: 'Human', CompanyName: 'Entity', ClientProfile: { identity: { number: '0001' } }, clientProfile: { identity: { number: '0002' } }, client_profile: { identity: { number: '0003' } } });
    assert.equal(values['client.identityNumber'], '0001');
});

test('company-name bindings fill human and legal-entity names independently', () => {
    const source = fixture(paragraph('איש קשר ____ חברה ____'));
    const model = importDocx(source);
    const bindings = [bind(model, 'client.fullName', 8, 12), bind(model, 'client.companyName', 18, 22, { id: 'entity' })];
    const values = clientDocumentValues({ Name: 'דנה', CompanyName: 'חברת דוגמה' });
    const result = materializeDocx(source, { sourceHash: model.sourceHash, bindings, values });
    assert.equal(importDocx(result.buffer).parts[0].paragraphs[0].text, 'איש קשר דנה חברה חברת דוגמה');
    assert.equal(bind(model, 'role.landlord.companyName', 18, 22, { id: 'roleEntity' }).field, 'role.landlord.companyName');
});
