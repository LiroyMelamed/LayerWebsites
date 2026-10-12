import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import TemplateBuilder from './TemplateBuilder';
import api from '../../../api/signingTemplatesApi';
import he from '../../../i18n/locales/he.json';
import en from '../../../i18n/locales/en.json';
import ar from '../../../i18n/locales/ar.json';
jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: { save: jest.fn(), pdf: jest.fn() } }));
jest.mock('../../../utils/fileUploadUtils', () => ({ uploadFileToR2: jest.fn() }));
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => props => <div>PDF<button onClick={() => props.onPageChange(2)}>Visible page 2</button></div>);
const geometry = { roleId: 'client', pageNum: 2, x: 120, y: 240, width: 180, height: 48, fieldType: 'signature', isRequired: true };
const template = () => ({ id: 'template-id', version: 4, definition: { name: 'Family agreement', signingOrder: 'sequential', roles: [
    { id: 'client', name: 'Client', kind: 'first' }, { id: 'relative', name: 'Relative', kind: 'shared' },
], documents: [{ id: 'pdf', name: 'Agreement', fields: [geometry, { ...geometry, roleId: 'relative', x: 300 }] }], requireOtp: true, completionEmail: '' } });
test.each(['he', 'en', 'ar'])('role ordering preserves PDF geometry and shared people with clear steps in %s', async lng => {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources: { he: { translation: he }, en: { translation: en }, ar: { translation: ar } }, lng, fallbackLng: false, interpolation: { escapeValue: false } });
    api.pdf.mockResolvedValue(new Blob(['pdf']));
    let finish;
    api.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const saved = jest.fn();
    const { container } = render(<I18nextProvider i18n={i18n}><TemplateBuilder template={template()} onSaved={saved} onBack={jest.fn()} /></I18nextProvider>);
    const t = key => i18n.t(`signingV2.builder.${key}`);
    // Verify direction on the actual editor root, independent of translated text.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector('section').getAttribute('dir')).toBe(lng === 'en' ? 'ltr' : 'rtl');
    expect(screen.queryByText('PDF')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.builder.up', { name: 'Relative' }) }));
    expect(screen.getByLabelText(i18n.t('signingV2.builder.roleLabel', { index: new Intl.NumberFormat({ he: 'he-IL', en: 'en-GB', ar: 'ar-IL' }[lng]).format(1) })).value).toBe('Relative');
    fireEvent.click(screen.getByRole('button', { name: t('next') }));
    await screen.findByText('PDF');
    fireEvent.click(screen.getByRole('button', { name: t('next') }));
    const save = screen.getByRole('button', { name: t('save') });
    fireEvent.click(save); fireEvent.click(save);
    expect(api.save).toHaveBeenCalledTimes(1);
    const body = api.save.mock.calls[0][0];
    expect(body.roles.map(role => role.id)).toEqual(['relative', 'client']);
    expect(body.roles[0].kind).toBe('shared');
    expect(body.documents[0].fields[0]).toEqual(geometry);
    finish({ template: { id: 'template-id' } });
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
});


test.each(['he', 'en', 'ar'])('incumbent + adds the chosen field for the selected role and visible page without altering old geometry in %s', async lng => {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources: { he: { translation: he }, en: { translation: en }, ar: { translation: ar } }, lng, fallbackLng: false, interpolation: { escapeValue: false } });
    api.pdf.mockResolvedValue(new Blob(['pdf']));
    api.save.mockResolvedValue({ template: { id: 'saved' } });
    render(<I18nextProvider i18n={i18n}><TemplateBuilder template={template()} onSaved={jest.fn()} onBack={jest.fn()} /></I18nextProvider>);
    const t = key => i18n.t(`signingV2.builder.${key}`);
    fireEvent.click(screen.getByRole('button', { name: t('next') }));
    await screen.findByText('PDF');
    const toolbar = screen.getByRole('toolbar', { name: t('signer') });
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Relative' }));
    expect(within(toolbar).getByRole('button', { name: 'Relative' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(toolbar).getByRole('button', { name: 'Client' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Visible page 2' }));
    fireEvent.click(screen.getByTitle(i18n.t('signing.fieldSettings.addFieldForPage', { page: 2 })));
    fireEvent.click(screen.getByRole('button', { name: t('types.checkbox') }));
    expect(screen.queryByText(i18n.t('signing.fieldSettings.addFieldTitle'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('next') }));
    fireEvent.click(screen.getByRole('button', { name: t('save') }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const fields = api.save.mock.calls[0][0].documents[0].fields;
    expect(fields[0]).toEqual(geometry);
    expect(fields[1]).toEqual({ ...geometry, roleId: 'relative', x: 300 });
    expect(fields[2]).toMatchObject({ roleId: 'relative', pageNum: 2, fieldType: 'checkbox', width: 24, height: 24 });
});

test('the + menu closes on Escape and document changes, preserving existing field bindings', async () => {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources: { en: { translation: en } }, lng: 'en', interpolation: { escapeValue: false } });
    api.pdf.mockResolvedValue(new Blob(['pdf']));
    const input = template();
    input.definition.documents.push({ id: 'second', name: 'Second PDF', fields: [] });
    render(<I18nextProvider i18n={i18n}><TemplateBuilder template={input} onSaved={jest.fn()} onBack={jest.fn()} /></I18nextProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('PDF');
    const open = () => fireEvent.click(screen.getByTitle(i18n.t('signing.fieldSettings.addFieldForPage', { page: 1 })));
    open();
    expect(screen.getByText(i18n.t('signing.fieldSettings.addFieldTitle'))).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(i18n.t('signing.fieldSettings.addFieldTitle'))).toBeNull();
    open();
    fireEvent.click(screen.getByRole('tab', { name: /Second PDF/ }));
    expect(screen.queryByText(i18n.t('signing.fieldSettings.addFieldTitle'))).toBeNull();
});
