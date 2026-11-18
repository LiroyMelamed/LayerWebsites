import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { FirmPermissionsProvider, useFirmPermissions } from './FirmPermissionsProvider';
import { staffRolesApi } from '../api/staffRolesApi';

jest.mock('../api/staffRolesApi', () => ({ staffRolesApi: { getSessionScope: jest.fn() } }));
function Probe() {
    const state = useFirmPermissions();
    return <span>{!state.loaded ? 'loading' : state.scope?.permissionMode || 'no access'}</span>;
}
beforeEach(() => {
    localStorage.setItem('token', 'synthetic-first');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => {
    localStorage.clear();
    delete document.visibilityState;
    jest.useRealTimers();
});

test('focus and visibility bursts reuse the pending scope request without caching completed permissions', async () => {
    let finish;
    staffRolesApi.getSessionScope.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<FirmPermissionsProvider><Probe /></FirmPermissionsProvider>);
    act(() => {
        for (let n = 0; n < 8; n++) {
            window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new Event('visibilitychange'));
        }
    });
    expect(staffRolesApi.getSessionScope).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ permissionMode: 'role' }); });
    expect(screen.getByText('role')).toBeVisible();
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(staffRolesApi.getSessionScope).toHaveBeenCalledTimes(2);
    await act(async () => { finish({ permissionMode: 'legacy' }); });
    expect(screen.getByText('legacy')).toBeVisible();
});

test('new login is not deduplicated against another identity and stale permissions never replace it', async () => {
    const pending = [];
    staffRolesApi.getSessionScope.mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
    render(<FirmPermissionsProvider><Probe /></FirmPermissionsProvider>);
    act(() => {
        localStorage.setItem('token', 'synthetic-second');
        window.dispatchEvent(new Event('lw-auth-changed'));
    });
    expect(staffRolesApi.getSessionScope).toHaveBeenCalledTimes(2);
    await act(async () => { pending[1]({ permissionMode: 'role' }); });
    await act(async () => { pending[0]({ permissionMode: 'platform_admin' }); });
    expect(screen.getByText('role')).toBeVisible();
    act(() => {
        localStorage.removeItem('token');
        window.dispatchEvent(new Event('lw-auth-changed'));
    });
    expect(screen.getByText('no access')).toBeVisible();
});

test('hidden polling pauses but returning to the page checks permissions immediately', async () => {
    jest.useFakeTimers();
    staffRolesApi.getSessionScope.mockResolvedValue({ permissionMode: 'role' });
    render(<FirmPermissionsProvider><Probe /></FirmPermissionsProvider>);
    await act(async () => {});
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { jest.advanceTimersByTime(180000); });
    expect(staffRolesApi.getSessionScope).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(staffRolesApi.getSessionScope).toHaveBeenCalledTimes(2);
});
