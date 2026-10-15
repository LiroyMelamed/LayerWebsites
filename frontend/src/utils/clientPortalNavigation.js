import { ClientStackName } from '../navigation/screenPaths';

// Retain the active tenant path without borrowing a different stored account's slug.
export function clientPortalPath(pathname, screen, search = '') {
    const match = String(pathname || '').match(/^(\/[^/]+)?\/ClientStack(?:\/|$)/);
    return `${match?.[1] || ''}${ClientStackName}${screen}${search}`;
}

export function formatPortalDate(value, language) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(language || 'he', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

// A returning V2 signer may have signed an earlier stage of the same PDF.
export function hasPersonalSignature(file) {
    return file.PersonalStatus === 'signed' || (file.Source === 'package'
        && Boolean(file.PersonalSignedAt) && Number.isFinite(Date.parse(file.PersonalSignedAt)));
}
