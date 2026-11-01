import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AllMangerScreen from './AllMangerScreen';
import AdminPopup from './components/AdminPopup';
import { useFirmPermissions } from '../../providers/FirmPermissionsProvider';
import { adminApi } from '../../api/adminApi';
import { staffRolesApi } from '../../api/staffRolesApi';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';

const mockOpenPopup = jest.fn();
const mockRefresh = jest.fn();
const mockClosePopup = jest.fn();
jest.mock('../../providers/FirmPermissionsProvider', () => ({ useFirmPermissions: jest.fn() }));
jest.mock('../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: mockOpenPopup, closePopup: mockClosePopup }) }));
jest.mock('../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: false }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../api/adminApi', () => ({ adminApi: { getAllAdmins: jest.fn(), getAdminByName: jest.fn() } }));
jest.mock('../../api/staffRolesApi', () => ({ staffRolesApi: { listOfficeUsers: jest.fn() } }));
jest.mock('../../hooks/useAutoHttpRequest', () => jest.fn());
jest.mock('../../hooks/useHttpRequest', () => () => ({ result: [], isPerforming: false, performRequest: jest.fn() }));
jest.mock('../../assets/images/images', () => ({ images: { Backgrounds: {} } }));
jest.mock('../../navigation/AdminStack', () => ({ AdminStackName: '/AdminStack' }));
jest.mock('../mainScreen/MainScreen', () => ({ MainScreenName: '/MainScreen' }));
jest.mock('../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => null);
jest.mock('../../components/specializedComponents/containers/SearchInput', () => ({ title }) => <div>{title}</div>);
jest.mock('../../components/styledComponents/buttons/PrimaryButton', () => ({ children, onPress }) => <button onClick={onPress}>{children}</button>);
jest.mock('./components/AdminPopup', () => () => null);
jest.mock('./components/AdminsCard', () => ({ showOfficeUserColumns }) => <div data-testid="admin-list" data-office-users={String(showOfficeUserColumns)} />);

function permissions(mode = 'legacy', overrides = {}) {
    return {
        loaded: true,
        error: null,
        scope: { permissionMode: mode },
        permissionMode: mode,
        canAction: jest.fn(() => true),
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    useAutoHttpRequest.mockReturnValue({ result: [], isPerforming: false, performRequest: mockRefresh });
    adminApi.getAllAdmins.mockResolvedValue({ status: 200, data: [] });
    staffRolesApi.listOfficeUsers.mockResolvedValue([]);
});

test.each([
    ['platform administrator', 'platform_admin', { isPlatformAdmin: true }, true, true],
    ['office owner', 'legacy', { isOfficeOwner: true }, false, true],
    ['authorized role user', 'role', {}, false, false],
    ['legacy office admin', 'legacy', {}, false, false],
])('%s can open creation while retaining the correct user directory', async (_label, mode, scopeFlags, cachedPlatformAdmin, officeDirectory) => {
    const permission = permissions(mode);
    Object.assign(permission.scope, scopeFlags);
    useFirmPermissions.mockReturnValue(permission);
    localStorage.setItem('isPlatformAdmin', String(cachedPlatformAdmin));
    render(<AllMangerScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'admins.addAdmin' }));
    expect(mockOpenPopup).toHaveBeenCalledTimes(1);
    const popup = mockOpenPopup.mock.calls[0][0];
    expect(popup.type).toBe(AdminPopup);
    expect(popup.props.adminDetails).toBeUndefined();
    expect(popup.props.rePerformRequest).toBe(mockRefresh);
    expect(popup.props.closePopUpFunction).toBe(mockClosePopup);
    expect(permission.canAction).toHaveBeenCalledWith('officeUsers', 'manage');
    expect(screen.getByTestId('admin-list')).toHaveAttribute('data-office-users', String(officeDirectory));

    await useAutoHttpRequest.mock.calls[0][0]();
    expect(officeDirectory ? staffRolesApi.listOfficeUsers : adminApi.getAllAdmins).toHaveBeenCalledTimes(1);
    expect(officeDirectory ? adminApi.getAllAdmins : staffRolesApi.listOfficeUsers).not.toHaveBeenCalled();
});

test('a denied staff role does not gain creation from cached platform-admin identity', () => {
    localStorage.setItem('isPlatformAdmin', 'true');
    useFirmPermissions.mockReturnValue(permissions('role', { canAction: jest.fn(() => false) }));
    render(<AllMangerScreen />);
    expect(screen.queryByRole('button', { name: 'admins.addAdmin' })).not.toBeInTheDocument();
    expect(mockOpenPopup).not.toHaveBeenCalled();
});

test.each([
    ['loading', { loaded: false }],
    ['failed', { error: new Error('Session scope unavailable') }],
    ['missing', { scope: null }],
])('creation remains unavailable while the trusted session scope is %s', (_label, overrides) => {
    localStorage.setItem('isPlatformAdmin', 'true');
    useFirmPermissions.mockReturnValue(permissions('legacy', overrides));
    render(<AllMangerScreen />);
    expect(screen.queryByRole('button', { name: 'admins.addAdmin' })).not.toBeInTheDocument();
    expect(mockOpenPopup).not.toHaveBeenCalled();
});

test('creation appears after permissions load and disappears when permission is revoked', () => {
    useFirmPermissions.mockReturnValue(permissions('role', { loaded: false, scope: null }));
    const { rerender } = render(<AllMangerScreen />);
    expect(screen.queryByRole('button', { name: 'admins.addAdmin' })).not.toBeInTheDocument();
    useFirmPermissions.mockReturnValue(permissions('role'));
    rerender(<AllMangerScreen />);
    expect(screen.getByRole('button', { name: 'admins.addAdmin' })).toBeInTheDocument();
    useFirmPermissions.mockReturnValue(permissions('role', { canAction: jest.fn(() => false) }));
    rerender(<AllMangerScreen />);
    expect(screen.queryByRole('button', { name: 'admins.addAdmin' })).not.toBeInTheDocument();
});
