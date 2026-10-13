import { clientPortalPath, formatPortalDate, hasPersonalSignature } from './clientPortalNavigation';

test.each([
    ['/ClientStack/ClientMainScreen', '/ClientStack/ClientDocumentsScreen?tab=signed'],
    ['/melamedia/ClientStack/ClientMainScreen', '/melamedia/ClientStack/ClientDocumentsScreen?tab=signed'],
    ['/ClientStack', '/ClientStack/ClientDocumentsScreen?tab=signed'],
    ['/AdminStack/ClientStackOops', '/ClientStack/ClientDocumentsScreen?tab=signed'],
    ['/other/path/ClientStack/ClientMainScreen', '/ClientStack/ClientDocumentsScreen?tab=signed'],
    [null, '/ClientStack/ClientDocumentsScreen?tab=signed'],
])('retains only a tenant prefix from the active client route (%s)', (pathname, expected) => {
    localStorage.setItem('tenantSlug', 'different-account');
    expect(clientPortalPath(pathname, '/ClientDocumentsScreen', '?tab=signed')).toBe(expected);
});

test.each(['he', 'ar', 'en'])('formats dates with the active %s locale', language => {
    const value = '2026-10-13T12:00:00Z';
    expect(formatPortalDate(value, language)).toBe(new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)));
});

test.each([null, '', 'not a date'])('omits invalid dates instead of showing an Invalid Date label (%s)', value => {
    expect(formatPortalDate(value, 'he')).toBe('');
});


test('signed history recognizes earlier V2 signatures without treating arbitrary dates on other document types as signatures', () => {
    expect(hasPersonalSignature({ PersonalStatus: 'signed' })).toBe(true);
    expect(hasPersonalSignature({ Source: 'package', PersonalStatus: 'pending', PersonalSignedAt: '2026-10-01' })).toBe(true);
    expect(hasPersonalSignature({ Source: 'package', PersonalStatus: 'pending', PersonalSignedAt: 'invalid' })).toBe(false);
    expect(hasPersonalSignature({ Source: 'case', PersonalSignedAt: '2026-10-01' })).toBe(false);
});
