'use strict';

const { normalizeClientProfile } = require('../../utils/clientProfile');

// This is a pure formatter for a record already obtained through an authorized
// customer read. It neither resolves customer IDs nor establishes signing authority.
function clientDocumentValues(record) {
    const row = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    const profile = normalizeClientProfile(row.ClientProfile || row.clientProfile || row.client_profile);
    const text = keys => {
        for (const key of keys) {
            if (Object.hasOwn(row, key) && typeof row[key] === 'string' && row[key] !== '') return row[key];
        }
        return '';
    };
    return {
        'client.fullName': text(['name', 'Name']),
        'client.companyName': text(['companyname', 'CompanyName', 'company']),
        'client.identityNumber': profile.identity.number,
        'client.companyNumber': profile.partyType === 'organization' ? profile.organization.registrationNumber : '',
        'client.address': ['line1', 'line2', 'city', 'postalCode', 'country']
            .map(key => profile.address[key]).filter(Boolean).join(', '),
        'client.email': text(['email', 'Email']),
        'client.phone': text(['phonenumber', 'PhoneNumber', 'phoneNumber', 'phone']),
    };
}

module.exports = { clientDocumentValues };
