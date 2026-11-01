export function emptyClientDocumentProfile() {
    return {
        version: 1,
        partyType: 'person',
        identity: { type: 'national_id', number: '', country: '' },
        organization: { registrationType: 'company', registrationNumber: '', registrationCountry: '' },
        address: { line1: '', line2: '', city: '', postalCode: '', country: '' },
    };
}

export function hasClientDocumentProfile(client) {
    return client?.ClientProfile !== undefined || client?.client_profile !== undefined;
}

// Customer APIs use PascalCase and SQL-backed callers use lowercase. Keep one
// editor state for both, without assigning an organization's ID to its contact.
export function clientDocumentProfile(client) {
    const value = client?.ClientProfile || client?.client_profile || {};
    const defaults = emptyClientDocumentProfile();
    return {
        ...defaults,
        partyType: value.partyType === 'organization' ? 'organization' : 'person',
        identity: { ...defaults.identity, ...value.identity },
        organization: { ...defaults.organization, ...value.organization },
        address: { ...defaults.address, ...value.address },
    };
}

export function invalidClientText(value, maxLength = 200) {
    return typeof value !== 'string' || value.trim().length > maxLength
        || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

export function clientDocumentProfileErrors(profile) {
    const errors = {};
    const fields = {
        'identity.number': 40, 'identity.country': 80,
        'organization.registrationNumber': 40, 'organization.registrationCountry': 80,
        'address.line1': 250, 'address.line2': 250, 'address.city': 100,
        'address.postalCode': 24, 'address.country': 80,
    };
    for (const [path, maxLength] of Object.entries(fields)) {
        const [section, key] = path.split('.');
        if (invalidClientText(profile[section]?.[key] ?? '', maxLength)) errors[path] = true;
    }
    return errors;
}
