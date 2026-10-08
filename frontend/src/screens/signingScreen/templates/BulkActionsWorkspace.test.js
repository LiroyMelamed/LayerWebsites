import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import BulkActionsWorkspace from './BulkActionsWorkspace';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const resources = { he: { translation: he }, ar: { translation: ar }, en: { translation: en } };
function fixture() {
    const rows = ['Alpha', 'Beta'].map((name, index) => ({ id: `pkg-${index}`, name, workflow_state: 'active', accepted_count: 0, required_count: 2 }));
    const selection = { selectionId: 'selection-1', expiresAt: '2026-10-09T12:10:00Z', packages: rows.map(row => ({ packageId: row.id })) };
    const review = { reviewId: 'review-1', previewHash: 'hash-1', expiresAt: selection.expiresAt,
        counts: { packages: 2, participations: 2, people: 1, documents: 2, messages: 1 }, excluded: [],
        messages: [{ id: 'message-1', recipientName: 'Shared signer', destination: { channel: 'email', masked: 'sh••@example.invalid' },
            packages: rows.map(row => ({ packageId: row.id, personId: 'person-1', package: { name: row.name },
                recipient: { participations: [{ id: `part-${row.id}`, capacity: 'personal' }] },
                tasks: [{ documentId: `doc-${row.id}`, documentName: `Document ${row.name}` }], documents: [] })) }] };
    const queued = { operationId: 'op-1', state: 'running', counts: { messages: 1, acceptedMessages: 0 }, exclusions: [],
        items: rows.map(row => ({ deliveryId: 'delivery-1', packageId: row.id, packageName: row.name, state: 'queued' })) };
    const accepted = { ...queued, state: 'complete', counts: { messages: 1, acceptedMessages: 1 }, items: queued.items.map(item => ({ ...item, state: 'provider_accepted' })) };
    return { rows, selection, review, queued, accepted, api: {
        matchingPackages: jest.fn().mockResolvedValue({ rows, total: 2, capabilities: { send: true } }),
        freezeSelection: jest.fn().mockResolvedValue(selection), previewBulk: jest.fn().mockResolvedValue(review),
        executeBulk: jest.fn().mockResolvedValue(queued), bulkOperation: jest.fn().mockResolvedValue(accepted),
        bulkOperations: jest.fn().mockResolvedValue({ rows: [] }),
    } };
}
async function setup(f = fixture(), language = 'en') {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources, lng: language, fallbackLng: false, interpolation: { escapeValue: false } });
    const close = jest.fn();
    const view = render(<I18nextProvider i18n={i18n}><BulkActionsWorkspace api={f.api} onClose={close} /></I18nextProvider>);
    await screen.findByRole('checkbox', { name: /Alpha/ });
    return { ...f, ...view, n: value => new Intl.NumberFormat(language === 'ar' ? 'ar-IL' : language === 'he' ? 'he-IL' : 'en-GB').format(value), t: i18n.t.bind(i18n), close };
}
async function reviewPage(f) {
    fireEvent.click(screen.getByRole('button', { name: f.t('signingV2.bulk.selectPage', { value: f.n(2) }) }));
    fireEvent.click(screen.getByRole('button', { name: f.t('signingV2.bulk.review') }));
    await screen.findByRole('heading', { name: f.t('signingV2.bulk.reviewTitle') });
}

test.each(['he', 'ar', 'en'])('nothing preselected; review separates people, ready PDFs and actual messages in %s', async language => {
    const f = await setup(fixture(), language);
    expect(screen.getByRole('region', { name: f.t('signingV2.bulk.title') })).toHaveAttribute('dir', language === 'en' ? 'ltr' : 'rtl');
    expect(screen.getAllByRole('checkbox').every(checkbox => !checkbox.checked)).toBe(true);
    expect(screen.getByRole('button', { name: f.t('signingV2.bulk.review') })).toBeDisabled();
    await reviewPage(f);
    expect(f.api.freezeSelection).toHaveBeenCalledWith({ mode: 'explicit', packageIds: ['pkg-0', 'pkg-1'], filter: { state: 'pending', query: '' } }, expect.any(String));
    expect(screen.getByText('Shared signer')).toBeTruthy();
    expect(screen.getByText('sh••@example.invalid')).toBeTruthy();
    expect(screen.getByText('Document Alpha')).toBeTruthy();
    expect(screen.getByText('Document Beta')).toBeTruthy();
    expect(f.api.executeBulk).not.toHaveBeenCalled();
});

test('all matching captures once and changing the search cannot silently add new matches', async () => {
    const f = await setup();
    fireEvent.click(screen.getByRole('button', { name: f.t('signingV2.bulk.selectAll', { value: 2 }) }));
    await waitFor(() => expect(f.api.freezeSelection).toHaveBeenCalledTimes(1));
    await screen.findByText(f.t('signingV2.bulk.selected', { value: 2 }));
    fireEvent.change(screen.getByRole('textbox', { name: f.t('signingV2.search') }), { target: { value: 'new matches' } });
    await screen.findByText(f.t('signingV2.bulk.previousFilter'));
    expect(screen.getAllByRole('checkbox').every(checkbox => checkbox.disabled)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: f.t('signingV2.bulk.review') }));
    await screen.findByText('Shared signer');
    expect(f.api.freezeSelection).toHaveBeenCalledTimes(1);
    expect(f.api.freezeSelection.mock.calls[0][0]).toEqual({ mode: 'all_matching', filter: { state: 'pending', query: '' } });
});

test('selection survives pagination and only explicit checked IDs enter review', async () => {
    const f = fixture();
    f.api.matchingPackages.mockImplementation(({ cursor }) => Promise.resolve({ rows: cursor ? [f.rows[1]] : [f.rows[0]], total: 2, nextCursor: cursor ? null : 'page2', capabilities: { send: true } }));
    const rendered = await setup(f);
    fireEvent.click(screen.getByRole('checkbox', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.nextPage') }));
    await screen.findByRole('checkbox', { name: /Beta/ });
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.review') }));
    await screen.findByText('Shared signer');
    expect(f.api.freezeSelection.mock.calls[0][0].packageIds).toEqual(['pkg-0']);
});

test('lost freeze response retries the same key and does not automatically execute', async () => {
    const f = fixture(); f.api.freezeSelection.mockRejectedValueOnce({ code: 'NETWORK_ERROR' });
    const rendered = await setup(f);
    fireEvent.click(screen.getByRole('checkbox', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.review') }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.review') }));
    await screen.findByText('Shared signer');
    expect(f.api.freezeSelection.mock.calls[0][1]).toBe(f.api.freezeSelection.mock.calls[1][1]);
    expect(f.api.executeBulk).not.toHaveBeenCalled();
});

test('lost execute response retries same approval key; double-click never queues twice', async () => {
    const f = fixture(); f.api.executeBulk.mockRejectedValueOnce({ code: 'NETWORK_ERROR' });
    const rendered = await setup(f); await reviewPage(rendered);
    const label = rendered.t('signingV2.bulk.confirm', { value: 1 });
    const confirm = screen.getByRole('button', { name: label }); fireEvent.click(confirm); fireEvent.click(confirm);
    await screen.findByRole('alert'); expect(f.api.executeBulk).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await screen.findByText(rendered.t('signingV2.bulk.processing'));
    expect(f.api.executeBulk.mock.calls[0][1]).toBe(f.api.executeBulk.mock.calls[1][1]);
    expect(screen.queryByText(rendered.t('signingV2.delivery.provider_accepted'))).toBeNull();
    expect(await screen.findAllByText(rendered.t('signingV2.delivery.provider_accepted'), {}, { timeout: 3000 })).toHaveLength(2);
    expect(screen.getByText(rendered.t('signingV2.bulk.accepted', { value: 1 }))).toBeTruthy();
});

test.each(['PREVIEW_CHANGED', 'SELECTION_EXPIRED'])('%s requires fresh review and another explicit confirmation', async code => {
    const f = fixture(); f.api.executeBulk.mockRejectedValueOnce({ code });
    const rendered = await setup(f); await reviewPage(rendered);
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.confirm', { value: 1 }) }));
    await screen.findByRole('button', { name: rendered.t('signingV2.bulk.reviewAgain') });
    expect(f.api.executeBulk).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: rendered.t('signingV2.bulk.confirm', { value: 1 }) })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.reviewAgain') }));
    await screen.findByRole('button', { name: rendered.t('signingV2.bulk.confirm', { value: 1 }) });
    expect(f.api.previewBulk).toHaveBeenCalledTimes(2); expect(f.api.executeBulk).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.confirm', { value: 1 }) }));
    await screen.findByText(rendered.t('signingV2.bulk.processing'));
    expect(f.api.executeBulk.mock.calls[1][1]).not.toBe(f.api.executeBulk.mock.calls[0][1]);
});

test('server history recovers an operation after leaving; uncertain result never resends automatically', async () => {
    const f = fixture(); f.api.bulkOperations.mockResolvedValue({ rows: [{ id: 'op-1', purpose: 'reminder', createdAt: '2026-10-09T12:00:00Z' }] });
    f.api.bulkOperation.mockResolvedValue({ ...f.queued, state: 'uncertain', items: f.queued.items.map(item => ({ ...item, state: 'uncertain' })) });
    const rendered = await setup(f);
    const region = screen.getByRole('region', { name: rendered.t('signingV2.bulk.recent') });
    fireEvent.click(await within(region).findByRole('button'));
    expect(await screen.findAllByText(rendered.t('signingV2.uncertainHelp'))).toHaveLength(2);
    expect(f.api.executeBulk).not.toHaveBeenCalled(); expect(f.api.freezeSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.back') }));
    expect(rendered.close).toHaveBeenCalledTimes(1);
});

test('permission revocation while polling removes cached package names and prevents further action', async () => {
    const f = fixture(); f.api.bulkOperation.mockRejectedValue({ code: 'FORBIDDEN' });
    const rendered = await setup(f); await reviewPage(rendered);
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.confirm', { value: 1 }) }));
    await screen.findByText(rendered.t('signingV2.bulk.processing'));
    await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(screen.queryByText('Alpha')).toBeNull(); expect(screen.queryByText('Beta')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull(); expect(screen.queryByText('Shared signer')).toBeNull();
});

test('read-only scope cannot select or send; excluded targets have an explicit explanation', async () => {
    const f = fixture(); f.api.matchingPackages.mockResolvedValue({ rows: f.rows, total: 2, capabilities: { send: false } });
    const rendered = await setup(f);
    expect(screen.getAllByRole('checkbox').every(checkbox => checkbox.disabled)).toBe(true);
    expect(screen.queryByRole('button', { name: rendered.t('signingV2.bulk.review') })).toBeNull();
    expect(f.api.freezeSelection).not.toHaveBeenCalled();
});

test('excluded targets are explained individually and zero actual messages cannot be confirmed', async () => {
    const f = fixture();
    f.api.previewBulk.mockResolvedValue({ ...f.review, counts: { packages: 0, participations: 0, people: 0, documents: 0, messages: 0 }, messages: [],
        excluded: [{ packageId: 'pkg-0', package: { name: 'Alpha' }, reason: 'ALREADY_COMPLETED' }, { packageId: 'pkg-1', reason: 'ACCESS_CHANGED' }] });
    const rendered = await setup(f); await reviewPage(rendered);
    expect(screen.getByText(rendered.t('signingV2.reasons.ALREADY_COMPLETED'))).toBeTruthy();
    expect(screen.getByText(rendered.t('signingV2.reasons.ACCESS_CHANGED'))).toBeTruthy();
    expect(screen.getByRole('button', { name: rendered.t('signingV2.bulk.confirm', { value: 0 }) })).toBeDisabled();
    expect(f.api.executeBulk).not.toHaveBeenCalled();
});

test('lost preview response reuses the frozen selection and preview key', async () => {
    const f = fixture(); f.api.previewBulk.mockRejectedValueOnce({ code: 'NETWORK_ERROR' });
    const rendered = await setup(f);
    fireEvent.click(screen.getByRole('checkbox', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.review') }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.review') }));
    await screen.findByText('Shared signer');
    expect(f.api.freezeSelection).toHaveBeenCalledTimes(1);
    expect(f.api.previewBulk.mock.calls[0][2]).toBe(f.api.previewBulk.mock.calls[1][2]);
});

test('selection limit applies to accumulated page selections as well as all matching results', async () => {
    const f = fixture();
    const many = Array.from({ length: 1000 }, (_, index) => ({ packageId: `chosen-${index}` }));
    f.api.freezeSelection.mockResolvedValue({ ...f.selection, packages: many });
    f.api.matchingPackages.mockResolvedValue({ rows: f.rows, total: 1000, capabilities: { send: true } });
    const rendered = await setup(f);
    fireEvent.click(screen.getByRole('button', { name: rendered.t('signingV2.bulk.selectAll', { value: '1,000' }) }));
    await screen.findByText(rendered.t('signingV2.bulk.selected', { value: '1,000' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Alpha/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(rendered.t('signingV2.errors.SELECTION_TOO_LARGE'));
    expect(screen.getByRole('checkbox', { name: /Alpha/ })).not.toBeChecked();
});
