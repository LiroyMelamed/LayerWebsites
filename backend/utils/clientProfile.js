// This profile describes a client/contact. It never grants signing authority.
// Keep identifiers as text: leading zeroes and international identifiers matter.
const PROFILE_VERSION = 1;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function invalid(field) {
    const error = new Error('Invalid client profile');
    error.code = 'INVALID_CLIENT_PROFILE';
    error.field = field;
    error.httpStatus = 400;
    throw error;
}

function object(value, field, keys) {
    if (value === undefined || value === null) return {};
    if (!isObject(value)) invalid(field);
    for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(`${field}.${key}`);
    return value;
}

function text(value, field, maxLength) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string') invalid(field);
    const result = value.trim();
    if (result.length > maxLength || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(result)) invalid(field);
    return result;
}

function enumeration(value, field, values, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string' || !values.includes(value)) invalid(field);
    return value;
}

function normalizeClientProfile(value) {
    const profile = object(value, 'clientProfile', ['version', 'partyType', 'identity', 'organization', 'address']);
    if (profile.version !== undefined && profile.version !== PROFILE_VERSION) invalid('clientProfile.version');
    const identity = object(profile.identity, 'clientProfile.identity', ['type', 'number', 'country']);
    const organization = object(profile.organization, 'clientProfile.organization', ['registrationType', 'registrationNumber', 'registrationCountry']);
    const address = object(profile.address, 'clientProfile.address', ['line1', 'line2', 'city', 'postalCode', 'country']);
    return {
        version: PROFILE_VERSION,
        partyType: enumeration(profile.partyType, 'clientProfile.partyType', ['person', 'organization'], 'person'),
        identity: {
            type: enumeration(identity.type, 'clientProfile.identity.type', ['national_id', 'passport', 'other'], 'national_id'),
            number: text(identity.number, 'clientProfile.identity.number', 40),
            country: text(identity.country, 'clientProfile.identity.country', 80),
        },
        organization: {
            registrationType: enumeration(organization.registrationType, 'clientProfile.organization.registrationType', ['company', 'partnership', 'nonprofit', 'other'], 'company'),
            registrationNumber: text(organization.registrationNumber, 'clientProfile.organization.registrationNumber', 40),
            registrationCountry: text(organization.registrationCountry, 'clientProfile.organization.registrationCountry', 80),
        },
        address: {
            line1: text(address.line1, 'clientProfile.address.line1', 250),
            line2: text(address.line2, 'clientProfile.address.line2', 250),
            city: text(address.city, 'clientProfile.address.city', 100),
            postalCode: text(address.postalCode, 'clientProfile.address.postalCode', 24),
            country: text(address.country, 'clientProfile.address.country', 80),
        },
    };
}

function clientProfilePatch(body) {
    const lower = hasOwn(body, 'clientProfile');
    const upper = hasOwn(body, 'ClientProfile');
    if (lower && upper) invalid('clientProfile');
    return { present: lower || upper, value: lower || upper ? normalizeClientProfile(body[lower ? 'clientProfile' : 'ClientProfile']) : null };
}

function clientProfileResponse(row) {
    return { ClientProfile: normalizeClientProfile(row?.client_profile) };
}

module.exports = { normalizeClientProfile, clientProfilePatch, clientProfileResponse };
