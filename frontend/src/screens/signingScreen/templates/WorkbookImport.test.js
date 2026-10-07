import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import WorkbookImport from './WorkbookImport';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

const metadata = { sheets: [{ id: 1, name: 'Office file', columns: [
    { index: 1, header: 'Contact', suggestedKey: null, samples: ['one@example.invalid'] },
    { index: 2, header: 'Person', suggestedKey: null, samples: ['Synthetic one'] },
] }] };
const rows = [{ sourceRow: 2, recipients: { buyer: { name: 'Synthetic one', email: 'one@example.invalid', phone: '' } } }];
async function setup(lang = 'en', options = {}) {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ lng: lang, resources: { he: { translation: he }, ar: { translation: ar }, en: { translation: en } }, interpolation: { escapeValue: false } });
    const props = { api: { inspectWorkbook: jest.fn().mockResolvedValue(metadata), parseWorkbook: jest.fn().mockResolvedValue({ rows, errors: [] }) },
        versionId: 'template-v1', roles: [{ key: 'buyer', label: 'Buyer' }], layout: {}, onApply: jest.fn(), onPending: jest.fn(), ...options };
    render(<I18nextProvider i18n={i18n}><WorkbookImport {...props} /></I18nextProvider>);
    const upload = () => fireEvent.change(screen.getByLabelText(i18n.t('signingV2.compose.excel.upload')), { target: { files: [new File(['synthetic'], 'office.xlsx')] } });
    return { props, i18n, upload };
}

test.each(['he', 'ar', 'en'])('arbitrary headings require mapping and explicit replacement in %s', async lang => {
    const { props, i18n, upload } = await setup(lang, { hasRecipients: true });
    upload();
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.mapping.heading') });
    const name = screen.getByRole('combobox', { name: new RegExp(i18n.t('signingV2.compose.fields.name')) });
    const email = screen.getByRole('combobox', { name: i18n.t('signingV2.compose.fields.email'), exact: true });
    const review = screen.getByRole('button', { name: i18n.t('signingV2.compose.mapping.preview') });
    expect(review).toBeDisabled();
    expect(name).toHaveValue('');
    fireEvent.change(name, { target: { value: '2' } });
    fireEvent.change(email, { target: { value: '2' } });
    expect(review).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('signingV2.compose.errors.INVALID_COLUMN_MAPPING'));
    fireEvent.change(email, { target: { value: '1' } });
    fireEvent.click(review);
    await screen.findByText(i18n.t('signingV2.compose.mapping.replaceWarning'));
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.mapping.replace') }));
    expect(props.onApply).toHaveBeenCalledWith({ rows, errors: [] });
    expect(props.api.parseWorkbook).toHaveBeenCalledWith('template-v1', expect.any(String), { mapping: { sheetId: 1, columns: { 'buyer.name': 2, 'buyer.email': 1 } } });
});

test('cancel ignores a late file-inspection response and never replaces existing recipients', async () => {
    let finish;
    const api = { inspectWorkbook: jest.fn(() => new Promise(resolve => { finish = resolve; })), parseWorkbook: jest.fn() };
    const { props, upload } = await setup('en', { api, hasRecipients: true });
    upload();
    await waitFor(() => expect(api.inspectWorkbook).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => finish(metadata));
    expect(screen.queryByRole('heading', { name: 'Who is in each column?' })).not.toBeInTheDocument();
    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onPending).toHaveBeenLastCalledWith(false);
});

test('ambiguous duplicate headings do not get automatically assigned', async () => {
    const api = { inspectWorkbook: jest.fn().mockResolvedValue({ sheets: [{ id: 1, name: 'People', columns: [1, 2].map(index => ({ index, header: 'Buyer — Name', suggestedKey: 'buyer.name', samples: [] })) }] }), parseWorkbook: jest.fn() };
    const { upload } = await setup('en', { api }); upload();
    const name = await screen.findByRole('combobox', { name: 'Full name (required)' });
    expect(name).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Review mapping' })).toBeDisabled();
});
