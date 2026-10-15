import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ClientStack from './ClientStack';

let mockBilling = { loaded: true, locked: false };
jest.mock('../providers/BillingLockProvider', () => ({ useBillingLock: () => mockBilling }));
jest.mock('../components/navBars/TopAndRightNavBar', () => ({ children, LogoNavigate }) => <div data-testid="incumbent-navbar" data-logo-path={LogoNavigate}>{children}</div>);
jest.mock('../components/navBars/data/ClientNavBarData', () => ({ getClientNavBarData: jest.fn() }));
jest.mock('../components/simpleComponents/RouteFallback', () => () => <p>route loading</p>);
jest.mock('../components/billing/ServiceUnavailableScreen', () => () => <p>billing locked</p>);
jest.mock('../screens/client/clientMainScreen/ClientMainScreen', () => () => <h1>portal home</h1>);
jest.mock('../screens/client/clientCasesScreen/ClientCasesScreen', () => () => <h1>incumbent cases</h1>);
jest.mock('../screens/client/clientDocumentsScreen/ClientDocumentsScreen', () => function MockDocuments() {
    const { search } = require('react-router-dom').useLocation();
    return <h1>documents:{new URLSearchParams(search).get('tab') || 'all'}</h1>;
});
jest.mock('../screens/signingScreen/SigningScreen', () => () => <h1>incumbent signing</h1>);
jest.mock('../screens/client/notifications/NotificationsScreen', () => () => <h1>notifications</h1>);
jest.mock('../screens/client/profile/ProfileScreen', () => () => <h1>profile</h1>);

function LocationReadout() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>; }
function show(screenPath) {
    render(<MemoryRouter initialEntries={['/office/ClientStack/' + screenPath]}><LocationReadout /><Routes><Route path="/:tenant/ClientStack/*" element={<ClientStack />} /><Route path="*" element={null} /></Routes></MemoryRouter>);
}
beforeEach(() => { localStorage.setItem('token', 'synthetic-only'); mockBilling = { loaded: true, locked: false }; });
afterEach(() => localStorage.removeItem('token'));

test.each([
    ['ClientMainScreen', 'portal home'], ['ClientDocumentsScreen', 'documents:all'],
    ['ClientSignedDocumentsScreen', 'documents:signed'], ['ClientCasesScreen', 'incumbent cases'], ['SigningScreen', 'incumbent signing'],
])('routes %s through the existing authenticated navbar with the tenant-scoped logo', async (path, heading) => {
    show(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByTestId('incumbent-navbar')).toHaveAttribute('data-logo-path', '/office/ClientStack/ClientMainScreen');
});

test('new document routes remain behind login', async () => {
    localStorage.removeItem('token');
    show('ClientDocumentsScreen');
    expect(await screen.findByTestId('location')).toHaveTextContent('/LoginStack/LoginScreen');
    expect(screen.queryByTestId('incumbent-navbar')).not.toBeInTheDocument();
});

test('new signed document route retains the existing billing restriction', async () => {
    mockBilling = { loaded: true, locked: true };
    show('ClientSignedDocumentsScreen');
    expect(await screen.findByText('billing locked')).toBeInTheDocument();
    expect(screen.queryByTestId('incumbent-navbar')).not.toBeInTheDocument();
});


test('historical signed links redirect to the unified page with tenant, document and native context intact', async () => {
    show('ClientSignedDocumentsScreen?document=signing%3A42&fromApp=true&nativeRuntime=real#details');
    expect(await screen.findByRole('heading', { name: 'documents:signed' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/office/ClientStack/ClientDocumentsScreen?document=signing%3A42&fromApp=true&nativeRuntime=real&tab=signed#details');
});

test('the unified documents route opens pending notification links without rewriting their selected document', async () => {
    show('ClientDocumentsScreen?tab=pending&document=package%3A7');
    expect(await screen.findByRole('heading', { name: 'documents:pending' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/office/ClientStack/ClientDocumentsScreen?tab=pending&document=package%3A7');
});
