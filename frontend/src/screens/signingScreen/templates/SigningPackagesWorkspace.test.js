import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';

jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => ({ spots = [] }) =>
    <div data-testid="package-pdf">{spots.map(spot => spot.signerName).join('|')}</div>);
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

// CRA's jsdom has no Web Crypto; browsers do.
if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const resources = { he: { translation: he }, ar: { translation: ar }, en: { translation: en } };
async function translations(language) {
    const instance = createInstance();
    await instance.use(initReactI18next).init({ resources, lng: language, fallbackLng: false, interpolation: { escapeValue: false } });
    return instance;
}

function fixture() {
    const batch = { id: 'send-1', name: 'October employees', is_batch: true, created_at: '2026-10-07T08:00:00Z', package_count: 200,
        accepted_count: 2, required_count: 10, document_count: 600, prepared_count: 600, final_count: 0,
        preparing_count: 0, attention_count: 0, complete_count: 0, cancelled_count: 0 };
    const child = { id: 'package-1', name: 'Employee 001', workflow_state: 'active', accepted_count: 1, required_count: 9, match_reason: 'person' };
    const detail = {
        package: { id: child.id, external_key: child.name, workflow_state: 'active', accepted_count: 1, required_count: 9, prepared_count: 3, document_count: 3 },
        documents: [{ id: 'doc-1', name: 'Employment agreement', state: 'ready', informational: false, final: false,
            spots: [{ id: 'sig', pageNum: 2, x: 30, y: 100, width: 200, height: 60, type: 'signature', required: true, signerName: 'Synthetic employee', signerIndex: 0 }] }],
        participants: [{ id: 'participation-1', personId: 'person-1', name: 'Synthetic employee', partyName: 'Synthetic corporation', capacity: 'representative',
            tasks: [{ id: 'task-1', documentId: 'doc-1', state: 'accepted', required: true, acceptedAt: '2026-10-07T08:30:00Z' }] }],
        deliveries: [{ id: 'delivery-1', personId: 'person-1', purpose: 'invitation', channel: 'email', state: 'uncertain', attemptedAt: '2026-10-07T08:00:00Z' }],
    };
    return { batch, detail, api: {
        list: jest.fn().mockResolvedValue({ rows: [batch], total: 1, nextCursor: null }),
        packages: jest.fn().mockResolvedValue({ rows: [child], total: 1, nextCursor: null }),
        details: jest.fn().mockResolvedValue(detail),
    } };
}

test.each(['he', 'ar', 'en'])('uses existing translated controls, correct direction and actual delivery state in %s', async language => {
    const i18n = await translations(language), { api } = fixture();
    render(<I18nextProvider i18n={i18n}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    expect(screen.getByRole('region', { name: i18n.t('signingV2.title') })).toHaveAttribute('dir', language === 'en' ? 'ltr' : 'rtl');
    expect(screen.getByRole('textbox', { name: i18n.t('signingV2.search') })).toHaveAttribute('dir', language === 'en' ? 'ltr' : 'rtl');
    await screen.findByText('October employees');
    fireEvent.click(screen.getByRole('button', { name: /October employees/ }));
    await screen.findByText('Employee 001');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.openPackage') }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Synthetic employee')).toBeTruthy();
    expect(within(dialog).getByText('Employment agreement')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('radio', { name: i18n.t('signingV2.tabs.delivery') }));
    expect(within(dialog).getByText(i18n.t('signingV2.uncertainHelp'))).toBeTruthy();
    expect(within(dialog).queryByText(i18n.t('signingV2.delivery.delivered'))).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common.close') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.details).toHaveBeenCalledWith('package-1', expect.any(Object));
});

test.each([
    ['authorized_preparing', null, 0, 'preparing'],
    ['active', 0, 1, 'previousStage'],
    ['active', null, 0, 'blocked'],
])('shows the actual reason a task is blocked: %s / %s / %s', async (workflowState, currentStage, stage, label) => {
    const i18n = await translations('en'), { api, detail } = fixture();
    Object.assign(detail.package, { workflow_state: workflowState, current_stage: currentStage });
    Object.assign(detail.participants[0].tasks[0], { state: 'blocked', stage, acceptedAt: null });
    render(<I18nextProvider i18n={i18n}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /October employees/ }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.openPackage') }));
    expect(await within(await screen.findByRole('dialog')).findByText(i18n.t(`signingV2.task.${label}`))).toBeTruthy();
});

test('refresh preserves the expanded send and panel while a translated error retains current results', async () => {
    const i18n = await translations('en'), { api } = fixture();
    render(<I18nextProvider i18n={i18n}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /October employees/ }));
    await screen.findByText('Employee 001');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.refresh') }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Employee 001')).toBeTruthy();
    api.list.mockRejectedValueOnce({ code: 'UNRECOGNIZED', message: 'אסור להציג הודעת שרת בשפה אחרת' });
    await waitFor(() => expect(screen.getByRole('button', { name: i18n.t('signingV2.refresh') }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.refresh') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('signingV2.errors.REQUEST_FAILED'));
    expect(screen.getByText('October employees')).toBeTruthy();
});

function actionFixture() {
    const value = fixture();
    value.detail.participants[0].tasks.push({ id: 'task-2', documentId: 'doc-2', state: 'ready', required: true, acceptedAt: null });
    value.detail.participants.push({ ...value.detail.participants[0], id: 'participation-2', capacity: 'personal', tasks: [] });
    value.detail.deliveries[0].state = 'provider_accepted';
    value.preview = {
        eligible: true, reason: null, previewHash: 'hash-1', cooldownUntil: null,
        package: { name: 'Employee 001', caseName: null },
        recipient: { name: 'Synthetic employee', participations: [{ roleKey: 'employee', occurrence: 1, capacity: 'representative', partyName: 'Synthetic corporation' }] },
        tasks: [{ taskId: 'task-2', documentName: 'Confidentiality form' }],
        destination: { channel: 'email', masked: 'sy••••@example.invalid' },
        lastInvitation: { purpose: 'invitation', state: 'provider_accepted', createdAt: '2026-10-07T08:00:00Z' }, lastFollowUp: null,
    };
    Object.assign(value.api, {
        previewAction: jest.fn().mockResolvedValue(value.preview),
        executeAction: jest.fn().mockResolvedValue({ operationId: 'op-1', state: 'running', items: [{ personId: 'person-1', state: 'queued' }] }),
        operation: jest.fn().mockResolvedValue({ operationId: 'op-1', state: 'complete', items: [{ personId: 'person-1', state: 'provider_accepted' }] }),
    });
    return value;
}

async function openAction(i18n, api, purpose = 'reminder') {
    render(<I18nextProvider i18n={i18n}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /October employees/ }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.openPackage') }));
    const panel = await screen.findByRole('dialog');
    const buttons = await within(panel).findAllByRole('button', { name: i18n.t(`signingV2.action.${purpose}.open`) });
    expect(buttons).toHaveLength(1);
    buttons[0].focus(); fireEvent.click(buttons[0]);
    return screen.findByRole('dialog', { name: i18n.t(`signingV2.action.${purpose}.title`) });
}

test.each(['he', 'ar', 'en'])('targeted reminder reaches one person once and reports the real outcome in %s', async language => {
    const i18n = await translations(language), { api } = actionFixture();
    const dialog = await openAction(i18n, api);
    expect(dialog.getAttribute('dir')).toBe(language === 'en' ? 'ltr' : 'rtl');
    expect(await within(dialog).findByText('Confidentiality form')).toBeTruthy();
    expect(within(dialog).getByText('sy••••@example.invalid')).toBeTruthy();
    expect(api.previewAction).toHaveBeenCalledWith('package-1', 'person-1', { purpose: 'reminder' }, expect.any(Object));
    const confirm = within(dialog).getByRole('button', { name: i18n.t('signingV2.action.reminder.confirm') });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(await within(dialog).findByText(i18n.t('signingV2.action.queued'))).toBeTruthy();
    expect(within(dialog).getByRole('status')).toHaveFocus();
    expect(api.executeAction).toHaveBeenCalledTimes(1);
    expect(api.executeAction).toHaveBeenCalledWith('package-1', 'person-1', { purpose: 'reminder', previewHash: 'hash-1' }, expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(await within(dialog).findByText(i18n.t('signingV2.delivery.provider_accepted'), {}, { timeout: 3000 })).toBeTruthy();
    const calls = api.details.mock.calls.length;
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common.close') }));
    await waitFor(() => expect(api.details.mock.calls.length).toBeGreaterThan(calls));
});

test('a changed preview is shown fresh and the next confirmation uses a new key', async () => {
    const i18n = await translations('en'), { api, preview } = actionFixture();
    api.executeAction.mockRejectedValueOnce({ code: 'PREVIEW_CHANGED' });
    api.previewAction.mockResolvedValueOnce(preview).mockResolvedValueOnce({ ...preview, previewHash: 'hash-2' });
    const dialog = await openAction(i18n, api);
    fireEvent.click(await within(dialog).findByRole('button', { name: i18n.t('signingV2.action.reminder.confirm') }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(i18n.t('signingV2.errors.PREVIEW_CHANGED'));
    await waitFor(() => expect(api.previewAction).toHaveBeenCalledTimes(2));
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('signingV2.action.reminder.confirm') }));
    await waitFor(() => expect(api.executeAction).toHaveBeenCalledTimes(2));
    const [first, second] = api.executeAction.mock.calls;
    expect(second[2].previewHash).toBe('hash-2');
    expect(second[3]).not.toBe(first[3]);
});

test('an ineligible signer sees the reason and no send button', async () => {
    const i18n = await translations('en'), { api, preview } = actionFixture();
    api.previewAction.mockResolvedValue({ ...preview, eligible: false, reason: 'PREVIOUS_OUTCOME_UNCERTAIN' });
    const dialog = await openAction(i18n, api);
    expect(await within(dialog).findByText(i18n.t('signingV2.reasons.PREVIOUS_OUTCOME_UNCERTAIN'))).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: i18n.t('signingV2.action.reminder.confirm') })).toBeNull();
});

test('Escape closes only the topmost dialog', async () => {
    const i18n = await translations('en'), { api } = actionFixture();
    const dialog = await openAction(i18n, api);
    await within(dialog).findByText('Confidentiality form');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: i18n.t('signingV2.action.reminder.title') })).toBeNull();
    const panel = screen.getByRole('dialog');
    const opener = within(panel).getByRole('button', { name: i18n.t('signingV2.action.reminder.open') });
    expect(opener).toHaveFocus();
    fireEvent.keyDown(opener, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
});

test('resend is offered instead of a reminder after a failed invitation', async () => {
    const i18n = await translations('en'), { api, detail } = actionFixture();
    detail.deliveries[0].state = 'failed';
    await openAction(i18n, api, 'resend');
    expect(api.previewAction).toHaveBeenCalledWith('package-1', 'person-1', { purpose: 'resend' }, expect.any(Object));
});

test('no action is offered when the person has nothing ready to sign', async () => {
    const i18n = await translations('en'), { api } = fixture();
    render(<I18nextProvider i18n={i18n}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /October employees/ }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.openPackage') }));
    const panel = await screen.findByRole('dialog');
    await within(panel).findByText('Synthetic employee');
    expect(within(panel).queryByRole('button', { name: i18n.t('signingV2.action.reminder.open') })).toBeNull();
    expect(within(panel).queryByRole('button', { name: i18n.t('signingV2.action.resend.open') })).toBeNull();
});

test('opening a package shows each signer position and the finished-document actions', async () => {
    const i18n = await translations('en'), { api, detail } = fixture();
    detail.documents[0].final = true;
    detail.package.workflow_state = 'complete';
    api.documentFile = jest.fn().mockResolvedValue(new Blob(['%PDF']));
    api.evidenceFile = jest.fn().mockResolvedValue(new Blob(['%PDF']));
    render(<I18nextProvider i18n={i18n}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /October employees/ }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.openPackage') }));
    const panel = await screen.findByRole('dialog');
    await within(panel).findByText('Synthetic employee');
    expect(within(panel).getByRole('button', { name: i18n.t('signingV2.public.downloadEvidence') })).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: `${i18n.t('signingV2.public.view')}: Employment agreement` }));
    expect(await within(panel).findByText('Synthetic employee · Signature · page 2')).toBeTruthy();
    expect(await within(panel).findByTestId('package-pdf')).toHaveTextContent('Synthetic employee');
    expect(api.documentFile).toHaveBeenCalledWith('package-1', 'doc-1');
    expect(within(panel).getByRole('button', { name: `${i18n.t('signingV2.public.downloadFinal')}: Employment agreement` })).toBeTruthy();
});

test('all locale plural forms resolve for 0/1/2/3/11/200 without falling back to another language or a key', async () => {
    for (const language of ['he', 'ar', 'en']) {
        const i18n = await translations(language);
        for (const key of ['results', 'packages', 'matchingPackages', 'action.tasks']) for (const count of [0, 1, 2, 3, 11, 200]) {
            const text = i18n.t(`signingV2.${key}`, { count, formattedCount: String(count) });
            expect(text).not.toContain('signingV2.'); expect(text).not.toContain('{{');
            expect(language === 'he' ? '' : text).not.toMatch(/[\u0590-\u05ff]/);
        }
    }
});
