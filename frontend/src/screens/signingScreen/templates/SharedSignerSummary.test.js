import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import SharedSignerSummary from './SharedSignerSummary';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => { const React = require('react'); return () => React.createElement('div', null, 'Synthetic PDF'); });

const rows = [
    { personId: 'same-person', partyId: 'company', capacity: 'representative', name: 'Shared signer', partyName: 'Represented company', packageCount: 5,
        attentionPackages: 1, readyPackages: 2, waitingPackages: 1, completePackages: 1 },
    { personId: 'same-person', partyId: 'self', capacity: 'personal', name: 'Shared signer', partyName: 'Shared signer', packageCount: 1,
        attentionPackages: 0, readyPackages: 0, waitingPackages: 1, completePackages: 0 },
];
const summary = { rows, projectionVersion: 2, asOf: '2026-10-08T10:00:00Z', freshness: 'current', scope: { kind: 'authorized_packages', submissionId: 'run' } };
async function mount(api, language = 'en') {
    const i = createInstance();
    await i.use(initReactI18next).init({ resources: { he: { translation: he }, ar: { translation: ar }, en: { translation: en } }, lng: language, fallbackLng: false, interpolation: { escapeValue: false } });
    render(<I18nextProvider i18n={i}><SharedSignerSummary api={api} submissionId="run" /></I18nextProvider>);
    return i;
}
test.each(['he', 'ar', 'en'])('new read-only signer summary starts collapsed and keeps person, capacity, party and disjoint counts in %s', async language => {
    const api = { participantSummary: jest.fn().mockResolvedValue(summary) }, i = await mount(api, language);
    const details = screen.getByRole('group', { name: i.t('signingV2.sharedSummary.title') });
    expect(details).not.toHaveAttribute('open');
    expect(api.participantSummary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(i.t('signingV2.sharedSummary.title')));
    await screen.findByText('Represented company');
    expect(api.participantSummary).toHaveBeenCalledWith('run', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByText(i.t('signingV2.sharedSummary.scope'))).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const number = new Intl.NumberFormat({ he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[language]);
    for (let index = 0; index < rows.length; index++) {
        const person = rows[index], item = within(items[index]);
        expect(item.getByText(i.t('signingV2.capacity.' + person.capacity), { exact: false })).toBeInTheDocument();
        expect(person.attentionPackages + person.readyPackages + person.waitingPackages + person.completePackages).toBe(person.packageCount);
        for (const key of ['attentionPackages', 'readyPackages', 'waitingPackages', 'completePackages']) {
            expect(item.getByText(i.t('signingV2.sharedSummary.' + key))).toBeInTheDocument();
        }
        expect(item.getByText(i.t('signingV2.sharedSummary.packageCount', { count: person.packageCount, formattedCount: number.format(person.packageCount) }))).toBeInTheDocument();
    }
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByText(i.t('signingV2.sharedSummary.title')));
    await waitFor(() => expect(screen.queryByText('Represented company')).toBeNull());
});
test('new read-only signer summary keeps transient evidence but clears names on scope denial', async () => {
    const api = { participantSummary: jest.fn().mockResolvedValue(summary) };
    jest.useFakeTimers();
    try {
        const i = await mount(api);
        fireEvent.click(screen.getByText(i.t('signingV2.sharedSummary.title')));
        await screen.findByText('Represented company');
        const poll = () => act(async () => { jest.advanceTimersByTime(8000); });
        api.participantSummary.mockRejectedValueOnce({ code: 'REQUEST_FAILED' }); await poll();
        expect(screen.getByText('Represented company')).toBeInTheDocument();
        expect(screen.getByText(i.t('signingV2.sharedSummary.lastAvailable'))).toBeInTheDocument();
        api.participantSummary.mockRejectedValueOnce({ code: 'ACCESS_CHANGED' }); await poll();
        expect(screen.queryByText('Represented company')).toBeNull();
        expect(screen.queryByRole('listitem')).toBeNull();
    } finally { jest.useRealTimers(); }
});
test('new focused-run summary retains the submission scope when only one logical package is visible', async () => {
    const api = { participantSummary: jest.fn().mockResolvedValue(summary), list: jest.fn().mockResolvedValue({ rows: [
        { id: 'authorized-run', name: 'Visible run', is_batch: true, package_count: 1, accepted_count: 0, required_count: 1, document_count: 1, prepared_count: 1, created_at: '2026-10-08T10:00:00Z' },
    ], total: 1 }), packages: jest.fn().mockResolvedValue({ rows: [{ id: 'logical-package', name: 'Visible package', workflow_state: 'active', accepted_count: 0, required_count: 1 }], total: 1 }) };
    const i = createInstance();
    await i.use(initReactI18next).init({ resources: { en: { translation: en } }, lng: 'en', fallbackLng: false, interpolation: { escapeValue: false } });
    render(<I18nextProvider i18n={i}><SigningPackagesWorkspace api={api} initialSubmissionId="authorized-run" /></I18nextProvider>);
    await screen.findByRole('button', { name: /Visible package/ });
    expect(screen.getAllByText(i.t('signingV2.sharedSummary.title'))).toHaveLength(1);
    fireEvent.click(screen.getByText(i.t('signingV2.sharedSummary.title')));
    await screen.findByText('Represented company');
    expect(api.participantSummary).toHaveBeenCalledWith('authorized-run', expect.any(Object));
});
