import React, { StrictMode } from 'react';
import { render } from '@testing-library/react';
import App from '../App';

const mockNavigate = jest.fn();
const mockSetFromApp = jest.fn();
let mockLocation;
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate, useLocation: () => mockLocation,
  Routes: () => null, Route: () => null, Navigate: () => null,
}));
jest.mock('../navigation/AdminStack', () => ({ AdminStackName: '/AdminStack' }));
jest.mock('../navigation/ClientStack', () => ({ ClientStackName: '/ClientStack' }));
jest.mock('../navigation/LoginStack', () => ({ LoginStackName: '/LoginStack' }));
jest.mock('../providers/FromAppProvider', () => ({ useFromApp: () => ({ isFromApp: true, setIsFromApp: mockSetFromApp }) }));
jest.mock('../services/firmSettings', () => ({ loadFirmSettings: jest.fn() }));
jest.mock('../lib/tenantSlug', () => ({ isMultiTenantApp: () => false }));
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); mockLocation = { pathname: '/entry', search: '' }; });
afterEach(() => { document.body.classList.remove('lw-fromApp'); document.documentElement.classList.remove('lw-noPullRefresh'); });

test('public signing query tokens cannot replace the logged-in session', () => {
  localStorage.setItem('token', 'existing-synthetic'); localStorage.setItem('role', 'User');
  mockLocation = { pathname: '/s/synthetic-link', search: '?token=public-synthetic&role=Admin' };
  render(<App />);
  expect(localStorage.getItem('token')).toBe('existing-synthetic');
  expect(localStorage.getItem('role')).toBe('User');
  expect(mockNavigate).not.toHaveBeenCalled();
});
test('client signing deep link retains document state and strips credential query', () => {
  mockLocation.search = '?token=synthetic&role=User&fromApp=true&signingFileId=42&publicSigning=1';
  render(<App />);
  expect(mockNavigate.mock.calls).toEqual([
    ['/entry', { replace: true }],
    ['/ClientStack/SigningScreen', { replace: true, state: { openSigningFileId: '42', publicSigning: true } }],
  ]);
  expect(sessionStorage.getItem('lw_signing_deeplink_fileId')).toBe('42');
  expect(mockSetFromApp).toHaveBeenCalledWith(true);
});
test('later navigation never replays initial credentials over a changed or logged-out session', () => {
  mockLocation.search = '?token=old-synthetic&role=Staff';
  const view = render(<App />);
  mockNavigate.mockClear();
  localStorage.setItem('token', 'new-synthetic'); localStorage.setItem('role', 'Lawyer');
  mockLocation = { pathname: '/AdminStack/CalendarScreen', search: '?token=old-synthetic&role=Staff' };
  view.rerender(<App />);
  expect(localStorage.getItem('token')).toBe('new-synthetic');
  expect(localStorage.getItem('role')).toBe('Lawyer');
  localStorage.clear(); mockLocation = { pathname: '/LoginStack/LoginScreen', search: '?token=old-synthetic&role=Staff' };
  view.rerender(<App />);
  expect(localStorage.getItem('token')).toBeNull();
  expect(mockNavigate).not.toHaveBeenCalled();
});
test('StrictMode does not consume a client deep link twice', () => {
  mockLocation.search = '?token=synthetic&role=User&signingFileId=42';
  render(<StrictMode><App /></StrictMode>);
  expect(mockNavigate.mock.calls).toHaveLength(2);
  expect(mockNavigate.mock.calls.filter(([path]) => path === '/ClientStack/SigningScreen')).toHaveLength(1);
});
test('office appointment deep link preserves encoded event and signing routes disable pull refresh', () => {
  mockLocation = { pathname: '/AdminStack/SigningManagerScreen', search: '?token=synthetic&role=Lawyer&appointmentId=a%26b' };
  render(<App />);
  expect(mockNavigate).toHaveBeenLastCalledWith('/AdminStack/CalendarScreen?eventId=a%26b', { replace: true });
  expect(document.documentElement.classList.contains('lw-noPullRefresh')).toBe(true);
});
