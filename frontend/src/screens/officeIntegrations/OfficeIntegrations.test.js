import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OfficeIntegrations from './OfficeIntegrations';
import { officeIntegrationsApi as api } from '../../api/officeIntegrationsApi';
import { prepareWhatsAppSdk, launchWhatsAppSignup } from '../../services/whatsappEmbeddedSignup';
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key.replace('officeIntegrations.', '') }) }));
jest.mock('../../api/officeIntegrationsApi', () => ({ officeIntegrationsApi: { offices: jest.fn(), snapshot: jest.fn(), saveWhatsapp: jest.fn(), saveCourt: jest.fn(), startSignup: jest.fn(), completeSignup: jest.fn() } }));
jest.mock('../../services/whatsappEmbeddedSignup', () => ({ prepareWhatsAppSdk: jest.fn(), launchWhatsAppSignup: jest.fn() }));
const state = (overrides = {}) => ({
    canConfigurePolicy: true, court: { enabled: true, settings: { label: 'My office court' } },
    whatsapp: { enabled: false, status: 'disconnected', settings: { mode: 'demo', recipients: ['+972501111111'] } },
    signup: { ready: false, liveEnabled: false, demoOnly: true }, ...overrides,
});
beforeEach(() => {
    jest.resetAllMocks();
    api.snapshot.mockResolvedValue(state());
    api.saveWhatsapp.mockResolvedValue({ ok: true });
    api.saveCourt.mockResolvedValue({ ok: true });
    api.startSignup.mockResolvedValue({ state: 'nonce', appId: 'app', configId: 'config' });
    api.completeSignup.mockResolvedValue({ ok: true });
    prepareWhatsAppSdk.mockResolvedValue({});
    launchWhatsAppSignup.mockReturnValue(jest.fn());
});

test('owner settings use the authenticated office and save recipients and manager without a selector', async () => {
    render(<OfficeIntegrations />);
    await screen.findByDisplayValue('My office court');
    expect(api.snapshot).toHaveBeenCalledWith();
    expect(api.offices).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('office')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('projectContext')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('recipients'), { target: { value: '0501234567\n0521234567' } });
    fireEvent.click(screen.getByLabelText('autoCreate'));
    fireEvent.click(screen.getByLabelText('includeCaseManager'));
    fireEvent.click(screen.getByRole('button', { name: 'saveWhatsapp' }));
    await waitFor(() => expect(api.saveWhatsapp).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: true, mode: 'demo', includeCaseManager: true, recipients: ['0501234567', '0521234567'] })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'saveWhatsapp' })).toBeEnabled());
});

test('owner saves the current office daily schedule without operational tables', async () => {
    render(<OfficeIntegrations />); await screen.findByDisplayValue('My office court');
    for (const name of ['mapping', 'courtUpdates', 'groupActivity', 'seedDemo', 'syncDemo', 'testGroup']) expect(screen.queryByText(name)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('syncTime'), { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'saveCourt' }));
    await waitFor(() => expect(api.saveCourt).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: true, dailySyncEnabled: true, syncTime: '09:30' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'saveCourt' })).toBeEnabled());
});

test('demo connection guide does not expose developer setup or start a real Meta session', async () => {
    render(<OfficeIntegrations />); await screen.findByDisplayValue('My office court');
    fireEvent.click(screen.getByRole('button', { name: 'demoConnection' }));
    expect(screen.getByText('demoWalkthrough')).toBeInTheDocument();
    expect(screen.getByText('ownerStepNumber')).toBeInTheDocument();
    expect(screen.queryByText('platformResponsibility')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'openMetaSetup' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('template')).not.toBeInTheDocument();
    expect(api.startSignup).not.toHaveBeenCalled();
    expect(prepareWhatsAppSdk).not.toHaveBeenCalled();
    expect(launchWhatsAppSignup).not.toHaveBeenCalled();
});

test('ready connection opens the official signup on one click and saves to the authenticated office', async () => {
    api.snapshot.mockResolvedValue(state({ signup: { ready: true, appId: 'app', version: 'v25.0', liveEnabled: true, demoOnly: false } }));
    render(<OfficeIntegrations />); await screen.findByDisplayValue('My office court');
    await waitFor(() => expect(prepareWhatsAppSdk).toHaveBeenCalledWith({ appId: 'app', version: 'v25.0' }));
    expect(api.startSignup).toHaveBeenCalledWith();
    expect(screen.getByLabelText('autoCreate')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'connect' }));
    expect(launchWhatsAppSignup).toHaveBeenCalledTimes(1);
    const payload = { state: 'nonce', code: 'test-code', wabaId: '12345', phoneId: '67890' };
    await act(async () => launchWhatsAppSignup.mock.calls[0][1].onComplete(payload));
    expect(api.completeSignup).toHaveBeenCalledWith(undefined, payload);
});

test('a failed office load cannot fall back to the first customer in an office list', async () => {
    api.snapshot.mockRejectedValue(new Error('Office context missing'));
    render(<OfficeIntegrations />);
    await screen.findByRole('alert');
    expect(api.offices).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'saveWhatsapp' })).not.toBeInTheDocument();
    expect(api.startSignup).not.toHaveBeenCalled();
});

test('switching the environment from demo to live never silently enables real groups', async () => {
    api.snapshot.mockResolvedValue(state({ whatsapp: { enabled: true, status: 'ready', connected: true, settings: { mode: 'demo', recipients: ['+972501111111'] } }, signup: { ready: true, liveEnabled: true, demoOnly: false } }));
    render(<OfficeIntegrations />); await screen.findByDisplayValue('My office court');
    expect(screen.getByLabelText('autoCreate')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'saveWhatsapp' }));
    await waitFor(() => expect(api.saveWhatsapp).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false, mode: 'live' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'saveWhatsapp' })).toBeEnabled());
});

test('the screen respects denied policy access', async () => {
    api.snapshot.mockResolvedValue(state({ canConfigurePolicy: false }));
    render(<OfficeIntegrations />); await screen.findByDisplayValue('My office court');
    expect(screen.queryByRole('button', { name: 'saveWhatsapp' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('syncTime')).toBeDisabled();
});
test('connection-only QA offers the actual QR button and keeps automation in simulation', async () => {
    api.snapshot.mockResolvedValue(state({ signup: { ready: true, flow: 'business_app', connectionOnly: true, appId: 'app', version: 'v26.0', liveEnabled: false, demoOnly: false } }));
    render(<OfficeIntegrations />); await screen.findByDisplayValue('My office court');
    await waitFor(() => expect(api.startSignup).toHaveBeenCalled());
    expect(screen.getByText('connectionOnlyNotice')).toBeInTheDocument();
    expect(screen.getByText('qrPrerequisite')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'connectQr' }));
    expect(launchWhatsAppSignup).toHaveBeenCalledTimes(1);
});
test('Meta approval blocker keeps a visible QR button, shows the no-charge price preview and does not launch signup', async () => {
    api.snapshot.mockResolvedValue(state({ signup: { ready: false, approvalPending: true, flow: 'business_app', connectionOnly: true,
        liveEnabled: false, demoOnly: false, pricing: { monthlyAmount: 99, setupAmount: 0, vatMode: 'exempt', currency: 'ILS', billingActive: false } } }));
    render(<OfficeIntegrations />); await screen.findByDisplayValue('My office court');
    expect(screen.getByRole('button', { name: 'connectQr' })).toBeDisabled();
    expect(screen.getByText('metaApprovalPending')).toBeInTheDocument();
    expect(screen.getByText('pricingNoCharge')).toBeInTheDocument();
    expect(screen.getByText('pricingTaxExempt')).toBeInTheDocument();
    expect(screen.queryByText('platformSetup')).not.toBeInTheDocument();
    expect(api.startSignup).not.toHaveBeenCalled(); expect(prepareWhatsAppSdk).not.toHaveBeenCalled();
});
