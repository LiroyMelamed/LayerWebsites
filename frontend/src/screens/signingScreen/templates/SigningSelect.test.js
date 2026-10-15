/* eslint-disable testing-library/no-node-access, testing-library/no-container -- These focused regressions verify native-select absence, dialog portal ancestry and keyboard focus ownership. */
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import SigningSelect from './SigningSelect';
import ChooseButton from '../../../components/styledComponents/buttons/ChooseButton';
import TemplateBuilder from './TemplateBuilder';
import TemplateRoles from './TemplateRoles';
import TemplatesWorkspace from './TemplatesWorkspace';
import api from '../../../api/signingTemplatesApi';
import en from '../../../i18n/locales/en.json';
import ar from '../../../i18n/locales/ar.json';
import he from '../../../i18n/locales/he.json';

jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: {
    list: jest.fn(), batches: jest.fn(), archive: jest.fn(), pdf: jest.fn(), save: jest.fn(),
} }));
jest.mock('../../../utils/fileUploadUtils', () => ({ uploadFileToR2: jest.fn() }));
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => () => <div>PDF</div>);
jest.mock('./NativeTemplateBuilder', () => () => null);
jest.mock('./BatchComposer', () => () => null);

let i18n;
beforeEach(async () => {
    jest.clearAllMocks();
    i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources: { en: { translation: en }, ar: { translation: ar }, he: { translation: he } },
        lng: 'en', fallbackLng: false, interpolation: { escapeValue: false } });
});
const mount = view => render(<I18nextProvider i18n={i18n}>{view}</I18nextProvider>);
const choose = (control, label) => {
    fireEvent.click(control);
    fireEvent.pointerDown(screen.getByRole('option', { name: label }));
};

test('platform selector preserves zero boolean and role-link strings, control labels ids RTL and error focus', () => {
    const changed = jest.fn();
    function View() {
        const [value, setValue] = useState(0);
        return <><label htmlFor="typed-choice">Signer position<SigningSelect id="typed-choice" dir="rtl" value={value}
            aria-invalid aria-describedby="choice-error" onChange={event => { changed(event.target.value); setValue(event.target.value); }}>
            <option value={0}>Zero</option><React.Fragment><option value={false}>False</option><option value="buyer|1">Second buyer</option></React.Fragment>
        </SigningSelect></label><span id="choice-error">Required</span></>;
    }
    const { container } = mount(<View />);
    const control = screen.getByRole('combobox', { name: 'Signer position' });
    expect(control).toBe(screen.getByLabelText('Signer position'));
    expect(control.id).toBe('typed-choice'); expect(control).toHaveAttribute('dir', 'rtl');
    expect(control).toHaveAttribute('aria-invalid', 'true'); expect(control).toHaveAttribute('aria-describedby', 'choice-error');
    control.focus(); expect(document.activeElement).toBe(control);
    expect(container.querySelector('select')).toBeNull();
    choose(control, 'False'); expect(changed).toHaveBeenLastCalledWith('false'); expect(control).toHaveTextContent('False');
    choose(control, 'Second buyer'); expect(changed).toHaveBeenLastCalledWith('buyer|1'); expect(control).toHaveTextContent('Second buyer');
    choose(control, 'Zero'); expect(changed).toHaveBeenLastCalledWith('0'); expect(control).toHaveTextContent('Zero');
});

test('controlled empty pickers and uncontrolled defaults retain the incumbent select contract', () => {
    const changed = jest.fn();
    mount(<><label>Case signer<SigningSelect value="" onChange={event => changed(event.target.value)}><option value="">Choose signer</option><option value="19">Person19</option></SigningSelect></label>
        <label>Default<SigningSelect defaultValue="false"><option value="false">No</option><option value="true">Yes</option></SigningSelect></label></>);
    const picker = screen.getByRole('combobox', { name: 'Case signer' });
    choose(picker, 'Person19'); expect(changed).toHaveBeenCalledWith('19'); expect(picker).toHaveTextContent('Choose signer');
    const defaults = screen.getByRole('combobox', { name: 'Default' }); expect(defaults).toHaveTextContent('No');
    choose(defaults, 'Yes'); expect(defaults).toHaveTextContent('Yes');
});

test('disabled options and inherited disabled fieldsets cannot change business values', () => {
    const changed = jest.fn();
    const { rerender } = mount(<fieldset><label>Maximum<SigningSelect value="1" onChange={changed}><option value="1">One</option><option value="2" disabled>Two</option></SigningSelect></label></fieldset>);
    const control = screen.getByRole('combobox', { name: 'Maximum' });
    fireEvent.click(control); const disabled = screen.getByRole('option', { name: 'Two' }); expect(disabled).toBeDisabled();
    fireEvent.pointerDown(disabled); expect(changed).not.toHaveBeenCalled();
    rerender(<I18nextProvider i18n={i18n}><fieldset disabled><label>Maximum<SigningSelect value="1" onChange={changed}><option value="1">One</option><option value="2">Two</option></SigningSelect></label></fieldset></I18nextProvider>);
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Two' })); expect(changed).not.toHaveBeenCalled();
});

test('menu portals into its parent dialog and keyboard Escape closes only the list preserving the draft', () => {
    const parentEscape = jest.fn(), changed = jest.fn();
    mount(<dialog open data-testid="parent" onKeyDown={event => { if (event.key === 'Escape') parentEscape(); }}>
        <div style={{ overflow: 'hidden' }}><label>Order<SigningSelect value="one" onChange={changed}><option value="one">First</option><option value="blocked" disabled>Blocked</option><option value="two">Second</option></SigningSelect></label></div>
    </dialog>);
    const control = screen.getByRole('combobox', { name: 'Order' });
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    const list = screen.getByRole('listbox'); expect(screen.getByTestId('parent')).toContainElement(list);
    expect(list.parentElement).toBe(screen.getByTestId('parent'));
    expect(control).toHaveAttribute('aria-expanded', 'true'); expect(list.id).toBe(control.getAttribute('aria-controls'));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' }); expect(document.activeElement).toHaveTextContent('Second');
    fireEvent.keyDown(document.activeElement, { key: 'Home' }); expect(document.activeElement).toHaveTextContent('First');
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull(); expect(parentEscape).not.toHaveBeenCalled(); expect(document.activeElement).toBe(control);
    expect(screen.getByTestId('parent')).toHaveAttribute('open'); expect(changed).not.toHaveBeenCalled();
});

test('existing default ChooseButton usage still retains its own choices and callback', () => {
    const changed = jest.fn();
    mount(<ChooseButton buttonText="All" buttonChoices={['One', 'Two']} OnPressChoiceFunction={changed} />);
    const control = screen.getByRole('button', { name: 'All' });
    fireEvent.click(control); fireEvent.pointerDown(screen.getByRole('button', { name: 'Two' }));
    expect(changed).toHaveBeenLastCalledWith('Two', { value: 'Two', label: 'Two' });
    expect(screen.getByRole('button', { name: 'Two' })).toBe(control); expect(control).not.toHaveAttribute('role');
});

test('dirty builder uses platform leave confirmation and preserves draft on cancel before explicit leave', async () => {
    const back = jest.fn(), nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => { throw Error('Native confirm forbidden'); });
    try {
        const { container } = mount(<TemplateBuilder onBack={back} onSaved={jest.fn()} />);
        const key = suffix => i18n.t(`signingV2.builder.${suffix}`);
        fireEvent.change(screen.getByLabelText(key('name')), { target: { value: 'Unsaved draft' } });
        expect(container.querySelector('select')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: key('back') }));
        const popup = await screen.findByRole('dialog', { name: key('back') });
        expect(popup).toHaveTextContent(key('leave')); expect(back).not.toHaveBeenCalled();
        fireEvent.click(within(popup).getByRole('button', { name: i18n.t('common.cancel') }));
        expect(screen.getByLabelText(key('name'))).toHaveValue('Unsaved draft'); expect(back).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: key('back') }));
        const next = await screen.findByRole('dialog', { name: key('back') });
        fireEvent.click(within(next).getByRole('button', { name: key('back') }));
        expect(back).toHaveBeenCalledTimes(1); expect(nativeConfirm).not.toHaveBeenCalled();
    } finally { nativeConfirm.mockRestore(); }
});

test('legacy archive uses incumbent platform confirmation; cancel is inert and confirm retains id and version', async () => {
    const nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => { throw Error('Native confirm forbidden'); });
    api.list.mockResolvedValue({ templates: [{ id: 'legacy1', version: 4, name: 'Synthetic template', document_count: 2 }] });
    api.batches.mockResolvedValue({ batches: [] }); api.archive.mockResolvedValue({});
    try {
        mount(<TemplatesWorkspace onClose={jest.fn()} canManage canUpload />);
        const archive = await screen.findByRole('button', { name: i18n.t('signingV2.workspace.archive') });
        fireEvent.click(archive); const popup = await screen.findByRole('dialog', { name: i18n.t('signingV2.workspace.archive') });
        expect(popup).toHaveTextContent('Synthetic template'); expect(api.archive).not.toHaveBeenCalled();
        fireEvent.click(within(popup).getByRole('button', { name: i18n.t('common.cancel') })); expect(api.archive).not.toHaveBeenCalled();
        fireEvent.click(archive); const next = await screen.findByRole('dialog', { name: i18n.t('signingV2.workspace.archive') });
        fireEvent.click(within(next).getByRole('button', { name: i18n.t('signingV2.workspace.archive') }));
        await waitFor(() => expect(api.archive).toHaveBeenCalledTimes(1)); expect(api.archive).toHaveBeenCalledWith('legacy1', 4);
        expect(nativeConfirm).not.toHaveBeenCalled();
    } finally { nativeConfirm.mockRestore(); }
});

test('incumbent role arrows preserve bindings, boundaries and native grouped-stage semantics', () => {
    const changed = jest.fn();
    const roles = [{ id: 'buyer', name: 'Buyer', kind: 'custom', nativeRole: { capacity: 'personal' } },
        { id: 'lawyer', name: 'Lawyer', kind: 'shared', nativeRole: { capacity: 'professional' } }];
    const draft = { roles, documents: [{ id: 'doc', fields: [{ roleId: 'buyer' }] }], signingOrder: 'sequential' };
    const view = state => <I18nextProvider i18n={i18n}><TemplateRoles draft={state} native onChange={changed} roleId="buyer" onRoleId={jest.fn()} /></I18nextProvider>;
    const { container, rerender } = render(view(draft));
    const up = name => screen.getByRole('button', { name: i18n.t('signingV2.builder.up', { name }) });
    const down = name => screen.getByRole('button', { name: i18n.t('signingV2.builder.down', { name }) });
    expect(up('Buyer')).toBeDisabled(); expect(down('Lawyer')).toBeDisabled();
    expect(down('Buyer')).toHaveTextContent('▼'); expect(up('Lawyer')).toHaveTextContent('▲');
    expect(container.querySelectorAll('.lw-signingRoles > .lw-templates__role')).toHaveLength(2);
    fireEvent.click(down('Buyer')); expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith({ roles: [roles[1], roles[0]] });
    const grouped = { ...draft, signingOrder: 'grouped', signingGroups: [['buyer'], ['lawyer']] };
    rerender(view(grouped)); expect(container.querySelector('.lw-signingRoles__move')).toBeNull();
    const stage = screen.getByRole('combobox', { name: i18n.t('signingV2.compose.order.stageFor', { name: 'Buyer' }) });
    expect(stage).toHaveTextContent(i18n.t('signingV2.compose.order.stage', { number: '1' }));
    expect(changed).toHaveBeenCalledTimes(1); expect(container.querySelector('select')).toBeNull();
});
