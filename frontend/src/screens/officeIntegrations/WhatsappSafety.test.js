import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import WhatsappSafety from './WhatsappSafety';
import en from '../../i18n/locales/en.json';
import he from '../../i18n/locales/he.json';
import ar from '../../i18n/locales/ar.json';

const copy = en.officeIntegrations.safety;
const pausedAt = '2026-10-24T08:00:00.000Z';
const freshAt = '2026-10-24T08:01:00.000Z';
const policy = {
    groupIntervalMs: 300000, mutationIntervalMs: 20000, rollingWindowMs: 86400000,
    maxGroupsPerWindow: 10, maxInvitesPerWindow: 50, recipientInviteCooldownMs: 3600000,
};
const connection = (overrides = {}) => ({
    connected: true, status: 'ready', lastCheckedAt: freshAt,
    safety: {
        paused: false, reason: null, pausedAt: null, counts: { groups: 2, invites: 8 },
        nextGroupAt: '2026-10-24T08:05:00.000Z', nextInviteAt: null, policy,
    },
    ...overrides,
});
const pausedConnection = (overrides = {}) => connection({
    safety: { ...connection().safety, paused: true, reason: 'MANUAL_PAUSE', pausedAt },
    ...overrides,
});

function renderSafety(overrides = {}, language = 'en') {
    const i18n = createInstance();
    i18n.use(initReactI18next).init({
        resources: { en: { translation: en }, he: { translation: he }, ar: { translation: ar } },
        lng: language, fallbackLng: 'he', initImmediate: false,
        interpolation: { escapeValue: false }, react: { useSuspense: false },
    });
    const props = {
        whatsapp: connection(), canManage: true, busy: false,
        onPause: jest.fn(), onCheck: jest.fn(), onResume: jest.fn(), ...overrides,
    };
    const content = next => <I18nextProvider i18n={i18n}><WhatsappSafety {...next} /></I18nextProvider>;
    const view = render(content(props));
    return { ...view, props, update: values => view.rerender(content({ ...props, ...values })) };
}

test('shows active safeguards, rolling usage and Israel time without implying a guarantee', () => {
    const { props } = renderSafety();
    expect(screen.getByText(copy.active)).toBeInTheDocument();
    expect(screen.getByText(copy.description)).toBeInTheDocument();
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
    expect(screen.getByText('8 / 50')).toBeInTheDocument();
    expect(screen.getByText('24/10/2026, 11:05')).toHaveAttribute('dateTime', '2026-10-24T08:05:00.000Z');
    expect(screen.getByText(copy.availableNow)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.pause }));
    expect(props.onPause).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: copy.resume })).not.toBeInTheDocument();
});

test('resuming requires acknowledgement and a successful ready check strictly after the pause', () => {
    const { props, update } = renderSafety({ whatsapp: pausedConnection({ lastCheckedAt: pausedAt }) });
    expect(screen.getByText(copy.paused)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(copy.reasons.MANUAL_PAUSE);
    expect(screen.getByRole('button', { name: copy.resume })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.acknowledgement }));
    fireEvent.click(screen.getByRole('button', { name: copy.resume }));
    expect(props.onResume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.checkConnection }));
    expect(props.onCheck).toHaveBeenCalledTimes(1);
    update({ whatsapp: pausedConnection() });
    expect(screen.getByText(copy.checkReady)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.resume })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: copy.resume }));
    expect(props.onResume).toHaveBeenCalledWith({ acknowledged: true });
});

test('a fresh ready check alone does not acknowledge resuming', () => {
    const { props } = renderSafety({ whatsapp: pausedConnection() });
    expect(screen.getByRole('button', { name: copy.resume })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: copy.resume }));
    expect(props.onResume).not.toHaveBeenCalled();
});

test('a pending dispatch blocks resuming after acknowledgement and a fresh ready check', () => {
    const { props } = renderSafety({ whatsapp: pausedConnection({
        safety: { ...pausedConnection().safety, hasPendingDispatch: true },
    }) });
    expect(screen.getByText(copy.pendingDispatchHelp)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.acknowledgement }));
    expect(screen.getByRole('button', { name: copy.resume })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: copy.resume }));
    expect(props.onResume).not.toHaveBeenCalled();
});

test('paused operations have no available next time when the server returns null times', () => {
    renderSafety({ whatsapp: pausedConnection({
        safety: { ...pausedConnection().safety, nextGroupAt: null, nextInviteAt: null },
    }) });
    expect(screen.queryByText(copy.availableNow)).not.toBeInTheDocument();
    expect(screen.getAllByText(copy.unavailableWhilePaused)).toHaveLength(2);
});

test.each([
    { connected: false },
    { status: 'connected' },
    { lastCheckedAt: '2026-10-24T07:59:59.000Z' },
    { lastCheckedAt: 'invalid-date' },
])('an unready or stale connection cannot resume: %j', overrides => {
    const { props } = renderSafety({ whatsapp: pausedConnection(overrides) });
    fireEvent.click(screen.getByRole('checkbox', { name: copy.acknowledgement }));
    expect(screen.getByRole('button', { name: copy.resume })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: copy.resume }));
    expect(props.onResume).not.toHaveBeenCalled();
});

test('a new pause needs its own acknowledgement', () => {
    const { update } = renderSafety({ whatsapp: pausedConnection() });
    fireEvent.click(screen.getByRole('checkbox', { name: copy.acknowledgement }));
    expect(screen.getByRole('button', { name: copy.resume })).toBeEnabled();
    update({ whatsapp: pausedConnection({ safety: { ...pausedConnection().safety, pausedAt: freshAt }, lastCheckedAt: '2026-10-24T08:02:00.000Z' }) });
    expect(screen.getByRole('checkbox', { name: copy.acknowledgement })).not.toBeChecked();
    expect(screen.getByRole('button', { name: copy.resume })).toBeDisabled();
});

test('invalid protection state cannot be resumed even after a fresh check', () => {
    const { props } = renderSafety({ whatsapp: pausedConnection({ safety: { ...pausedConnection().safety, reason: 'INVALID_SAFETY_STATE' } }) });
    expect(screen.getByRole('status')).toHaveTextContent(copy.reasons.INVALID_SAFETY_STATE);
    expect(screen.getByText(copy.invalidStateHelp)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: copy.acknowledgement })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.resume })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: copy.resume }));
    expect(props.onResume).not.toHaveBeenCalled();
});

test('unrecognized reasons and provider details cannot expose sensitive codes', () => {
    const sensitive = 'access_token=secret-provider-token';
    const { container } = renderSafety({ whatsapp: pausedConnection({
        lastError: sensitive, code: sensitive,
        safety: { ...pausedConnection().safety, reason: sensitive, providerError: sensitive },
    }) });
    expect(screen.getByRole('status')).toHaveTextContent(copy.reasons.OTHER);
    expect(container).not.toHaveTextContent(sensitive);
});

test.each([false, true])('users without permission have no operational actions (paused: %s)', paused => {
    renderSafety({ canManage: false, whatsapp: paused ? pausedConnection() : connection() });
    expect(screen.getByText(copy.permissionHelp)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('busy state prevents all actions and acknowledgement', () => {
    const { props } = renderSafety({ busy: true, whatsapp: pausedConnection() });
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: copy.checkConnection }));
    expect(props.onCheck).not.toHaveBeenCalled();
});

test.each([['he', 'rtl', he], ['ar', 'rtl', ar], ['en', 'ltr', en]])('uses %s translations and %s direction', (language, direction, translations) => {
    const { container } = renderSafety({ whatsapp: pausedConnection() }, language);
    expect(screen.getByRole('region', { name: translations.officeIntegrations.safety.title })).toHaveAttribute('dir', direction);
    expect(screen.getByRole('checkbox', { name: translations.officeIntegrations.safety.acknowledgement })).toBeInTheDocument();
    expect(container).not.toHaveTextContent('officeIntegrations.safety.');
});

test.each([null, { connected: false }, { connected: true, status: 'ready' }])('does not show safeguards without a saved safety row: %j', whatsapp => {
    const { container } = renderSafety({ whatsapp });
    expect(container).toBeEmptyDOMElement();
});
