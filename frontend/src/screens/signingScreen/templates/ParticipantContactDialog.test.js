import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {createInstance} from 'i18next';
import {I18nextProvider,initReactI18next} from 'react-i18next';
import ParticipantContactDialog from './ParticipantContactDialog';
import ParticipantActionDialog from './ParticipantActionDialog';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';
if(!window.crypto?.getRandomValues)Object.defineProperty(window,'crypto',{value:require('crypto').webcrypto});
async function mount(Component,api,props={},language='en'){
 const i=createInstance();await i.use(initReactI18next).init({resources:{he:{translation:he},ar:{translation:ar},en:{translation:en}},lng:language,fallbackLng:false,interpolation:{escapeValue:false}});
 render(<I18nextProvider i18n={i}><Component api={api} packageId="package" personId="person" onClose={jest.fn()} {...props}/></I18nextProvider>);return i;
}
const contact={revisionId:'revision',version:2,name:'Synthetic signer',endpoints:{email:'old@example.invalid',phone:''},editable:true};
const apiForContact=()=>({contact:jest.fn().mockResolvedValue(contact),correctContact:jest.fn().mockResolvedValue({messageQueued:false})});
async function fill(i){fireEvent.change(await screen.findByRole('textbox',{name:i.t('signingV2.contact.email')}),{target:{value:'new@example.invalid'}});fireEvent.change(screen.getByRole('textbox',{name:i.t('signingV2.contact.reason')}),{target:{value:'Synthetic correction'}});await waitFor(()=>expect(screen.getByRole('button',{name:i.t('signingV2.contact.save')})).toBeEnabled());}
test.each(['he','ar','en'])('contact save only uses incumbent fields and never prepares a message in %s',async language=>{
 const api=apiForContact(),onSend=jest.fn(),i=await mount(ParticipantContactDialog,api,{canSend:true,onSend},language);await fill(i);
 expect(screen.getByRole('dialog')).toHaveAttribute('dir',language==='en'?'ltr':'rtl');
 fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.contact.save')}));await screen.findByText(i.t('signingV2.contact.saved'));
 expect(api.correctContact).toHaveBeenCalledWith('package','person',{revisionId:'revision',expectedVersion:2,reason:'Synthetic correction',endpoints:{email:'new@example.invalid'}},expect.any(String));expect(onSend).not.toHaveBeenCalled();
});
test('save and review enters send review only after durable save; it does not execute any message',async()=>{
 const api=apiForContact(),onSend=jest.fn(),i=await mount(ParticipantContactDialog,api,{canSend:true,onSend});await fill(i);fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.contact.saveAndReview')}));await waitFor(()=>expect(onSend).toHaveBeenCalledTimes(1));expect(api.correctContact).toHaveBeenCalledTimes(1);
});
test('lost save response retries the same intent and key; double click cannot duplicate save',async()=>{
 const api=apiForContact();api.correctContact.mockRejectedValueOnce({code:'REQUEST_FAILED'});const i=await mount(ParticipantContactDialog,api);await fill(i);fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.contact.save')}));await screen.findByText(i.t('signingV2.errors.REQUEST_FAILED'));const retry=screen.getByRole('button',{name:i.t('signingV2.contact.save')});fireEvent.click(retry);fireEvent.click(retry);await screen.findByText(i.t('signingV2.contact.saved'));expect(api.correctContact).toHaveBeenCalledTimes(2);expect(api.correctContact.mock.calls[1]).toEqual(api.correctContact.mock.calls[0]);
});
test('stale contact needs explicit reload and clears reason before another decision',async()=>{
 const api=apiForContact();api.correctContact.mockRejectedValueOnce({code:'VERSION_CHANGED'});const i=await mount(ParticipantContactDialog,api);await fill(i);fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.contact.save')}));await screen.findByText(i.t('signingV2.errors.VERSION_CHANGED'));expect(screen.getByRole('button',{name:i.t('signingV2.contact.save')})).toBeDisabled();api.contact.mockResolvedValueOnce({...contact,version:3,endpoints:{email:'other@example.invalid'}});fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.refresh')}));await screen.findByDisplayValue('other@example.invalid');expect(screen.getByRole('textbox',{name:i.t('signingV2.contact.reason')})).toHaveValue('');
});
test('permission removal clears sensitive contact and does not offer sending',async()=>{
 const api=apiForContact();api.correctContact.mockRejectedValueOnce({code:'FORBIDDEN'});const i=await mount(ParticipantContactDialog,api);await fill(i);expect(screen.queryByRole('button',{name:i.t('signingV2.contact.saveAndReview')})).toBeNull();fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.contact.save')}));await screen.findByText(i.t('signingV2.errors.FORBIDDEN'));expect(screen.queryByRole('textbox')).toBeNull();
});
test('renewal requires an explicit channel, previews exact documents, and confirms only once',async()=>{
 const base={recipient:{name:'Synthetic signer',participations:[]},package:{name:'Synthetic package'},tasks:[{taskId:'t1',documentId:'d1',documentName:'PDF one'},{taskId:'t2',documentId:'d2',documentName:'PDF two'}],channels:['email','sms'],documents:[],destination:null,eligible:false,reason:'CHANNEL_REQUIRED',previewHash:'initial'};
 const api={previewAction:jest.fn().mockImplementation((_p,_r,body)=>Promise.resolve({...base,...(body.channel?{eligible:true,reason:null,previewHash:'selected',destination:{channel:body.channel,masked:'n•••@example.invalid'}}:{})})),executeAction:jest.fn().mockResolvedValue({operationId:'op',items:[{state:'provider_accepted'}]})};
 const i=await mount(ParticipantActionDialog,api,{purpose:'resend',renewLink:true});await screen.findByText(i.t('signingV2.reasons.CHANNEL_REQUIRED'));expect(screen.queryByRole('button',{name:i.t('signingV2.action.renew_link.confirm')})).toBeNull();
 fireEvent.click(screen.getByRole('radio',{name:i.t('signingV2.channel.email')}));const confirm=await screen.findByRole('button',{name:i.t('signingV2.action.renew_link.confirm')});expect(screen.getByText('PDF one')).toBeTruthy();fireEvent.click(confirm);fireEvent.click(confirm);await screen.findByText(i.t('signingV2.delivery.provider_accepted'));expect(api.executeAction).toHaveBeenCalledTimes(1);expect(api.executeAction).toHaveBeenCalledWith('package','person',{purpose:'resend',renewLink:true,channel:'email',previewHash:'selected'},expect.any(String));
});
