import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {createInstance} from 'i18next';
import {I18nextProvider,initReactI18next} from 'react-i18next';
import he from '../../../i18n/locales/he.json';
import api from '../../../api/packageRecipesApi';
import signingApi from '../../../api/signingPackagesApi';
import PackageRecipeUse from './PackageRecipeUse';
jest.mock('../../../api/packageRecipesApi',()=>({__esModule:true,default:{inputs:jest.fn(),prepare:jest.fn(),pdf:jest.fn(),nativeDraft:jest.fn()}}));
jest.mock('../../../api/signingPackagesApi',()=>({__esModule:true,default:{publishTemplateDraft:jest.fn()}}));
jest.mock('../word/WordRecordPicker',()=>{const React=require('react');return ({label,onChange})=>React.createElement('button',{onClick:()=>onChange({id:22,label:'Second person'})},label);});
jest.mock('../templates/PackageComposer',()=>{const React=require('react');return props=>React.createElement('div',{'data-testid':'existing-composer'},JSON.stringify(props.preparedData));});
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer',()=>{const React=require('react');return ({onDocumentReady})=>{React.useEffect(()=>onDocumentReady(true),[onDocumentReady]);return React.createElement('div',null,'PDF');};});
if(!window.crypto?.randomUUID)Object.defineProperty(window,'crypto',{value:require('crypto').webcrypto});
const recipe={id:'recipe',version:1,definitionHash:'hash',name:'Package',definition:{dataRoles:[{key:'tenant',label:'שוכר'}],fields:[
    {key:'plot',label:'גוש',required:true,source:{kind:'manual'}},
    {key:'identity',label:'תעודת זהות',required:true,source:{kind:'role',roleKey:'tenant',property:'identityNumber'}},
],documents:[{mappings:[{bindingId:'p',fieldKey:'plot'},{bindingId:'i',fieldKey:'identity'}],signatureFields:[]}]}};
const fields=recordId=>recipe.definition.fields.map(field=>({...field,value:'',missing:true,overridden:false,linked:field.key==='identity',recordId:field.key==='identity'?recordId:null}));
async function show(){const i18n=createInstance();await i18n.use(initReactI18next).init({resources:{he:{translation:he}},lng:'he',interpolation:{escapeValue:false}});render(<I18nextProvider i18n={i18n}><PackageRecipeUse recipe={recipe} onBack={()=>{}}/></I18nextProvider>);await screen.findByRole('textbox',{name:'גוש'});}
beforeEach(()=>{
    api.inputs.mockImplementation(async(_id,body)=>({fields:fields(body.inputs.roleClientIds.tenant||null)}));
    api.pdf.mockResolvedValue(new Blob(['pdf']));
});
test('changing the data person clears only that persons override and preserves manual fields',async()=>{
    await show();
    fireEvent.change(screen.getByRole('textbox',{name:'גוש'}),{target:{value:'12345'}});
    fireEvent.change(screen.getByRole('textbox',{name:'תעודת זהות'}),{target:{value:'00999'}});
    fireEvent.click(screen.getByRole('button',{name:'שוכר'}));
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'תעודת זהות'})).toHaveValue(''));
    expect(screen.getByRole('textbox',{name:'גוש'})).toHaveValue('12345');
    expect(screen.getByRole('button',{name:'הכנת המסמכים לבדיקה'})).toBeDisabled();
    expect(api.inputs.mock.calls.at(-1)[1].inputs.values).toEqual({plot:{value:'12345'}});
});
test('prepare is deduplicated, every document is checked, and continuation uses the existing composer',async()=>{
    let complete;api.prepare.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const prepared={id:'prepared',definitionHash:'bound-hash',definition:{documents:[{key:'a',name:'A'},{key:'b',name:'B'}]},accessRefs:{},data:{plot:'12345'}};
    api.nativeDraft.mockResolvedValue({version:{id:'draft',editVersion:1,definitionHash:'bound-hash'}});
    signingApi.publishTemplateDraft.mockResolvedValue({version:{id:'published',version:1}});
    await show();fireEvent.change(screen.getByRole('textbox',{name:'גוש'}),{target:{value:'12345'}});fireEvent.change(screen.getByRole('textbox',{name:'תעודת זהות'}),{target:{value:'00999'}});
    const button=screen.getByRole('button',{name:'הכנת המסמכים לבדיקה'});act(()=>{button.click();button.click();});expect(api.prepare).toHaveBeenCalledTimes(1);
    await act(async()=>complete({preparation:prepared}));await screen.findByText('PDF');
    fireEvent.click(screen.getByRole('checkbox',{name:'בדקתי את המסמך הזה'}));
    expect(screen.getByRole('button',{name:'המשך לחותמים ושליחה'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'B'}));await waitFor(()=>expect(screen.getByRole('checkbox')).toBeEnabled());
    fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'המשך לחותמים ושליחה'}));
    await screen.findByTestId('existing-composer');expect(api.nativeDraft.mock.calls[0][1]).toEqual({expectedHash:'bound-hash'});
    expect(screen.getByTestId('existing-composer')).toHaveTextContent('12345');
});
