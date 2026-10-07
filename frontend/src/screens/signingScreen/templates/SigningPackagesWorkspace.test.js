import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

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
        documents: [{ id: 'doc-1', name: 'Employment agreement', state: 'ready', informational: false }],
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
    const { container } = render(<I18nextProvider i18n={i18n}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    expect(container.querySelector('.lw-signingPackages').getAttribute('dir')).toBe(language === 'en' ? 'ltr' : 'rtl');
    expect(container.querySelector('input').getAttribute('dir')).toBe(language === 'en' ? 'ltr' : 'rtl');
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

test('all locale plural forms resolve for 0/1/2/3/11/200 without falling back to another language or a key', async () => {
    for (const language of ['he', 'ar', 'en']) {
        const i18n = await translations(language);
        for (const key of ['results', 'packages', 'matchingPackages']) for (const count of [0, 1, 2, 3, 11, 200]) {
            const text = i18n.t(`signingV2.${key}`, { count, formattedCount: String(count) });
            expect(text).not.toContain('signingV2.'); expect(text).not.toContain('{{');
            if (language !== 'he') expect(text).not.toMatch(/[\u0590-\u05ff]/);
        }
    }
});
