/* CSS-grid cascade, touch dimensions, visual spans and structural grouping require direct DOM/style inspection. */
/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import BulkActionsWorkspace from './BulkActionsWorkspace';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => () => <div />);
if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });
const resources = { he: { translation: he }, ar: { translation: ar }, en: { translation: en } };
const stylesheet = require('sass').compileString(require('fs').readFileSync(`${__dirname}/signingPackages.scss`, 'utf8')).css;
beforeAll(() => { const style = document.createElement('style'); style.textContent = stylesheet; document.head.appendChild(style); });
async function translations(lng) {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources, lng, fallbackLng: false, interpolation: { escapeValue: false } });
    return i18n;
}

test.each(['he', 'ar', 'en'])('short three-column bulk controls retain full accessible meaning in %s', async language => {
    const i18n = await translations(language), t = i18n.t.bind(i18n);
    const api = {
        matchingPackages: jest.fn().mockResolvedValue({ rows: [], total: 0, capabilities: { send: true, packageRemind: true, deliveryResend: true } }),
        bulkOperations: jest.fn().mockResolvedValue({ rows: [] }),
        freezeSelection: jest.fn(), previewBulk: jest.fn(), executeBulk: jest.fn(),
    };
    const view = render(<I18nextProvider i18n={i18n}><BulkActionsWorkspace api={api} onClose={() => {}} /></I18nextProvider>);
    const action = await screen.findByRole('radiogroup', { name: t('signingV2.bulk.action') });
    const destination = screen.getByRole('radiogroup', { name: t('signingV2.action.destination') });
    expect(view.container.querySelectorAll('.lw-signingBulk__shortOptions')).toHaveLength(2);
    for (const [group, values] of [[action, ['reminder', 'resend', 'completed_copy']], [destination, ['policy', 'email', 'sms']]]) {
        const options = within(group).getAllByRole('radio');
        expect(options).toHaveLength(3);
        expect(window.getComputedStyle(group).display).toBe('grid');
        expect(window.getComputedStyle(group).gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
        options.forEach((option, index) => {
            expect(option.querySelector('[aria-hidden="true"]').textContent).toBe(t(`signingV2.bulkshortlabels.${values[index]}`));
            expect(window.getComputedStyle(option).minBlockSize).toBe('2.75rem');
            expect(window.getComputedStyle(option).minInlineSize).toBe('0');
        });
    }
    const resend = within(action).getByRole('radio', { name: t('signingV2.action.resend.title') });
    fireEvent.click(resend);
    expect(resend).toHaveAttribute('aria-checked', 'true');
    const email = within(destination).getByRole('radio', { name: t('signingV2.channel.email') });
    fireEvent.click(email);
    expect(email).toHaveAttribute('aria-checked', 'true');
    expect(api.freezeSelection).not.toHaveBeenCalled();
    expect(api.previewBulk).not.toHaveBeenCalled();
    expect(api.executeBulk).not.toHaveBeenCalled();
});

test('package panel groups delivery/actions and uses the incumbent small X with a physical-left44px target', async () => {
    const i18n = await translations('he'), t = i18n.t.bind(i18n);
    const batch = { id: 'layout-package', name: 'Synthetic layout package', is_batch: false, created_at: '2026-10-08T12:00:00Z',
        package_count: 1, accepted_count: 0, required_count: 2, document_count: 2, prepared_count: 2, final_count: 0,
        preparing_count: 0, attention_count: 0, complete_count: 0, cancelled_count: 0 };
    const detail = { package: { id: batch.id, external_key: batch.name, workflow_state: 'active', accepted_count: 0, required_count: 2, prepared_count: 2, document_count: 2 },
        capabilities: { send: true, manage: true, packageAssign: true, packageCancel: true, packageRevise: true,
            packageRemind: true, deliveryResend: true, linkRenew: true, contactCorrect: true },
        documents: [{ id: 'layout-doc', name: 'Synthetic layout PDF', state: 'ready', prepared: true, spots: [] }],
        participants: [{ id: 'layout-participation', personId: 'layout-person', name: 'Synthetic layout signer', capacity: 'personal',
            tasks: [{ id: 'layout-task', documentId: 'layout-doc', state: 'ready', required: true }] },
            { id: 'layout-participation-later', personId: 'layout-person-later', name: 'Synthetic later signer', capacity: 'professional', tasks: [] }],
        deliveries: [{ id: 'layout-delivery', personId: 'layout-person', state: 'provider_accepted', purpose: 'invitation', channel: 'email' }],
        issues: [], revisionHistory: [] };
    const api = { list: jest.fn().mockResolvedValue({ rows: [batch], total: 1 }), details: jest.fn().mockResolvedValue(detail) };
    const view = render(<I18nextProvider i18n={i18n}><SigningPackagesWorkspace api={api} onClose={() => {}} /></I18nextProvider>);
    const opener = await screen.findByRole('button', { name: /Synthetic layout package/ });
    opener.focus(); fireEvent.click(opener);
    const panel = await screen.findByRole('dialog', { name: batch.name });
    await within(panel).findByText('Synthetic layout signer');
    expect(panel.querySelector('.lw-signingPackages__panelActions').children).toHaveLength(3);
    expect(window.getComputedStyle(panel.querySelector('.lw-signingPackages__panelActions')).display).toBe('grid');
    expect(panel.querySelector('.lw-signingPackages__panelTabs')).toBeTruthy();
    const people = panel.querySelectorAll('.lw-signingPackages__people > li');
    expect({ first: window.getComputedStyle(people[0]).paddingBlockStart, later: window.getComputedStyle(people[1]).paddingBlock, tabs: window.getComputedStyle(panel.querySelector('.lw-signingPackages__panelTabs')).marginBlockEnd })
        .toEqual({ first: '0', later: '1.5rem', tabs: '1.5rem' });
    expect(panel.querySelector('.lw-signingPackages__personDelivery')).toHaveTextContent(t('signingV2.delivery.provider_accepted'));
    expect(panel.querySelector('.lw-signingPackages__personActionButtons').children).toHaveLength(3);
    const documentView = within(panel).getByRole('button', { name: `${t('signingV2.public.view')}: Synthetic layout PDF` });
    expect(window.getComputedStyle(documentView).minBlockSize).toBe('2.75rem');
    const close = within(panel).getByRole('button', { name: t('common.close') });
    expect(close.querySelector('svg')).toHaveAttribute('width', '14');
    expect(close).toHaveTextContent('');
    expect(window.getComputedStyle(close).left).toBe('0px');
    expect(window.getComputedStyle(close).minBlockSize).toBe('2.75rem');
    expect(window.getComputedStyle(close).minInlineSize).toBe('2.75rem');
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    const reopened = await screen.findByRole('dialog');
    fireEvent.keyDown(reopened, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(view.container.querySelector('.lw-signingPackages')).toHaveAttribute('dir', 'rtl');
});
