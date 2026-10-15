import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OfficeIntegrations from './OfficeIntegrations';
import { officeIntegrationsApi as api } from '../../api/officeIntegrationsApi';
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key.replace('officeIntegrations.', '') }) }));
jest.mock('../../api/officeIntegrationsApi', () => ({ officeIntegrationsApi: { offices: jest.fn(), snapshot: jest.fn(), saveWhatsapp: jest.fn(), saveCourt: jest.fn(), startSignup: jest.fn() } }));
jest.mock('../../services/whatsappEmbeddedSignup', () => ({ prepareWhatsAppSdk: jest.fn(), launchWhatsAppSignup: jest.fn() }));
const state = (office, canConfigurePolicy = true) => ({
    canConfigurePolicy, court: { enabled: true, settings: { label: `Court ${office}` } },
    whatsapp: { enabled: false, status: 'disconnected', settings: { mode: 'demo', recipients: [office === 'A' ? '+972501111111' : '+972502222222'] } },
    signup: { ready: false, liveEnabled: false }, demoCases: [], links: [], updates: [], groups: [],
});
beforeEach(() => {
    jest.clearAllMocks(); api.offices.mockResolvedValue({ offices: [{ id: 'A', name: 'Office A' }, { id: 'B', name: 'Office B' }] });
    api.snapshot.mockImplementation(id => Promise.resolve(state(id))); api.saveWhatsapp.mockResolvedValue({ ok: true });
});
test('platform admin saves recipient policy for selected office, keeps live activation gated', async () => {
    render(<OfficeIntegrations />);
    await screen.findByDisplayValue('Court A');
    fireEvent.change(screen.getByLabelText('office'), { target: { value: 'B' } });
    await screen.findByDisplayValue('Court B');
    expect(screen.getByLabelText('recipients')).toHaveValue('+972502222222');
    fireEvent.change(screen.getByLabelText('recipients'), { target: { value: '0501234567\n0521234567' } });
    fireEvent.click(screen.getByLabelText('autoCreate'));
    fireEvent.click(screen.getByLabelText('includeCaseManager'));
    fireEvent.click(screen.getByRole('button', { name: 'saveWhatsapp' }));
    await waitFor(() => expect(api.saveWhatsapp).toHaveBeenCalledWith('B', expect.objectContaining({ enabled: true, mode: 'demo', includeCaseManager: true, recipients: ['0501234567', '0521234567'] })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'saveWhatsapp' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('mode'), { target: { value: 'live' } });
    expect(screen.getByLabelText('autoCreate')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'connectionSetup' })).toBeEnabled();
    expect(api.startSignup).not.toHaveBeenCalled();
});
test('office owner sees connection flow without platform recipient/template controls', async () => {
    api.snapshot.mockResolvedValue(state('A', false));
    render(<OfficeIntegrations />); await screen.findByDisplayValue('Court A');
    expect(screen.getByText('adminPolicy')).toBeInTheDocument();
    expect(screen.queryByLabelText('recipients')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'saveWhatsapp' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'connectionSetup' })).toBeInTheDocument();
    expect(screen.getByLabelText('syncTime')).toBeDisabled();
});

test('settings page has no operational tables and saves the selected office daily schedule', async () => {
    api.saveCourt.mockResolvedValue({ ok: true });
    render(<OfficeIntegrations />); await screen.findByDisplayValue('Court A');
    for (const name of ['mapping', 'courtUpdates', 'groupActivity', 'seedDemo', 'syncDemo', 'testGroup']) expect(screen.queryByText(name)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('office'), { target: { value: 'B' } }); await screen.findByDisplayValue('Court B');
    fireEvent.change(screen.getByLabelText('syncTime'), { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'saveCourt' }));
    await waitFor(() => expect(api.saveCourt).toHaveBeenCalledWith('B', expect.objectContaining({ enabled: true, dailySyncEnabled: true, syncTime: '09:30' })));
});

test('setup button explains platform and office responsibilities without launching Meta in demo mode', async () => {
    api.snapshot.mockResolvedValue({ ...state('A'), signup: { ready: false, demoOnly: true, requirements: { app: false, signup: false, encryption: false, webhook: false } } });
    render(<OfficeIntegrations />); await screen.findByDisplayValue('Court A');
    fireEvent.click(screen.getByRole('button', { name: 'connectionSetup' }));
    expect(screen.getByText('platformResponsibility')).toBeInTheDocument();
    expect(screen.getByText('officeResponsibility')).toBeInTheDocument();
    expect(screen.getAllByText('notConfigured')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'checkConnection' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'disconnect' })).not.toBeInTheDocument();
    expect(api.startSignup).not.toHaveBeenCalled();
});
test('project and same-named offices remain distinct when switching saved connections', async () => {
    api.offices.mockResolvedValue({ context: { organization: { key: 'melamedia', name: 'MelaMedia' }, project: { key: 'melamedlaw', name: 'MelamedLaw' }, demoOnly: true }, offices: [{ id: 'A', name: 'MelamedLaw' }, { id: 'B', name: 'MelamedLaw' }] });
    render(<OfficeIntegrations />); await screen.findByDisplayValue('Court A');
    expect(screen.getByLabelText('projectContext')).toHaveTextContent('MelaMedia');
    expect(screen.getByLabelText('projectContext')).toHaveTextContent('MelamedLaw');
    expect(screen.getByText('testEnvironment')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('office'), { target: { value: 'B' } });
    await screen.findByDisplayValue('Court B');
    fireEvent.click(screen.getByRole('button', { name: 'saveWhatsapp' }));
    await waitFor(() => expect(api.saveWhatsapp).toHaveBeenCalledWith('B', expect.objectContaining({ recipients: ['+972502222222'] })));
});

test('late response from previous office cannot replace current office data', async () => {
    let resolveA;
    api.snapshot.mockImplementation(id => id === 'A' ? new Promise(resolve => { resolveA = resolve; }) : Promise.resolve(state(id)));
    render(<OfficeIntegrations />); await waitFor(() => expect(api.snapshot).toHaveBeenCalledWith('A'));
    fireEvent.change(screen.getByLabelText('office'), { target: { value: 'B' } }); await screen.findByDisplayValue('Court B');
    await act(async () => resolveA(state('A')));
    expect(screen.getByDisplayValue('Court B')).toBeInTheDocument(); expect(screen.queryByDisplayValue('Court A')).not.toBeInTheDocument();
});
