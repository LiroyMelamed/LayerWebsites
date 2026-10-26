'use strict';

const { normalizeClientProfile } = require('../../utils/clientProfile');

// This is a pure formatter for a record already obtained through an authorized
// customer read. It neither resolves customer IDs nor establishes signing authority.
function clientDocumentValues(record, { includeExtended = false } = {}) {
    const row = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    const rawProfile = row.ClientProfile || row.clientProfile || row.client_profile;
    const profile = normalizeClientProfile(rawProfile);
    const present = (object, key) => object && typeof object === 'object' && !Array.isArray(object)
        && Object.hasOwn(object, key) && object[key] !== undefined && object[key] !== null && object[key] !== '';
    const text = keys => {
        for (const key of keys) {
            if (Object.hasOwn(row, key) && typeof row[key] === 'string' && row[key] !== '') return row[key];
        }
        return '';
    };
    const birthDate = text(['dateofbirth', 'DateOfBirth']);
    const isDate = /^\d{4}-\d{2}-\d{2}$/u.test(birthDate)
        && Number.isFinite(Date.parse(`${birthDate}T00:00:00Z`))
        && new Date(`${birthDate}T00:00:00Z`).toISOString().slice(0, 10) === birthDate;
    const organization = rawProfile?.partyType === 'organization';
    const values = {
        'client.fullName': text(['name', 'Name']),
        'client.companyName': text(['companyname', 'CompanyName', 'company']),
        'client.identityNumber': profile.identity.number,
        'client.companyNumber': profile.partyType === 'organization' ? profile.organization.registrationNumber : '',
        'client.address': ['line1', 'line2', 'city', 'postalCode', 'country']
            .map(key => profile.address[key]).filter(Boolean).join(', '),
        'client.email': text(['email', 'Email']),
        'client.phone': text(['phonenumber', 'PhoneNumber', 'phoneNumber', 'phone']),
    };
    if (includeExtended) Object.assign(values, {
        'client.partyType': present(rawProfile, 'partyType') ? profile.partyType : '',
        'client.identityType': present(rawProfile?.identity, 'type') ? profile.identity.type : '',
        'client.identityCountry': present(rawProfile?.identity, 'country') ? profile.identity.country : '',
        'client.companyRegistrationType': organization && present(rawProfile?.organization, 'registrationType') ? profile.organization.registrationType : '',
        'client.companyRegistrationCountry': organization && present(rawProfile?.organization, 'registrationCountry') ? profile.organization.registrationCountry : '',
        'client.birthDate': isDate ? birthDate : '',
        ...Object.fromEntries(['line1', 'line2', 'city', 'postalCode', 'country'].map(key => [`client.address.${key}`, profile.address[key]])),
    });
    return values;
}

module.exports = { clientDocumentValues };
