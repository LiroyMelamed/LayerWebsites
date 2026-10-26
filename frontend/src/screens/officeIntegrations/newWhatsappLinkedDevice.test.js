import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import WhatsappLinkedDevice from './newWhatsappLinkedDevice';
import OfficeIntegrations from './OfficeIntegrations';
import { officeIntegrationsApi as api } from '../../api/officeIntegrationsApi';
import { launchWhatsAppSignup } from '../../services/whatsappEmbeddedSignup';
import en from '../../i18n/locales/en.json';
import he from '../../i18n/locales/he.json';
import ar from '../../i18n/locales/ar.json';

jest.mock('../../api/officeIntegrationsApi', () => ({ officeIntegrationsApi: {
    snapshot: jest.fn(), startLinkedDevice: jest.fn(), linkedDeviceQr: jest.fn(),
    checkLinkedDevice: jest.fn(), disconnectLinkedDevice: jest.fn(), saveWhatsapp: jest.fn(),
    setWhatsappContactPermission: jest.fn(), reviewWhatsappGroups: jest.fn(),
    startSignup: jest.fn(), checkWhatsapp: jest.fn(), pauseWhatsappSafety: jest.fn(), resumeWhatsappSafety: jest.fn(),
} }));
jest.mock('../../services/whatsappEmbeddedSignup', () => ({ prepareWhatsAppSdk: jest.fn().mockResolvedValue({}), launchWhatsAppSignup: jest.fn() }));

const copy = en.officeIntegrations.linkedDevice;
const officeCopy = en.officeIntegrations;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const linked = (values = {}) => ({ configured: true, enabled: true, provider: 'waha', sessionStatus: 'disconnected', liveEnabled: true, connectionGeneration: 'one', ...values });
const office = (values = {}) => ({
    canConfigurePolicy: true, court: { enabled: false, settings: {} },
    signup: { ready: false, demoOnly: true, liveEnabled: false },
    linkedDevice: linked({ sessionStatus: 'connected', displayPhone: '+972501234567' }),
    whatsapp: { connected: true, status: 'ready', enabled: false, settings: { gateway: 'waha', connectionType: 'linked_device', mode: 'live', recipients: ['+972501111111'] } },
    ...values,
});

function i18nFor(language) {
    const i18n = createInstance();
    i18n.use(initReactI18next).init({
        resources: { en: { translation: en }, he: { translation: he }, ar: { translation: ar } },
        lng: language, fallbackLng: 'he', initImmediate: false,
        interpolation: { escapeValue: false }, react: { useSuspense: false },
    });
    return i18n;
}

function renderLinked(overrides = {}, language = 'en') {
    const i18n = i18nFor(language);
    const props = { linkedDevice: linked(), canManage: true, onConnectionChanged: jest.fn().mockResolvedValue(), onBusyChange: jest.fn(), onContactPermission: jest.fn(), onReviewGroups: jest.fn(), ...overrides };
    const content = next => <I18nextProvider i18n={i18n}><WhatsappLinkedDevice {...next} /></I18nextProvider>;
    const view = render(content(props));
    return { ...view, props, update: values => view.rerender(content({ ...props, ...values })) };
}

function renderOffice() {
    return render(<I18nextProvider i18n={i18nFor('en')}><OfficeIntegrations /></I18nextProvider>);
}

async function advance(ms = 4000) {
    await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
}

beforeEach(() => {
    jest.clearAllMocks();
    api.snapshot.mockResolvedValue(office());
    api.startLinkedDevice.mockResolvedValue(linked({ sessionStatus: 'qr' }));
    api.linkedDeviceQr.mockResolvedValue({ status: 'qr', qrDataUrl: png });
    api.checkLinkedDevice.mockResolvedValue(linked({ sessionStatus: 'connected' }));
    api.disconnectLinkedDevice.mockResolvedValue(linked());
    api.saveWhatsapp.mockResolvedValue({ ok: true });
    api.startSignup.mockResolvedValue({ state: 'nonce', appId: 'app', configId: 'config' });
});
afterEach(() => jest.useRealTimers());

test('starting requires both explicit acknowledgements and never enables automatic groups', async () => {
    const { props } = renderLinked();
    const start = screen.getByRole('button', { name: copy.start });
    expect(start).toBeDisabled();
    expect(screen.getByText(copy.riskNotice)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.unofficialAcknowledgement }));
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.permissionsAcknowledgement }));
    fireEvent.click(start);
    await waitFor(() => expect(api.startLinkedDevice).toHaveBeenCalledWith(undefined, { acknowledgeUnofficial: true, acknowledgePermissions: true }));
    expect(api.saveWhatsapp).not.toHaveBeenCalled();
    expect(launchWhatsAppSignup).not.toHaveBeenCalled();
    await waitFor(() => expect(props.onConnectionChanged).toHaveBeenCalledTimes(1));
    for (const step of ['stepOpen', 'stepSettings', 'stepLinkedDevices', 'stepLinkDevice', 'stepScan']) expect(screen.getByText(copy[step])).toBeInTheDocument();
});

test('another provider requires disconnecting it before a linked device can start', () => {
    renderLinked({ otherConnection: true });
    fireEvent.click(screen.getByRole('checkbox', { name: copy.unofficialAcknowledgement }));
    fireEvent.click(screen.getByRole('checkbox', { name: copy.permissionsAcknowledgement }));
    expect(screen.getByText(copy.otherConnection)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.start })).toBeDisabled();
    expect(api.startLinkedDevice).not.toHaveBeenCalled();
});

test.each([{ configured: false }, { enabled: false }])('unavailable configuration cannot start a real session: %j', configuration => {
    renderLinked({ linkedDevice: linked(configuration) });
    expect(screen.getByText(copy.unavailable)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.start })).not.toBeInTheDocument();
    expect(api.startLinkedDevice).not.toHaveBeenCalled();
});

test('QR polling observes the current session and clears its image when a manual check connects', async () => {
    jest.useFakeTimers();
    renderLinked({ linkedDevice: linked({ sessionStatus: 'qr' }) });
    expect(api.linkedDeviceQr).not.toHaveBeenCalled();
    await advance();
    expect(screen.getByRole('img', { name: copy.qrAlt })).toHaveAttribute('src', png);
    fireEvent.click(screen.getByRole('button', { name: copy.check }));
    await act(async () => { await Promise.resolve(); });
    expect(api.checkLinkedDevice).toHaveBeenCalledWith();
    expect(screen.getByText(copy.statuses.connected)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await advance(20000);
    expect(api.linkedDeviceQr).toHaveBeenCalledTimes(1);
    expect(api.startLinkedDevice).not.toHaveBeenCalled();
    expect(api.saveWhatsapp).not.toHaveBeenCalled();
});

test.each(['https://provider.invalid/qr', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,not base64'])('does not render untrusted QR data %s', async value => {
    jest.useFakeTimers();
    api.linkedDeviceQr.mockResolvedValue({ status: 'qr', qrDataUrl: value });
    renderLinked({ linkedDevice: linked({ sessionStatus: 'qr' }) });
    await advance();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('polling has a deadline, never reconnects, and can be continued only by a manual check', async () => {
    jest.useFakeTimers();
    api.checkLinkedDevice.mockResolvedValue(linked({ sessionStatus: 'qr' }));
    renderLinked({ linkedDevice: linked({ sessionStatus: 'qr' }) });
    for (let cycle = 0; cycle < 30; cycle += 1) await advance();
    expect(screen.getByText(copy.pollStopped)).toBeInTheDocument();
    const calls = api.linkedDeviceQr.mock.calls.length;
    await advance(40000);
    expect(api.linkedDeviceQr).toHaveBeenCalledTimes(calls);
    expect(api.startLinkedDevice).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.check }));
    await act(async () => { await Promise.resolve(); });
    await advance();
    expect(api.linkedDeviceQr).toHaveBeenCalledTimes(calls + 1);
});

test('a new connection generation clears the old QR and ignores an older in-flight response', async () => {
    jest.useFakeTimers();
    let resolveQr;
    api.linkedDeviceQr.mockReturnValue(new Promise(resolve => { resolveQr = resolve; }));
    const { update } = renderLinked({ linkedDevice: linked({ sessionStatus: 'qr' }) });
    await advance();
    update({ linkedDevice: linked({ sessionStatus: 'disconnected', connectionGeneration: 'two' }) });
    await act(async () => resolveQr({ status: 'qr', qrDataUrl: png }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(copy.statuses.disconnected)).toBeInTheDocument();
    await advance(20000);
    expect(api.linkedDeviceQr).toHaveBeenCalledTimes(1);
});

test('unmount and parent busy state cancel QR polling without restarting the session', async () => {
    jest.useFakeTimers();
    const { update, unmount } = renderLinked({ linkedDevice: linked({ sessionStatus: 'qr' }) });
    update({ linkedDevice: linked({ sessionStatus: 'qr' }), busy: true });
    await advance(20000);
    expect(api.linkedDeviceQr).not.toHaveBeenCalled();
    update({ linkedDevice: linked({ sessionStatus: 'qr' }), busy: false });
    await advance();
    expect(api.linkedDeviceQr).toHaveBeenCalledTimes(1);
    unmount();
    await advance(20000);
    expect(api.linkedDeviceQr).toHaveBeenCalledTimes(1);
    expect(api.startLinkedDevice).not.toHaveBeenCalled();
});

test('unknown connection outcomes show a safe explanation and never automatically retry', () => {
    renderLinked({ linkedDevice: linked({ sessionStatus: 'failed', lastError: 'CONNECTION_START_UNKNOWN' }) });
    expect(screen.getByText(copy.errors.CONNECTION_START_UNKNOWN)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.check })).toBeEnabled();
    expect(api.startLinkedDevice).not.toHaveBeenCalled();
});

test('contact permission requires evidence and an explicit attestation, while stopping invitations is available separately', () => {
    const { props } = renderLinked({ linkedDevice: linked({ sessionStatus: 'connected' }) });
    fireEvent.click(screen.getByText(copy.permissionTitle, { selector: 'summary' }));
    const allow = screen.getByRole('button', { name: copy.permissionAllow });
    expect(allow).toBeDisabled();
    fireEvent.change(screen.getByLabelText(copy.permissionPhone), { target: { value: '0501234567' } });
    fireEvent.change(screen.getByLabelText(copy.permissionEvidence), { target: { value: 'Confirmed by phone today' } });
    expect(allow).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.permissionAcknowledgement }));
    fireEvent.click(allow);
    expect(props.onContactPermission).toHaveBeenCalledWith({ phone: '0501234567', allowed: true, evidence: 'Confirmed by phone today' });
    fireEvent.change(screen.getByLabelText(copy.permissionPhone), { target: { value: '0521234567' } });
    expect(screen.getByRole('checkbox', { name: copy.permissionAcknowledgement })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: copy.permissionBlock }));
    expect(props.onContactPermission).toHaveBeenLastCalledWith({ phone: '0521234567', allowed: false, evidence: copy.permissionBlockReason });
    fireEvent.click(screen.getByRole('button', { name: copy.recheck }));
    expect(props.onReviewGroups).toHaveBeenCalledTimes(1);
    expect(screen.getByText(copy.recheckHelp)).toBeInTheDocument();
});

test.each([['en', en, 'ltr'], ['he', he, 'rtl'], ['ar', ar, 'rtl']])('connected controls and instructions use %s labels and direction', (language, translations, direction) => {
    const { container } = renderLinked({ linkedDevice: linked({ sessionStatus: 'connected' }) }, language);
    expect(screen.getByRole('region', { name: translations.officeIntegrations.linkedDevice.title })).toHaveAttribute('dir', direction);
    expect(screen.getByRole('button', { name: translations.officeIntegrations.linkedDevice.disconnect })).toBeInTheDocument();
    expect(container).not.toHaveTextContent('officeIntegrations.linkedDevice.');
});

test('read-only office users cannot connect, disconnect, or record another person’s permission', () => {
    renderLinked({ canManage: false, linkedDevice: linked({ sessionStatus: 'connected' }) });
    expect(screen.getByText(copy.adminPermissionHelp)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('a confirmed Meta disconnect permits starting a linked device despite its historical gateway setting', async () => {
    api.snapshot.mockResolvedValue(office({ linkedDevice: linked(), whatsapp: {
        connected: false, hasConnection: false, enabled: false, status: 'disconnected', settings: { gateway: 'meta', connectionType: 'cloud' },
    } }));
    renderOffice();
    await screen.findByRole('button', { name: copy.start });
    fireEvent.click(screen.getByRole('checkbox', { name: copy.unofficialAcknowledgement }));
    expect(screen.getByRole('checkbox', { name: copy.unofficialAcknowledgement })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.permissionsAcknowledgement }));
    expect(screen.getByRole('checkbox', { name: copy.permissionsAcknowledgement })).toBeChecked();
    expect(screen.getByRole('button', { name: copy.start })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: copy.start }));
    await waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(2));
    expect(api.startLinkedDevice).toHaveBeenCalledTimes(1);
});

test('an uncertain Meta reservation still blocks linked-device replacement when connected is false', async () => {
    api.snapshot.mockResolvedValue(office({ linkedDevice: linked(), whatsapp: {
        connected: false, hasConnection: true, enabled: false, status: 'failed', settings: { gateway: 'meta', connectionType: 'cloud' },
    } }));
    renderOffice();
    await screen.findByRole('button', { name: copy.start });
    fireEvent.click(screen.getByRole('checkbox', { name: copy.unofficialAcknowledgement }));
    fireEvent.click(screen.getByRole('checkbox', { name: copy.permissionsAcknowledgement }));
    expect(screen.getByRole('button', { name: copy.start })).toBeDisabled();
    expect(screen.getByText(copy.otherConnection)).toBeInTheDocument();
    expect(api.startLinkedDevice).not.toHaveBeenCalled();
});

test('a confirmed linked-device disconnect prepares and permits Meta signup despite its historical gateway', async () => {
    let finishNonce;
    api.startSignup.mockReturnValue(new Promise(resolve => { finishNonce = resolve; }));
    api.snapshot.mockResolvedValue(office({ linkedDevice: linked(), whatsapp: {
        connected: false, hasConnection: false, enabled: false, status: 'disconnected', settings: { gateway: 'waha', connectionType: 'linked_device' },
    }, signup: { ready: true, appId: 'app', version: 'v26.0', liveEnabled: true, demoOnly: false } }));
    renderOffice();
    await waitFor(() => expect(api.startSignup).toHaveBeenCalledTimes(1));
    await act(async () => { finishNonce({ state: 'nonce', appId: 'app', configId: 'config' }); await api.startSignup.mock.results[0].value; });
    expect(screen.getByRole('button', { name: officeCopy.connect })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: officeCopy.connect }));
    expect(launchWhatsAppSignup).toHaveBeenCalledTimes(1);
    expect(api.startLinkedDevice).not.toHaveBeenCalled();
});

test.each([
    { hasConnection: true, sessionStatus: 'disconnected' },
    { hasConnection: false, sessionStatus: 'failed' },
    { hasConnection: true, sessionStatus: 'failed' },
])('a reserved linked-device connection blocks Meta preparation and replacement: %j', async reservation => {
    api.snapshot.mockResolvedValue(office({ linkedDevice: linked({ sessionStatus: reservation.sessionStatus, lastError: 'DISCONNECT_UNKNOWN' }), whatsapp: {
        connected: false, hasConnection: reservation.hasConnection, enabled: false, status: 'failed', settings: { gateway: 'waha', connectionType: 'linked_device' },
    }, signup: { ready: true, appId: 'app', version: 'v26.0', liveEnabled: true, demoOnly: false } }));
    renderOffice();
    await screen.findByRole('button', { name: officeCopy.connect });
    expect(screen.getByRole('button', { name: officeCopy.connect })).toBeDisabled();
    expect(api.startSignup).not.toHaveBeenCalled();
    expect(launchWhatsAppSignup).not.toHaveBeenCalled();
});

test('linked live groups use their own readiness, require staff confirmation, and never need Meta templates', async () => {
    renderOffice();
    await screen.findByText(officeCopy.automation, { selector: 'summary' });
    fireEvent.click(screen.getByText(officeCopy.automation, { selector: 'summary' }));
    const automatic = screen.getByRole('checkbox', { name: officeCopy.autoCreate });
    expect(automatic).not.toBeChecked();
    expect(automatic).toBeDisabled();
    expect(screen.queryByLabelText(officeCopy.template)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: copy.includeCaseClients })).not.toBeChecked();
    expect(screen.getByText(copy.invitationHelp)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.recipientPermissionAcknowledgement }));
    expect(automatic).toBeEnabled();
    fireEvent.click(automatic);
    fireEvent.click(screen.getByRole('button', { name: officeCopy.saveWhatsapp }));
    await waitFor(() => expect(api.saveWhatsapp).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: true, mode: 'live', includeCaseClients: false, recipientPermissionConfirmed: true })));
});

test('editing fixed staff numbers or the manager option clears permission and turns off group activation', async () => {
    renderOffice();
    await screen.findByText(officeCopy.automation, { selector: 'summary' });
    fireEvent.click(screen.getByText(officeCopy.automation, { selector: 'summary' }));
    const acknowledge = screen.getByRole('checkbox', { name: copy.recipientPermissionAcknowledgement });
    const automatic = screen.getByRole('checkbox', { name: officeCopy.autoCreate });
    fireEvent.click(acknowledge); fireEvent.click(automatic);
    fireEvent.change(screen.getByLabelText(copy.staffRecipientsTitle), { target: { value: '0521234567' } });
    expect(acknowledge).not.toBeChecked();
    expect(automatic).not.toBeChecked();
    expect(automatic).toBeDisabled();
    fireEvent.click(acknowledge); fireEvent.click(automatic);
    fireEvent.click(screen.getByRole('checkbox', { name: officeCopy.includeCaseManager }));
    expect(acknowledge).not.toBeChecked();
    expect(automatic).not.toBeChecked();
    fireEvent.click(acknowledge); fireEvent.click(automatic);
    fireEvent.click(screen.getByRole('checkbox', { name: copy.includeCaseClients }));
    expect(acknowledge).not.toBeChecked();
    expect(automatic).not.toBeChecked();
});

test('an already enabled policy can always be turned off without a new permission attestation', async () => {
    api.snapshot.mockResolvedValue(office({ whatsapp: { ...office().whatsapp, enabled: true } }));
    renderOffice();
    await screen.findByText(officeCopy.automation, { selector: 'summary' });
    fireEvent.click(screen.getByText(officeCopy.automation, { selector: 'summary' }));
    const automatic = screen.getByRole('checkbox', { name: officeCopy.autoCreate });
    expect(automatic).toBeEnabled();
    fireEvent.click(automatic);
    fireEvent.click(screen.getByRole('button', { name: officeCopy.saveWhatsapp }));
    await waitFor(() => expect(api.saveWhatsapp).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false, recipientPermissionConfirmed: false })));
});
