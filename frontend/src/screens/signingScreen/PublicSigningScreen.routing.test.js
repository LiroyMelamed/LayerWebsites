import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PublicSigningScreen from './PublicSigningScreen';

const mockNavigate = jest.fn();
let mockSearch = '?token=synthetic-token';
jest.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate, useLocation: () => ({ search: mockSearch }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../components/simpleComponents/SimpleScreen', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/simpleComponents/SimpleContainer', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/specializedComponents/text/AllTextKindFile', () => ({ Text14: ({ children }) => <span>{children}</span>, TextBold24: ({ children }) => <span>{children}</span> }));
jest.mock('../../components/styledComponents/buttons/PrimaryButton', () => ({ children, onPress }) => <button onClick={onPress}>{children}</button>);
jest.mock('../../assets/images/images', () => ({ images: { Backgrounds: {} } }));
jest.mock('../loginScreen/LoginScreen', () => ({ LoginScreenName: '/LoginScreen' }));
jest.mock('../../providers/LoginVerifyOtpCodeFieldsProvider', () => ({ children }) => children);
jest.mock('../../components/simpleComponents/RouteFallback', () => () => null);
jest.mock('../../components/specializedComponents/signFiles/SignatureCanvas', () => ({ onClose, publicToken }) => <button data-token={publicToken} onClick={onClose}>close canvas</button>);
jest.mock('./templates/PublicBatchSigning', () => ({ token }) => <div data-testid="batch">{token}</div>);

beforeEach(() => { localStorage.clear(); mockNavigate.mockClear(); mockSearch = '?token=synthetic-token'; });
for (const [role, destination] of [
    ['User', '/ClientStack/ClientMainScreen'],
    ['Admin', '/AdminStack/MainScreen'],
    ['Lawyer', '/AdminStack/MainScreen'],
    ['Staff', '/AdminStack/MainScreen'],
    [null, '/LoginStack/LoginScreen'],
]) {
    test('canvas close keeps the existing destination for ' + (role || 'public user'), () => {
        if (role) { localStorage.setItem('token', 'synthetic-session'); localStorage.setItem('role', role); }
        render(<PublicSigningScreen />);
        expect(screen.getByText('close canvas').getAttribute('data-token')).toBe('synthetic-token');
        fireEvent.click(screen.getByText('close canvas'));
        expect(mockNavigate).toHaveBeenCalledWith(destination, { replace: true });
    });
}
test('missing signing token keeps the invalid-link return action', () => {
    mockSearch = ''; render(<PublicSigningScreen />);
    expect(screen.queryByText('close canvas')).toBeNull();
    fireEvent.click(screen.getByText('common.back'));
    expect(mockNavigate).toHaveBeenCalledWith('/LoginStack/LoginScreen', { replace: true });
});
test('batch signing keeps its separate token and component', () => {
    mockSearch = '?batch=synthetic-batch'; render(<PublicSigningScreen />);
    expect(screen.getByTestId('batch').textContent).toBe('synthetic-batch');
    expect(screen.queryByText('close canvas')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
});
