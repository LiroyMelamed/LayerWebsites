import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {createInstance} from 'i18next';
import {I18nextProvider,initReactI18next} from 'react-i18next';
import en from '../../../i18n/locales/en.json';
import api from '../../../api/packageRecipesApi';
import wordApi from '../../../api/wordTemplatesApi';
import PackageRecipeEditor from './PackageRecipeEditor';
import {emptyRecipe} from './recipeEditorModel';
jest.mock('../../../api/packageRecipesApi',()=>({__esModule:true,default:{wordWorkingCopy:jest.fn(),saveDraft:jest.fn()}}));
jest.mock('../../../api/wordTemplatesApi',()=>({__esModule:true,default:{list:jest.fn()}}));
jest.mock('../templates/TemplateBuilder',()=>()=>null);
jest.mock('../templates/TemplateRoles',()=>()=>null);
const mockSave=jest.fn();
jest.mock('../word/WordTemplatesWorkspace',()=>{const React=require('react');return props=>{
    const [dirty,setDirty]=React.useState(false);
    props.authoringControllerRef.current={dirty,busy:false,save:async()=>{
        const source=await mockSave();if(source){props.onSourceSaved(source);setDirty(false);}return source;
    }};
    React.useEffect(()=>props.onDraftChange({dirty,busy:false}),[dirty]);
    return React.createElement('button',{onClick:()=>setDirty(true)},'Mark source dirty');
};});
if(!window.crypto?.randomUUID)Object.defineProperty(window,'crypto',{value:require('crypto').webcrypto});
const source={id:'copy',version:1,sourceHash:'a'.repeat(64),name:'Word source',roles:[],bindings:[]};
async function show(){
    const i18n=createInstance();await i18n.use(initReactI18next).init({resources:{en:{translation:en}},lng:'en',interpolation:{escapeValue:false}});
    const definition={...emptyRecipe('en','Signer'),name:'Example',documents:[{key:'doc',name:'Word source',source:{kind:'word',id:'original',version:1,hash:source.sourceHash},mappings:[],signatureFields:[]}]};
    render(<I18nextProvider i18n={i18n}><PackageRecipeEditor recipe={{id:'recipe',version:1,definition,visibility:'private'}} onBack={()=>{}}/></I18nextProvider>);
    fireEvent.click(screen.getByRole('button',{name:en.documentPackages.editDocument}));await screen.findByRole('button',{name:'Mark source dirty'});
}
beforeEach(()=>{wordApi.list.mockResolvedValue({catalog:{fields:[],roleFields:[]}});api.wordWorkingCopy.mockResolvedValue({source});api.saveDraft.mockResolvedValue({draft:{version:1}});mockSave.mockResolvedValue({...source,version:2});});
test('saving the package draft first saves pending Word mappings and pins the returned version',async()=>{
    await show();fireEvent.click(screen.getByRole('button',{name:'Mark source dirty'}));fireEvent.click(screen.getByRole('button',{name:en.documentPackages.saveDraft}));
    await waitFor(()=>expect(api.saveDraft).toHaveBeenCalledTimes(1));expect(mockSave).toHaveBeenCalledTimes(1);
    expect(api.saveDraft.mock.calls[0][1].definition.documents[0].source.version).toBe(2);
});
test('failed Word save keeps the editor open and does not persist a stale package draft',async()=>{
    mockSave.mockResolvedValue(null);await show();fireEvent.click(screen.getByRole('button',{name:'Mark source dirty'}));fireEvent.click(screen.getByRole('button',{name:en.documentPackages.saveDraft}));
    await waitFor(()=>expect(mockSave).toHaveBeenCalledTimes(1));expect(api.saveDraft).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Mark source dirty'})).toBeInTheDocument();
});
