import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LegacyTenantStackRedirect from './LegacyTenantStackRedirect';
import { getActiveTenantSlug } from '../../lib/tenantSlug';

jest.mock('../../lib/tenantSlug', () => ({
    getActiveTenantSlug: jest.fn(),
    tenantPath: (slug, path) => `/${slug}${path}`,
}));
function Location() {
    const value = useLocation();
    return <output data-testid="location">{JSON.stringify(value)}</output>;
}
function show(path) {
    render(<MemoryRouter initialEntries={[{ pathname: path, search: '?fromApp=true', hash: '#details', state: { returnTo: 'documents' } }]}>
        <Routes><Route path={path} element={<LegacyTenantStackRedirect />} /><Route path="*" element={<Location />} /></Routes>
    </MemoryRouter>);
}
test.each(['/LoginStack/LoginOtpScreen', '/ClientStack/ClientMainScreen', '/AdminStack/MainScreen'])('keeps %s inside the selected office and retains navigation context', async path => {
    getActiveTenantSlug.mockReturnValue('demo-office');
    show(path);
    const location = JSON.parse((await screen.findByTestId('location')).textContent);
    expect(location.pathname).toBe('/demo-office' + path);
    expect(location.search).toBe('?fromApp=true');
    expect(location.hash).toBe('#details');
    expect(location.state).toEqual({ returnTo: 'documents' });
});
test.each([null, '../another-office', 'https://example.com'])('returns to the public entry when the office is absent or invalid (%s)', async slug => {
    getActiveTenantSlug.mockReturnValue(slug);
    show('/LoginStack/LoginOtpScreen');
    expect(JSON.parse((await screen.findByTestId('location')).textContent).pathname).toBe('/');
});
