'use strict';

const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');
const { SaxesParser } = require('saxes');

// Independently implemented codec, not a transport or evidence of court access.
// SOAP actions/parameter names: public WSDL copies at the immutable commit below.
// Inner XML fields: docs/API_REFERENCE.md in that authored technical repository.
// https://github.com/zomer-g/net-hamishpat-api/tree/371f7d88fbfecc0abaeca85b14fbc1e7458acf3a
// The official endpoint's authenticated contract has NOT been validated here.
const CONTRACT = Object.freeze({
    status: 'PUBLIC_MIRROR_PROFILE_NOT_LIVE_VALIDATED',
    repository: 'https://github.com/zomer-g/net-hamishpat-api',
    commit: '371f7d88fbfecc0abaeca85b14fbc1e7458acf3a',
});
const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const SERVICE = 'http://tempuri.org/';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const BASE = 'https://secure.court.gov.il/NGCS.SoftwareCompaniesInterfaces.SI/';
const LIMITS = Object.freeze({ requestBytes: 8192, responseBytes: 1024 * 1024,
    innerBytes: 512 * 1024, depth: 16, elements: 10000, items: 500, fieldCharacters: 8192 });
const OPERATIONS = Object.freeze({
    GetDecisionList: Object.freeze({ service: 'DecisionSI', requestRoot: 'GetDecisionRequest',
        responseRoot: 'GetDecisionResponse', item: 'Decision' }),
    GetProcessList: Object.freeze({ service: 'DecisionSI', requestRoot: 'GetProcessListRequest',
        responseRoot: 'GetProcessListResponse', item: 'EntityData' }),
    // Published sources conflict on Protocol versus decision and do not establish
    // its inner response root. Build its known request, but do not guess success.
    GetProtocolList: Object.freeze({ service: 'ProtocolListSI', requestRoot: 'GetProtocolRequest',
        responseRoot: null, item: null }),
});

class NetHamishpatProtocolError extends Error {
    constructor(code, providerMessageId) {
        super(code);
        this.name = 'NetHamishpatProtocolError';
        this.code = code;
        if (Number.isSafeInteger(providerMessageId)) this.providerMessageId = providerMessageId;
    }
}
const reject = (code, providerMessageId) => { throw new NetHamishpatProtocolError(code, providerMessageId); };
const plain = value => value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) && !Array.isArray(value);
function keys(value, allowed) {
    if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) reject('INVALID_REQUEST');
}
function positiveInt(value, max, code = 'INVALID_REQUEST') {
    if (!Number.isSafeInteger(value) || value < 1 || value > max) reject(code);
    return value;
}
function operationProfile(operation) {
    if (typeof operation !== 'string' || !Object.hasOwn(OPERATIONS, operation)) reject('UNSUPPORTED_OPERATION');
    return OPERATIONS[operation];
}
function normalizeCaseIdentification(value) {
    keys(value, ['number', 'month', 'year']);
    const number = positiveInt(value.number, 9999999);
    const month = positiveInt(value.month, 12);
    // The century must come from an explicit caller value, never a two-digit guess.
    const year = positiveInt(value.year, 9999);
    if (year < 1000) reject('INVALID_REQUEST');
    return Object.freeze({ number, month, year });
}
function validUserId(value) {
    if (typeof value !== 'string' || !/^\d{9}$/.test(value) || /^0+$/.test(value)) return false;
    return [...value].reduce((sum, digit, index) => {
        const product = Number(digit) * (index % 2 ? 2 : 1);
        return sum + (product > 9 ? product - 9 : product);
    }, 0) % 10 === 0;
}
const escapeXml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function buildReadOnlyRequest(input) {
    keys(input, ['operation', 'requestId', 'userType', 'userId', 'caseIdentification']);
    const profile = operationProfile(input.operation);
    const requestId = positiveInt(input.requestId, 2147483647);
    if (input.userType !== undefined && input.userType !== 'תז' || !validUserId(input.userId)) reject('INVALID_REQUEST');
    const caseIdentification = normalizeCaseIdentification(input.caseIdentification);
    const { number, month, year } = caseIdentification;
    const inner = '<?xml version="1.0" encoding="utf-8"?>' +
        `<${profile.requestRoot}><RequestHeader><RequestId>${escapeXml(requestId)}</RequestId>` +
        `<UserType>${escapeXml('תז')}</UserType><UserId>${escapeXml(input.userId)}</UserId></RequestHeader>` +
        '<RequestData><CaseIdentification><NewCaseIdentification><NumeratorGroupID>1</NumeratorGroupID>' +
        `<CaseNumber>${escapeXml(number)}</CaseNumber><CaseMonth>${escapeXml(month)}</CaseMonth>` +
        `<CaseYear>${escapeXml(year)}</CaseYear></NewCaseIdentification></CaseIdentification></RequestData>` +
        `</${profile.requestRoot}>`;
    const body = Buffer.from('<?xml version="1.0" encoding="utf-8"?>' +
        `<soap:Envelope xmlns:soap="${SOAP}"><soap:Body><${input.operation} xmlns="${SERVICE}">` +
        `<strRequestXML>${escapeXml(inner)}</strRequestXML></${input.operation}></soap:Body></soap:Envelope>`, 'utf8');
    if (body.length > LIMITS.requestBytes) reject('REQUEST_SIZE_LIMIT');
    return {
        endpoint: `${BASE}${profile.service}.asmx`, method: 'POST',
        headers: Object.freeze({ 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${SERVICE}${input.operation}"` }),
        body,
        context: Object.freeze({ operation: input.operation, requestId, caseIdentification }),
        contract: CONTRACT,
    };
}

function xmlText(body, limit) {
    if (!(body instanceof Uint8Array) || body.byteLength === 0) reject('INVALID_XML_BYTES');
    if (body.byteLength > limit) reject('RESPONSE_SIZE_LIMIT');
    let xml;
    try { xml = new TextDecoder('utf-8', { fatal: true }).decode(body); }
    catch { reject('INVALID_XML_BYTES'); }
    if (/<!\s*(?:DOCTYPE|ENTITY)/iu.test(xml)) reject('UNSAFE_XML');
    return xml;
}
function parseTree(body, limit) {
    const xml = xmlText(body, limit);
    const stack = [];
    let root = null, elements = 0;
    const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: '1.0', forceXMLVersion: true });
    parser.on('doctype', () => reject('UNSAFE_XML'));
    parser.on('processinginstruction', () => reject('UNSAFE_XML'));
    parser.on('xmldecl', declaration => {
        if (declaration.version !== '1.0' || declaration.encoding && !/^utf-8$/i.test(declaration.encoding)) reject('UNSUPPORTED_XML_ENCODING');
    });
    parser.on('error', () => reject('INVALID_XML'));
    parser.on('opentag', tag => {
        if (++elements > LIMITS.elements || stack.length >= LIMITS.depth) reject('XML_STRUCTURE_LIMIT');
        if (Object.values(tag.attributes).some(attribute => attribute.uri !== XMLNS)) reject('UNSUPPORTED_XML_ATTRIBUTE');
        const node = { name: tag.local, namespace: tag.uri, children: [], text: '' };
        if (stack.length) stack[stack.length - 1].children.push(node);
        else if (root) reject('INVALID_XML');
        else root = node;
        stack.push(node);
    });
    const text = value => {
        if (!stack.length) { if (value.trim()) reject('INVALID_XML'); return; }
        const node = stack[stack.length - 1];
        node.text += value;
        if (node.text.length > LIMITS.innerBytes) reject('XML_STRUCTURE_LIMIT');
    };
    parser.on('text', text);
    parser.on('cdata', text);
    parser.on('closetag', () => stack.pop());
    try { parser.write(xml).close(); }
    catch (error) {
        if (error instanceof NetHamishpatProtocolError) throw error;
        reject('INVALID_XML');
    }
    if (!root || stack.length) reject('INVALID_XML');
    return root;
}
function element(node, name, namespace = '') {
    if (!node || node.name !== name || node.namespace !== namespace) reject('UNSUPPORTED_RESPONSE_SHAPE');
    return node;
}
function container(node) {
    if (node.text.trim()) reject('UNSUPPORTED_RESPONSE_SHAPE');
}
function single(node, name, namespace = '', required = true) {
    const matches = node.children.filter(child => child.name === name && child.namespace === namespace);
    if (matches.length > 1 || required && matches.length !== 1) reject('UNSUPPORTED_RESPONSE_SHAPE');
    return matches[0];
}
function scalar(node) {
    if (node.children.length || node.text.length > LIMITS.fieldCharacters) reject('UNSUPPORTED_RESPONSE_SHAPE');
    return node.text.trim();
}
function fields(node, allowed, required = []) {
    container(node);
    const result = Object.create(null);
    for (const child of node.children) {
        if (child.namespace !== '' || !allowed.includes(child.name) || Object.hasOwn(result, child.name)) reject('UNSUPPORTED_RESPONSE_SHAPE');
        result[child.name] = scalar(child);
    }
    if (required.some(name => !Object.hasOwn(result, name))) reject('UNSUPPORTED_RESPONSE_SHAPE');
    return result;
}
function id(value, required = false) {
    if (value === undefined || value === '') {
        if (required) reject('UNSUPPORTED_RESPONSE_SHAPE');
        return null;
    }
    if (!/^[1-9]\d{0,19}$/.test(value)) reject('UNSUPPORTED_RESPONSE_SHAPE');
    return value;
}
function integer(value) {
    if (value === undefined || value === '') return null;
    if (!/^(?:0|[1-9]\d{0,9})$/.test(value) || Number(value) > 2147483647) reject('UNSUPPORTED_RESPONSE_SHAPE');
    return Number(value);
}
function boolean(value) {
    if (value === undefined || value === '') return null;
    if (!/^(?:true|false)$/i.test(value)) reject('UNSUPPORTED_RESPONSE_SHAPE');
    return value.toLowerCase() === 'true';
}
function date(value) {
    if (value === undefined || value === '') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(?:Z|([+-])(\d{2}):(\d{2}))?)?$/.exec(value);
    if (!match) reject('UNSUPPORTED_RESPONSE_SHAPE');
    const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
    const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    if (Number(year) < 1000 || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days ||
        hour !== undefined && (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) ||
        offsetHour !== undefined && (Number(offsetHour) > 14 || Number(offsetMinute) > 59 || Number(offsetHour) === 14 && Number(offsetMinute) !== 0))
        reject('UNSUPPORTED_RESPONSE_SHAPE');
    // A source value without an offset stays without an offset; no timezone guess.
    return value;
}
function decision(node) {
    const value = fields(node, ['CaseID', 'DecisionID', 'DecisionNumber', 'DecisionName', 'DecisionSignatureDate',
        'DecisionSignatureUserName', 'DecisionTypeID', 'IsInstruction', 'IsDecisionInProtocol', 'PrivillageID', 'DocumentID'], ['CaseID', 'DecisionID']);
    return { kind: 'decision', caseId: id(value.CaseID, true), decisionId: id(value.DecisionID, true),
        decisionNumber: integer(value.DecisionNumber), title: value.DecisionName || null,
        signedAt: date(value.DecisionSignatureDate), signedBy: value.DecisionSignatureUserName || null,
        decisionTypeId: integer(value.DecisionTypeID), isInstruction: boolean(value.IsInstruction),
        isDecisionInProtocol: boolean(value.IsDecisionInProtocol), privilegeId: integer(value.PrivillageID), documentId: id(value.DocumentID) };
}
function entity(node) {
    const value = fields(node, ['ProcessGroupID', 'ProcessNumber', 'EntityID', 'EntityType', 'EntityDisplayName', 'EntityDate',
        'IsProcessOpeningEntity', 'DocumentTypeID', 'DocumentID'], ['EntityID']);
    return { kind: 'entity', processGroupId: id(value.ProcessGroupID), processNumber: integer(value.ProcessNumber),
        entityId: id(value.EntityID, true), entityType: integer(value.EntityType), title: value.EntityDisplayName || null,
        occurredAt: date(value.EntityDate), isProcessOpeningEntity: boolean(value.IsProcessOpeningEntity),
        documentTypeId: integer(value.DocumentTypeID), documentId: id(value.DocumentID) };
}
function parseReadOnlyResponse(input) {
    keys(input, ['operation', 'requestId', 'caseIdentification', 'body']);
    const profile = operationProfile(input.operation);
    const requestId = positiveInt(input.requestId, 2147483647);
    const caseIdentification = normalizeCaseIdentification(input.caseIdentification);
    const envelope = element(parseTree(input.body, LIMITS.responseBytes), 'Envelope', SOAP);
    container(envelope);
    const soapBody = single(envelope, 'Body', SOAP);
    if (envelope.children.length !== 1) reject('UNSUPPORTED_RESPONSE_SHAPE');
    container(soapBody);
    if (soapBody.children.length !== 1) reject('UNSUPPORTED_RESPONSE_SHAPE');
    const response = soapBody.children[0];
    if (response.name === 'Fault' && response.namespace === SOAP) reject('SOAP_FAULT');
    element(response, `${input.operation}Response`, SERVICE);
    container(response);
    const result = single(response, `${input.operation}Result`, SERVICE);
    if (response.children.length !== 1 || result.children.length) reject('UNSUPPORTED_RESPONSE_SHAPE');
    // WSDL describes only a string, and published protocol response profiles conflict.
    if (!profile.responseRoot) reject('UNVERIFIED_RESPONSE_PROFILE');
    const payload = element(parseTree(Buffer.from(result.text, 'utf8'), LIMITS.innerBytes), profile.responseRoot);
    container(payload);
    if (payload.children.some(child => child.namespace !== '' || !['ResponseHeader', 'ResponseData'].includes(child.name))) reject('UNSUPPORTED_RESPONSE_SHAPE');
    const header = fields(single(payload, 'ResponseHeader'), ['RequestId', 'MessageId', 'MessageDesc'], ['RequestId', 'MessageId']);
    if (!/^[1-9]\d{0,9}$/.test(header.RequestId) || Number(header.RequestId) > 2147483647) reject('INVALID_RESPONSE_REQUEST_ID');
    if (Number(header.RequestId) !== requestId) reject('RESPONSE_REQUEST_ID_MISMATCH');
    const providerMessageId = header.MessageId === '' ? null : integer(header.MessageId);
    if (providerMessageId !== null && providerMessageId !== 0 && providerMessageId !== 1868) reject('COURT_PROVIDER_REJECTED', providerMessageId);
    // MessageDesc is free text; only the structured header code determines status.
    const data = single(payload, 'ResponseData', '', providerMessageId !== 1868);
    if (data) container(data);
    const rows = data?.children || [];
    if (rows.length > LIMITS.items) reject('RESPONSE_ITEM_LIMIT');
    if (providerMessageId === 1868 && rows.length) reject('CONTRADICTORY_EMPTY_RESPONSE', providerMessageId);
    const ids = new Set();
    let responseCaseId = null;
    const items = rows.map(row => {
        element(row, profile.item);
        const value = input.operation === 'GetDecisionList' ? decision(row) : entity(row);
        if (value.kind === 'decision') {
            if (responseCaseId !== null && responseCaseId !== value.caseId) reject('MIXED_RESPONSE_CASE_IDS');
            responseCaseId = value.caseId;
        }
        const identifier = value.decisionId || value.entityId;
        if (ids.has(identifier)) reject('DUPLICATE_RESPONSE_ITEM');
        ids.add(identifier);
        return value;
    });
    return { operation: input.operation, requestId, caseIdentification,
        status: providerMessageId === 1868 ? 'empty' : 'success', providerMessageId, items,
        provenance: { contract: CONTRACT, endpoint: `${BASE}${profile.service}.asmx`,
            soapAction: `${SERVICE}${input.operation}`, responseSha256: createHash('sha256').update(input.body).digest('hex'),
            authentication: 'NOT_VERIFIED_BY_CODEC', caseBinding: 'REQUEST_CONTEXT_ONLY' } };
}

module.exports = { CONTRACT, LIMITS, OPERATIONS, NetHamishpatProtocolError,
    normalizeCaseIdentification, buildReadOnlyRequest, parseReadOnlyResponse };
