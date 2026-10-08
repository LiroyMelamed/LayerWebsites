import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import NativeTemplateBuilder from './NativeTemplateBuilder';
import { toEditor, fromEditor } from './nativeTemplateAdapter';
import { resolveSelectedTemplate } from './SelectedTemplateEntry';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';
// These adapter/authoring assertions use the string-valued select contract.
// The incumbent platform popup itself is covered in SigningSelect.test.js and browser evidence.
jest.mock('./SigningSelect', () => props => <select {...props} />);

jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => {
    const Spot = require('../../../components/specializedComponents/signFiles/signatureSpots/SignatureSpot').default;
    return props => <div>
    {props.spots.map((spot,index) => <Spot key={index} spot={spot} index={index} signerName={spot.signerName} />)}
    <button onClick={() => props.onSelectSpot(props.spots.length - 1)}>Select last PDF field</button>
    <button onClick={() => props.onUpdateSpot(0, { x: 111.25, y: 231.75 })}>Move first PDF field</button>
</div>; });
if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });
const definition = () => ({ schemaVersion: 2, name: 'Existing native template', locale: 'he',
    dataKeys: [{ key: 'identifier', label: 'Identity', type: 'identifier', required: true }, { key: 'amount', label: 'Amount', type: 'decimal', defaultValue: '9007199254740993.120000' }],
    stages: [{ key:'together', label:'Together', after:null }, { key:'later', label:'Later', after:'together' }],
    roles: ['buyer','seller','lawyer'].map((key,index) => ({ key,label:key,capacity:index===2?'professional':'personal',min:1,max:1,stage:index===2?1:0,audience:'each' })),
    documents: [{ key:'agreement', name:'Agreement', sourceArtifactId:'source-1', sourceHash:'a'.repeat(64),
        fields:['buyer','seller','lawyer'].map((roleKey,index) => ({id:`f${index}`,type:'signature',roleKey,occurrence:0,pageNum:2,x:100,y:200+index*100,width:160.25,height:55.75,required:true})) }],
    policy:{otpRequired:true,deliveryMode:'manual',requiredAllPdfReview:true} });
async function setup(language) {
    const i18n=createInstance();
    await i18n.use(initReactI18next).init({resources:{he:{translation:he},ar:{translation:ar},en:{translation:en}},lng:language,fallbackLng:false,interpolation:{escapeValue:false}});
    return i18n;
}
const version = () => ({ id:'published-v1', templateId:'template-1',version:1,state:'published',definition:definition() });
function fakeApi() {
    return { templateDocument:jest.fn().mockResolvedValue(new Blob(['pdf'])),
        saveTemplateDraft:jest.fn().mockImplementation(async (id,body)=>({version:{id,templateId:'template-1',editVersion:body.expectedVersion+1,definitionHash:`hash${body.expectedVersion+1}`,definition:body.definition,state:'draft'}})),
        publishTemplateDraft:jest.fn().mockResolvedValue({version:{id:'new-published',templateId:'template-1',state:'published'}}),
    };
}
test.each(['he','ar','en'])('incumbent native editor authors a data overlay, keeps stage groups and explicitly saves then publishes in %s', async language => {
    const i18n=await setup(language),api=fakeApi(),saved=jest.fn();
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={version()} api={api} onBack={jest.fn()} onSaved={saved}/></I18nextProvider>);
    const t=key=>i18n.t(`signingV2.builder.${key}`),a=key=>i18n.t(`signingV2.authoring.${key}`);
    expect(screen.getByLabelText(t('order'))).toHaveValue('grouped');
    expect(screen.getByLabelText(i18n.t('signingV2.compose.order.stageFor',{name:'seller'}))).toHaveValue('0');
    fireEvent.click(screen.getByRole('button',{name:t('next')}));
    fireEvent.click(await screen.findByRole('button',{name:'Move first PDF field'}));
    fireEvent.click(screen.getByTitle(i18n.t('signing.fieldSettings.addFieldForPage',{page:1})));
    fireEvent.click(screen.getByRole('button',{name:a('dataField')}));
    expect(screen.getByTitle(i18n.t('signingV2.authoring.dataTitleNamed',{name:'Identity'}))).toHaveClass('is-required');
    fireEvent.click(screen.getByRole('button',{name:a('saveDraft')}));
    await screen.findByText(a('saved'));
    const [id,body]=api.saveTemplateDraft.mock.calls[0];
    expect(body.baseVersionId).toBe('published-v1');expect(body.expectedVersion).toBe(0);
    expect(body.definition.roles.map(role=>role.stage)).toEqual([0,0,1]);
    expect(body.definition.documents[0].fields[0]).toMatchObject({pageNum:2,x:111.25,y:231.75,width:160.25,height:55.75});
    expect(body.definition.documents[0].fields[3]).toMatchObject({type:'data',dataKey:'identifier',overflow:'block',fontSize:14});
    expect(body.definition.documents[0].fields[3].roleKey).toBeUndefined();
    expect(body.definition.dataKeys[1].defaultValue).toBe('9007199254740993.120000');
    expect(body.definition.policy).toEqual(definition().policy);
    expect(api.publishTemplateDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:t('next')}));
    const publish=screen.getByRole('button',{name:a('publish')});fireEvent.click(publish);fireEvent.click(publish);
    await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
    expect(api.saveTemplateDraft.mock.calls[1][1].expectedVersion).toBe(1);
    expect(api.publishTemplateDraft).toHaveBeenCalledTimes(1);
    expect(api.publishTemplateDraft).toHaveBeenCalledWith(id,{expectedVersion:2,definitionHash:'hash2'});
});
test('enum choices stay exact and fields used in a PDF cannot be removed', async()=>{
    const i18n=await setup('en'),api=fakeApi();
    const input=version();input.definition.documents[0].fields.push({id:'data1',type:'data',dataKey:'identifier',pageNum:1,x:10,y:10,width:100,height:30});
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={input} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    expect(within(screen.getByRole('group',{name:'Identity'})).getByRole('button',{name:'Remove data field'})).toBeDisabled();
    expect(within(screen.getByRole('group',{name:'Amount'})).getByRole('button',{name:'Remove data field'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Add data field'}));
    const field=screen.getByRole('group',{name:'New data field'});
    fireEvent.change(within(field).getByLabelText('Field name'),{target:{value:'Category'}});
    fireEvent.change(within(field).getByLabelText('Information type'),{target:{value:'enum'}});
    fireEvent.change(within(field).getByLabelText('Choices — one per line'),{target:{value:'א\nب\nC'}});
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
    await screen.findByText(i18n.t('signingV2.authoring.saved'));
    expect(api.saveTemplateDraft.mock.calls[0][1].definition.dataKeys.at(-1).options).toEqual(['א','ب','C']);
});
test('round trip keeps optional slot, authority capacity, conditions and data defaults',()=>{
    const original=definition();
    Object.assign(original.roles[0],{capacity:'representative',min:1,max:2,when:{key:'identifier',operator:'present'}});
    Object.assign(original.documents[0].fields[0],{occurrence:1,inactiveTreatment:'authored_inactive'});
    const restored=fromEditor(toEditor(original),'en');
    expect(restored.locale).toBe('he');
    expect(restored.roles[0]).toMatchObject(original.roles[0]);
    expect(restored.documents[0].fields[0]).toMatchObject(original.documents[0].fields[0]);
    expect(restored.policy).toEqual(original.policy);
});
test('a stale save never publishes or reports success',async()=>{
    const i18n=await setup('en'),api=fakeApi(),saved=jest.fn();
    api.saveTemplateDraft.mockRejectedValue({code:'VERSION_CHANGED'});
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={version()} api={api} onBack={jest.fn()} onSaved={saved}/></I18nextProvider>);
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.next')}));
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.next')}));
    fireEvent.click(screen.getByRole('button',{name:'Publish template'}));
    await screen.findByText(i18n.t('signingV2.errors.VERSION_CHANGED'));
    expect(api.publishTemplateDraft).not.toHaveBeenCalled();expect(saved).not.toHaveBeenCalled();
    expect(screen.queryByText(i18n.t('signingV2.authoring.saved'))).toBeNull();
});

test('sending an edited native import uses its current version, independently from the legacy origin',async()=>{
    const template={templateId:'native-1',versionId:'version-3',version:3,origin:{templateId:'legacy-1',version:1}};
    const api={templates:jest.fn().mockResolvedValue({templates:[template],legacy:[]}),importLegacy:jest.fn()};
    expect(await resolveSelectedTemplate(api,'native-1','he',3)).toEqual(template);
    await expect(resolveSelectedTemplate(api,'native-1','he',1)).rejects.toMatchObject({code:'SELECTED_TEMPLATE_CHANGED'});
    expect(api.importLegacy).not.toHaveBeenCalled();
});

test('saving freezes native edits so a success message cannot hide later unsaved changes',async()=>{
    const i18n=await setup('en'),api=fakeApi();let resolve;
    api.saveTemplateDraft.mockImplementation((id,body)=>new Promise(done=>{resolve=()=>done({version:{id,templateId:'template-1',editVersion:1,definitionHash:'hash1',definition:body.definition,state:'draft'}})}));
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={version()} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    const name=screen.getByLabelText(i18n.t('signingV2.builder.name'));
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
    expect(name).toBeDisabled();fireEvent.change(name,{target:{value:'Uncommitted change'}});
    expect(name).toHaveValue('Existing native template');
    await act(async()=>resolve());expect(name).toBeEnabled();
    fireEvent.change(name,{target:{value:'Next edit'}});
    expect(screen.queryByText(i18n.t('signingV2.authoring.saved'))).toBeNull();
});

test('an incomplete server draft reopens with editable required details',()=>{
    const draft=toEditor({schemaVersion:2,name:'Saved incomplete draft'});
    expect(draft.roles).toHaveLength(1);expect(draft.roles[0].name).toBe('');
    expect(draft.documents).toEqual([]);expect(fromEditor(draft,'en').name).toBe('Saved incomplete draft');
});

test.each(['he','ar','en'])('authors exact defaults and conditional document values without changing PDF geometry in %s',async language=>{
    const i18n=await setup(language),api=fakeApi(),input=version();
    input.definition.dataKeys.push({key:'consent',label:'Confirmed',type:'boolean'});
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={input} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    const a=key=>i18n.t(`signingV2.authoring.${key}`),b=key=>i18n.t(`signingV2.builder.${key}`);
    const amount=within(screen.getByRole('group',{name:'Amount'}));
    fireEvent.change(amount.getByLabelText(a('defaultValue')),{target:{value:'9007199254740994.000001'}});
    const confirmed=within(screen.getByRole('group',{name:'Confirmed'}));
    fireEvent.click(confirmed.getByLabelText(a('useDefault')));
    expect(confirmed.getByLabelText(a('defaultValue'))).toHaveValue('false');
    expect(confirmed.getByLabelText(a('defaultValue'))).toHaveAttribute('dir',language==='en'?'ltr':'rtl');
    fireEvent.click(screen.getByRole('button',{name:b('next')}));
    fireEvent.change(screen.getByLabelText(a('condition.field')),{target:{value:'amount'}});
    fireEvent.change(screen.getByLabelText(a('condition.operator')),{target:{value:'in'}});
    const label=n=>i18n.t('signingV2.authoring.condition.numberedValue',{number:new Intl.NumberFormat({he:'he-IL',ar:'ar-IL',en:'en-GB'}[language]).format(n)});
    fireEvent.change(screen.getByLabelText(label(1)),{target:{value:'9007199254740994.000001'}});
    fireEvent.click(screen.getByRole('button',{name:a('condition.add')}));
    fireEvent.change(screen.getByLabelText(label(2)),{target:{value:'0.00'}});
    fireEvent.click(screen.getByRole('button',{name:a('saveDraft')}));
    await screen.findByText(a('saved'));
    const saved=api.saveTemplateDraft.mock.calls[0][1].definition;
    expect(saved.dataKeys[1].defaultValue).toBe('9007199254740994.000001');
    expect(saved.dataKeys[2].defaultValue).toBe(false);
    expect(saved.documents[0].when).toEqual({key:'amount',operator:'in',values:['9007199254740994.000001','0.00']});
    expect(saved.documents[0].fields).toEqual(input.definition.documents[0].fields.map(field=>({...field,label:''})));
    fireEvent.click(screen.getByRole('button',{name:b('previous')}));
    expect(within(screen.getByRole('group',{name:'Amount'})).getByLabelText(a('type'))).toBeDisabled();
    expect(within(screen.getByRole('group',{name:'Amount'})).getByRole('button',{name:a('removeData')})).toBeDisabled();
});

test('removing a default is explicit; stale enum values and role conditions remain visible/protected',async()=>{
    const i18n=await setup('en'),api=fakeApi(),input=version();
    input.definition.dataKeys.push({key:'category',label:'Category',type:'enum',options:['A','B'],defaultValue:'B'});
    input.definition.roles[0].when={key:'identifier',operator:'present'};
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={input} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    const category=within(screen.getByRole('group',{name:'Category'}));
    fireEvent.change(category.getByLabelText('Choices — one per line'),{target:{value:'A'}});
    expect(category.getByRole('option',{name:'B (no longer a choice)'})).toBeInTheDocument();
    expect(category.getByLabelText('Default value')).toHaveValue('B');
    fireEvent.click(category.getByLabelText('Use a default value'));
    expect(within(screen.getByRole('group',{name:'Identity'})).getByLabelText('Information type')).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
    await screen.findByText(i18n.t('signingV2.authoring.saved'));
    expect(api.saveTemplateDraft.mock.calls[0][1].definition.dataKeys[2].defaultValue).toBeUndefined();
    expect(api.saveTemplateDraft.mock.calls[0][1].definition.roles[0].when).toEqual(input.definition.roles[0].when);
});

test('conditional document supports false and explicit removal without retaining comparison values',async()=>{
    const i18n=await setup('en'),api=fakeApi(),input=version();
    input.definition.dataKeys.push({key:'flag',label:'Flag',type:'boolean'});
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={input} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.next')}));
    fireEvent.change(screen.getByLabelText('Based on field'),{target:{value:'flag'}});
    fireEvent.change(screen.getByLabelText('Include when'),{target:{value:'equals'}});
    expect(screen.getByLabelText('Comparison value')).toHaveValue('false');
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await screen.findByText(i18n.t('signingV2.authoring.saved'));
    expect(api.saveTemplateDraft.mock.calls[0][1].definition.documents[0].when).toEqual({key:'flag',operator:'equals',value:false});
    fireEvent.change(screen.getByLabelText('Based on field'),{target:{value:''}});
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await waitFor(()=>expect(api.saveTemplateDraft).toHaveBeenCalledTimes(2));
    expect(api.saveTemplateDraft.mock.calls[1][1].definition.documents[0].when).toBeNull();
});

test.each(['he','ar','en'])('date defaults use the incumbent date control and retain a date without timezone conversion in %s',async language=>{
    const i18n=await setup(language),api=fakeApi(),input=version();
    input.definition.dataKeys.push({key:'meeting',label:'Meeting',type:'date',defaultValue:'2028-02-01'});
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={input} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    const group=within(screen.getByRole('group',{name:'Meeting'}));
    fireEvent.change(group.getByRole('textbox',{name:i18n.t('calendar.dateSegmentDay')}),{target:{value:'29'}});
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.authoring.saveDraft')}));
    await screen.findByText(i18n.t('signingV2.authoring.saved'));
    expect(api.saveTemplateDraft.mock.calls[0][1].definition.dataKeys[2].defaultValue).toBe('2028-02-29');
});

test.each(['he','ar','en'])('nested document rules survive draft recovery and protect every referenced data key in %s',async language=>{
    const i18n=await setup(language),api=fakeApi(),input=version();
    const a=key=>i18n.t(`signingV2.authoring.condition.${key}`),b=key=>i18n.t(`signingV2.builder.${key}`);
    const view=render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={input} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    fireEvent.click(screen.getByRole('button',{name:b('next')}));
    fireEvent.change(screen.getByLabelText(a('field')),{target:{value:'amount'}});
    fireEvent.change(screen.getByLabelText(a('operator')),{target:{value:'equals'}});
    fireEvent.change(screen.getByLabelText(a('value')),{target:{value:'9007199254740993.120000'}});
    fireEvent.click(screen.getByRole('button',{name:a('addRule')}));
    fireEvent.change(screen.getByLabelText(a('combine')),{target:{value:'any'}});
    fireEvent.click(screen.getByRole('button',{name:a('addGroup')}));
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.authoring.saveDraft')}));
    await screen.findByText(i18n.t('signingV2.authoring.saved'));
    const saved=api.saveTemplateDraft.mock.calls[0][1].definition;
    expect(saved.documents[0].when).toEqual({operator:'any',conditions:[{key:'amount',operator:'equals',value:'9007199254740993.120000'},{key:'identifier',operator:'present'},{operator:'all',conditions:[{key:'identifier',operator:'present'}]}]});
    view.unmount();
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={{...input,definition:saved}} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    for(const label of ['Amount','Identity']){
        expect(within(screen.getByRole('group',{name:label})).getByLabelText(i18n.t('signingV2.authoring.type'))).toBeDisabled();
        expect(within(screen.getByRole('group',{name:label})).getByRole('button',{name:i18n.t('signingV2.authoring.removeData')})).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('button',{name:b('next')}));
    expect(screen.getAllByLabelText(a('combine')).map(select=>select.value)).toEqual(['any','all']);
    fireEvent.click(screen.getByRole('button',{name:b('next')}));
    expect(screen.getByText(/9007199254740993.120000/)).toBeVisible();
    expect(input.definition.documents[0].when).toBeUndefined();
});

test('a conditional signer needs an explicit inactive field treatment, preserved without changing PDF geometry',async()=>{
    const i18n=await setup('en'),api=fakeApi(),input=version();
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={input} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    // The detail node scopes the third role's conditional controls.
    // eslint-disable-next-line testing-library/no-node-access
    const role=within(screen.getAllByText('When this signer is required')[2].closest('details'));
    fireEvent.change(role.getByLabelText('Based on field'),{target:{value:'amount'}});
    fireEvent.change(role.getByLabelText('Include when'),{target:{value:'equals'}});
    fireEvent.change(role.getByLabelText('Comparison value'),{target:{value:'1.00'}});
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.next')}));
    fireEvent.click(await screen.findByRole('button',{name:'Select last PDF field'}));
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.selectedField')}));
    expect(screen.getByLabelText('When this signer is not included')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('When this signer is not included'),{target:{value:'exclude_document'}});
    fireEvent.click(screen.getByRole('button',{name:i18n.t('common.close')}));
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await screen.findByText(i18n.t('signingV2.authoring.saved'));
    const saved=api.saveTemplateDraft.mock.calls[0][1].definition;
    expect(saved.roles[2].when).toEqual({key:'amount',operator:'equals',value:'1.00'});
    expect(saved.documents[0].fields[2]).toEqual({...input.definition.documents[0].fields[2],label:'',inactiveTreatment:'exclude_document'});
    expect(fromEditor(toEditor(saved),'en').documents[0].fields[2].inactiveTreatment).toBe('exclude_document');
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.selectedField')}));
    fireEvent.change(screen.getByLabelText('When this signer is not included'),{target:{value:''}});
    fireEvent.click(screen.getByRole('button',{name:i18n.t('common.close')}));
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await waitFor(()=>expect(api.saveTemplateDraft).toHaveBeenCalledTimes(2));
    expect(api.saveTemplateDraft.mock.calls[1][1].definition.documents[0].fields[2].inactiveTreatment).toBeUndefined();
});

test('adding an explicit person position preserves all original fields; a used position cannot be removed by shrinking the role',async()=>{
    const i18n=await setup('en'),api=fakeApi(),input=version();
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={input} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    const maximum=screen.getAllByLabelText('Maximum people')[0];
    expect(within(maximum).getByRole('option',{name:'7'})).toBeDisabled();
    expect(within(maximum).getByRole('option',{name:'6'})).toBeEnabled();
    fireEvent.change(maximum,{target:{value:'2'}});
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.next')}));
    await screen.findByRole('button',{name:'Move first PDF field'});
    fireEvent.change(screen.getByLabelText('Signature position for buyer'),{target:{value:'1'}});
    fireEvent.click(screen.getByTitle(i18n.t('signing.fieldSettings.addFieldForPage',{page:1})));
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.types.signature')}));
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
    await screen.findByText(i18n.t('signingV2.authoring.saved'));
    const saved=api.saveTemplateDraft.mock.calls[0][1].definition;
    expect(saved.roles[0]).toMatchObject({min:1,max:2});
    expect(saved.documents[0].fields.slice(0,3)).toMatchObject(input.definition.documents[0].fields);
    expect(saved.documents[0].fields[3]).toMatchObject({occurrence:1,roleKey:'buyer'});
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.previous')}));
    expect(within(screen.getAllByLabelText('Maximum people')[0]).getByRole('option',{name:'1'})).toBeDisabled();
});

test('raising a role maximum without authored positions blocks publication and names the missing person',async()=>{
    const i18n=await setup('en'),api=fakeApi();
    render(<I18nextProvider i18n={i18n}><NativeTemplateBuilder version={version()} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
    fireEvent.change(screen.getAllByLabelText('Maximum people')[0],{target:{value:'2'}});
    fireEvent.click(screen.getByRole('button',{name:`3 ${i18n.t('signingV2.builder.review')}`}));
    expect(screen.getByRole('alert')).toHaveTextContent('Add a document field for buyer — person 2.');
    expect(screen.getByRole('button',{name:'Publish template'})).toBeDisabled();
    expect(api.publishTemplateDraft).not.toHaveBeenCalled();
});


test('two representative positions add a verified-person rule without changing geometry; reverting capacity removes only the generated rule', () => {
    const adapter = require('./nativeTemplateAdapter');
    const source={schemaVersion:2,name:'Synthetic',locale:'en',dataKeys:[],roles:[{key:'r',label:'Representatives',capacity:'personal',min:2,max:2,stage:0}],stages:[{key:'s',label:'Sign',after:null}],documents:[{key:'d',name:'Synthetic',sourceArtifactId:'source',sourceHash:'hash',fields:[{id:'f',type:'signature',roleKey:'r',occurrence:1,pageNum:1,x:20,y:50,width:100,height:40,required:true}]}],signingRules:[],policy:{otpRequired:true,deliveryMode:'invite'}};
    const draft=adapter.toEditor(source);draft.roles[0].nativeRole.capacity='representative';const edited=adapter.fromEditor(draft,'en');
    expect(edited.signingRules).toEqual([{type:'all_named',source:'role_pair',roles:[{key:'r',occurrence:0},{key:'r',occurrence:1}]}]);
    expect(edited.documents[0].fields[0]).toMatchObject(source.documents[0].fields[0]);
    const again=adapter.toEditor(edited);again.roles[0].nativeRole.capacity='personal';expect(adapter.fromEditor(again,'en').signingRules).toEqual([]);
});

test('new internal approval controls preserve existing review policy and require explicit solo profile',async()=>{
 const i=await setup('en'),api=fakeApi(),input=version();
 render(<I18nextProvider i18n={i}><NativeTemplateBuilder version={input} api={api} onBack={jest.fn()} onSaved={jest.fn()}/></I18nextProvider>);
 fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.builder.next')}));await screen.findByRole('button',{name:'Move first PDF field'});fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.builder.next')}));
 const approval=screen.getByRole('checkbox',{name:i.t('signingV2.approval.templateEnable')});expect(approval).toBeChecked();expect(screen.getByRole('checkbox',{name:i.t('signingV2.approval.templateSolo')})).not.toBeChecked();
 fireEvent.click(approval);expect(screen.queryByRole('checkbox',{name:i.t('signingV2.approval.templateSolo')})).toBeNull();fireEvent.click(approval);fireEvent.click(screen.getByRole('checkbox',{name:i.t('signingV2.approval.templateSolo')}));fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.authoring.saveDraft')}));await screen.findByText(i.t('signingV2.authoring.saved'));
 expect(api.saveTemplateDraft.mock.calls[0][1].definition.policy).toMatchObject({internalApproval:true,soloApproval:true});expect(api.saveTemplateDraft.mock.calls[0][1].definition.documents).toMatchObject(input.definition.documents);
});
