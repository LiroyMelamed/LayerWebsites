import axios from 'axios';
import '../api/apiUtils';

jest.mock('../i18n/i18n', () => ({ __esModule: true, default: { t: (key) => key } }));
jest.mock('../lib/tenantSlug', () => ({ getActiveTenantSlug: () => null }));

const rejectResponse = axios.interceptors.response.use.mock.calls.at(-1)[1];
const originalLocation = window.location;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('token', 'synthetic-office-session');
  localStorage.setItem('role', 'Admin');
  delete window.location;
  window.location = { pathname: '/PublicSignScreen', href: '/PublicSignScreen?token=synthetic-public-link' };
  window.ReactNativeWebView = { postMessage: jest.fn() };
});
afterEach(() => { delete window.location; window.location = originalLocation; delete window.ReactNativeWebView; });

test('expired background office permissions clear old identity without leaving a public signing link', async () => {
  const changed = jest.fn(); window.addEventListener('lw-auth-changed', changed);
  const result = await rejectResponse({ response: { status: 401 }, config: { url: '/firm-staff/session-scope', headers: {} } });
  expect(result.status).toBe(401);
  expect(localStorage.getItem('token')).toBeNull();
  expect(localStorage.getItem('role')).toBeNull();
  expect(window.location.href).toBe('/PublicSignScreen?token=synthetic-public-link');
  expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledTimes(1);
  window.removeEventListener('lw-auth-changed', changed);
});

test.each(['/SigningFiles/public/qa-token/verify-otp', 'SigningFiles/public/qa-token/verify-otp'])(
  'public signing rejection does not clear an unrelated office session: %s', async (url) => {
    await rejectResponse({ response: { status: 401 }, config: { url, headers: {} } });
    expect(localStorage.getItem('token')).toBe('synthetic-office-session');
    expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
  }
);

test('expired office session still returns a protected page to login', async () => {
  window.location.pathname = '/AdminStack/SigningManagerScreen';
  await rejectResponse({ response: { status: 401 }, config: { url: '/firm-staff/session-scope', headers: {} } });
  expect(window.location.href).toBe('/LoginStack/LoginScreen');
  expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'LOGOUT' }));
});
