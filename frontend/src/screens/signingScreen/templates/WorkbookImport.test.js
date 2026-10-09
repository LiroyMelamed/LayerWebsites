import React from 'react';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import WorkbookImport from './WorkbookImport';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';


// Drive the real platform picker; DOM change on its combobox button is inert.
async function choose(control, name) {
    fireEvent.click(control);
    const option = await screen.findByRole('option', { name });
    expect(option).toBeEnabled();
    fireEvent.pointerDown(option);
}
function expectChoice(control, name) {
    fireEvent.click(control);
    const option = screen.getByRole('option', { name });
    expect(option).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(option, { key: 'Escape' });
}

const chooseColumn = (control, index, language = 'en') => choose(control,
    new RegExp('^' + new Intl.NumberFormat({he:'he-IL',ar:'ar-IL',en:'en-GB'}[language]).format(index) + ' · '));
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
    expectChoice(name, i18n.t('signingV2.compose.mapping.skip'));
    await chooseColumn(name, 2, lang);
    await chooseColumn(email, 2, lang);
    expect(review).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('signingV2.compose.errors.INVALID_COLUMN_MAPPING'));
    await chooseColumn(email, 1, lang);
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
    const { upload, i18n } = await setup('en', { api }); upload();
    const name = await screen.findByRole('combobox', { name: 'Full name (required)' });
    expectChoice(name, i18n.t('signingV2.compose.mapping.skip'));
    expect(screen.getByRole('button', { name: 'Review mapping' })).toBeDisabled();
});

test('required data columns must be mapped and invalid spreadsheet rows cannot be silently omitted on apply', async () => {
    const fields = [{ key: 'id', label: 'Identity number', type: 'identifier', required: true }];
    const api = { inspectWorkbook: jest.fn().mockResolvedValue({ sheets: [{ ...metadata.sheets[0], columns: [...metadata.sheets[0].columns,
        { index: 3, header: 'Identifier', suggestedKey: null, samples: ['000123'] }] }] }),
        parseWorkbook: jest.fn().mockResolvedValue({ rows: [{ ...rows[0], data: { id: '000123' }, dataSources: { id: 'import' } }], errors: [{ row: 3, field: 'Identity number', code: 'UNSAFE_DATA_CELL' }] }) };
    const { props, i18n, upload } = await setup('en', { api, dataFields: fields }); upload();
    await chooseColumn(await screen.findByRole('combobox', { name: 'Full name (required)' }), 2);
    await chooseColumn(screen.getByRole('combobox', { name: 'Email', exact: true }), 1);
    const review = screen.getByRole('button', { name: i18n.t('signingV2.compose.mapping.preview') });
    expect(review).toBeDisabled();
    await chooseColumn(screen.getByRole('combobox', { name: 'Identity number (required)' }), 3);
    fireEvent.click(review);
    await screen.findByText('000123');
    expect(await screen.findByRole('button', { name: i18n.t('signingV2.compose.mapping.apply') })).toBeDisabled();
    expect(props.onApply).not.toHaveBeenCalled();
});

test('conditional recipient columns are optional at import but are explained before mapping confirmation',async()=>{
    const {props,i18n,upload}=await setup('en',{roles:[{key:'buyer',label:'Buyer',when:{key:'flag',operator:'equals',value:true}}]});
    upload();await screen.findByRole('heading',{name:i18n.t('signingV2.compose.mapping.heading')});
    expect(screen.getByText(i18n.t('signingV2.compose.mapping.conditionalRole'))).toBeVisible();
    expect(screen.getByRole('button',{name:i18n.t('signingV2.compose.mapping.preview')})).toBeDisabled();
    await chooseColumn(screen.getByRole('combobox',{name:'Full name'}), 2);
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.compose.mapping.preview')}));
    await waitFor(()=>expect(props.api.parseWorkbook).toHaveBeenCalledWith('template-v1',expect.any(String),{mapping:{sheetId:1,columns:{'buyer.name':2}}}));
    expect(props.onApply).not.toHaveBeenCalled();
});


test('two required people have separate mappings; an optional third never blocks or shifts them',async()=>{
    const api={inspectWorkbook:jest.fn().mockResolvedValue({sheets:[{id:1,name:'People',columns:[1,2,3,4].map(index=>({index,header:`Column ${index}`,samples:[]}))}]}),parseWorkbook:jest.fn().mockResolvedValue({rows:[{sourceRow:2,recipients:{buyer:{people:[{name:'First',email:'one@example.invalid'},{name:'Second',email:'two@example.invalid'}]}}}],errors:[]})};
    const {upload}=await setup('en',{roles:[{key:'buyer',label:'Buyers',min:2,max:3}],api});upload();
    const first=within(await screen.findByRole('group',{name:'Buyers · 1'}));
    const second=within(screen.getByRole('group',{name:'Buyers · 2'}));
    await chooseColumn(first.getByLabelText('Full name (required)'), 1);
    await chooseColumn(first.getByLabelText('Email'), 2);
    expect(screen.getByRole('button',{name:'Review mapping'})).toBeDisabled();
    await chooseColumn(second.getByLabelText('Full name (required)'), 3);
    await chooseColumn(second.getByLabelText('Email'), 4);
    expectChoice(within(screen.getByRole('group',{name:'Buyers · 3'})).getByLabelText('Full name'), 'Not mapped');
    fireEvent.click(screen.getByRole('button',{name:'Review mapping'}));
    await screen.findByText('First · one@example.invalid');
    expect(screen.getByText('Second · two@example.invalid')).toBeVisible();
    expect(api.parseWorkbook.mock.calls[0][2].mapping.columns).toEqual({'buyer.people.0.name':1,'buyer.people.0.email':2,'buyer.people.1.name':3,'buyer.people.1.email':4});
});
