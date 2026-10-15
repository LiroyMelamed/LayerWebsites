import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {createInstance} from 'i18next';
import {I18nextProvider,initReactI18next} from 'react-i18next';
import PackageApprovalDialog from './PackageApprovalDialog';
import ApprovalReviewerField from './ApprovalReviewerField';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer',()=>{ const React=require('react'); return props=>React.createElement('button',{onClick:()=>props.onDocumentReady(true)},'Synthetic PDF loaded'); });
if(!window.crypto?.getRandomValues)Object.defineProperty(window,'crypto',{value:require('crypto').webcrypto});
const review={name:'Review package',preparer:'Preparer',state:'pending',ready:true,reviewHash:'hash',documents:[{id:'a',name:'Agreement',hash:'a-hash',artifactId:'a-pdf'},{id:'b',name:'Appendix',hash:'b-hash',artifactId:'b-pdf'}]};
const apiFor=()=>({approvalReview:jest.fn().mockResolvedValue(review),documentFile:jest.fn().mockResolvedValue(new Blob(['pdf'])),decideApproval:jest.fn().mockResolvedValue({state:'approved'})});
async function i18n(lng='en'){const i=createInstance();await i.use(initReactI18next).init({resources:{he:{translation:he},ar:{translation:ar},en:{translation:en}},lng,fallbackLng:false,interpolation:{escapeValue:false}});return i;}
async function mount(api,lng='en'){const i=await i18n(lng);render(<I18nextProvider i18n={i}><PackageApprovalDialog api={api} packageId="package" onClose={jest.fn()}/></I18nextProvider>);await screen.findByText(review.name);return i;}
async function openAll(){for(const d of review.documents){fireEvent.click(screen.getByRole('button',{name:d.name}));fireEvent.click(await screen.findByRole('button',{name:'Synthetic PDF loaded'}));}await waitFor(()=>expect(screen.getByRole('checkbox')).toBeEnabled());fireEvent.click(screen.getByRole('checkbox'));}
test.each(['he','ar','en'])('new PDF approval requires every viewer to load and separate consent in %s',async language=>{
 const api=apiFor(),i=await mount(api,language);expect(screen.getByRole('dialog')).toHaveAttribute('dir',language==='en'?'ltr':'rtl');
 expect(screen.getByRole('checkbox')).toBeDisabled();const confirm=screen.getByRole('button',{name:i.t('signingV2.approval.confirm')});expect(confirm).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Agreement'}));const first=await screen.findByRole('button',{name:'Synthetic PDF loaded'});expect(screen.getByRole('checkbox')).toBeDisabled();fireEvent.click(first);expect(screen.getByRole('checkbox')).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Appendix'}));fireEvent.click(await screen.findByRole('button',{name:'Synthetic PDF loaded'}));await waitFor(()=>expect(screen.getByRole('checkbox')).toBeEnabled());expect(confirm).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(confirm);fireEvent.click(confirm);await screen.findByText(i.t('signingV2.approval.approved'));expect(api.decideApproval).toHaveBeenCalledTimes(1);expect(api.decideApproval.mock.calls[0][1]).toEqual({action:'approve',reviewed:true,reviewHash:'hash',documents:review.documents.map(({id,hash,artifactId})=>({id,hash,artifactId}))});
});
test('new return path requires reason but never requires consenting to incorrect PDFs',async()=>{
 const api=apiFor();api.decideApproval.mockResolvedValue({state:'returned'});const i=await mount(api);fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.approval.return')}));const submit=screen.getByRole('button',{name:i.t('signingV2.approval.returnConfirm')});expect(submit).toBeDisabled();fireEvent.change(screen.getByRole('textbox'),{target:{value:'Correct the amount'}});fireEvent.click(submit);await screen.findByText(i.t('signingV2.approval.returned'));expect(api.decideApproval.mock.calls[0][1]).toEqual({action:'return',reason:'Correct the amount',reviewHash:'hash'});expect(api.documentFile).not.toHaveBeenCalled();
});
test('new approval retry retains the key and changed review requires fresh documents and consent',async()=>{
 const api=apiFor();api.decideApproval.mockRejectedValueOnce({code:'REQUEST_FAILED'}).mockRejectedValueOnce({code:'VERSION_CHANGED'});const i=await mount(api);await openAll();fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.approval.confirm')}));await screen.findByText(i.t('signingV2.errors.REQUEST_FAILED'));fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.approval.confirm')}));await screen.findByText(i.t('signingV2.errors.VERSION_CHANGED'));expect(api.decideApproval.mock.calls[0]).toEqual(api.decideApproval.mock.calls[1]);expect(screen.getByRole('button',{name:i.t('signingV2.approval.confirm')})).toBeDisabled();
 api.approvalReview.mockResolvedValue({...review,reviewHash:'new-hash'});fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.refresh')}));await screen.findByText(review.name);expect(screen.getByRole('checkbox')).not.toBeChecked();expect(screen.getByRole('checkbox')).toBeDisabled();
});
test('new reviewer selection excludes self unless solo profile is explicit and hides stale options after failed refresh',async()=>{
 const i=await i18n(),api={approvalReviewers:jest.fn().mockResolvedValue({users:[{id:1,name:'Me',self:true},{id:2,name:'Reviewer',self:false}]})},changed=jest.fn();
 const {rerender}=render(<I18nextProvider i18n={i}><ApprovalReviewerField api={api} onChange={changed}/></I18nextProvider>);const picker=await screen.findByRole('combobox');fireEvent.click(picker);await screen.findByRole('option',{name:'Reviewer'});expect(screen.queryByRole('option',{name:'Me'})).toBeNull();fireEvent.pointerDown(screen.getByRole('option',{name:'Reviewer'}));expect(changed).toHaveBeenCalledWith(2);
 rerender(<I18nextProvider i18n={i}><ApprovalReviewerField api={api} onChange={changed} soloAllowed/></I18nextProvider>);fireEvent.click(screen.getByRole('combobox'));expect(screen.getByRole('option',{name:/Me/})).toBeTruthy();
 const failed={approvalReviewers:jest.fn().mockRejectedValue({code:'FORBIDDEN'})};rerender(<I18nextProvider i18n={i}><ApprovalReviewerField api={failed} onChange={changed}/></I18nextProvider>);await screen.findByText(i.t('signingV2.errors.FORBIDDEN'));expect(screen.queryByRole('combobox')).toBeNull();
});
test('new reviewer roster search keeps an explicitly selected reviewer visible',async()=>{
 const i=await i18n(),api={approvalReviewers:jest.fn().mockResolvedValue({users:Array.from({length:10},(_,index)=>({id:index+1,name:'Reviewer '+index,self:false}))})};
 render(<I18nextProvider i18n={i}><ApprovalReviewerField api={api} value={3} onChange={jest.fn()}/></I18nextProvider>);const search=await screen.findByRole('textbox',{name:i.t('signingV2.lifecycle.assign.search')});fireEvent.change(search,{target:{value:'Reviewer 8'}});fireEvent.click(screen.getByRole('combobox'));await screen.findByRole('option',{name:'Reviewer 8'});expect(screen.getAllByRole('option')).toHaveLength(3);expect(screen.getByRole('option',{name:'Reviewer 2'})).toHaveAttribute('aria-selected','true');expect(screen.getByRole('option',{name:'Reviewer 2'})).toBeTruthy();
});
