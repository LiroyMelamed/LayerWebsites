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
    fireEvent.change(screen.getByLabelText(t('fieldType')),{target:{value:'data'}});
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.builder.addField',{page:new Intl.NumberFormat({he:'he-IL',ar:'ar-IL',en:'en-GB'}[language]).format(1)})}));
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
