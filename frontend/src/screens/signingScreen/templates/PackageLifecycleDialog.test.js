import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import PackageLifecycleDialog from './PackageLifecycleDialog';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';
if (!window.crypto?.getRandomValues) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });
const initial={name:'Synthetic package',previewHash:'hash',eligible:true,acceptedCount:1,remainingCount:2,remainingDocuments:2,owner:{id:1,name:'Office owner'},assignments:[],eligibleUsers:[{id:2,name:'Staff member'}],assigneeIds:[]};
const apiFor=()=>({previewPackageAction:jest.fn().mockResolvedValue(initial),executePackageAction:jest.fn().mockResolvedValue({state:'cancelled'})});
async function mount(api,action='cancel',language='en',onClose=jest.fn()){
 const i=createInstance();await i.use(initReactI18next).init({resources:{he:{translation:he},ar:{translation:ar},en:{translation:en}},lng:language,fallbackLng:false,interpolation:{escapeValue:false}});
 render(<I18nextProvider i18n={i}><PackageLifecycleDialog api={api} packageId="package" action={action} onClose={onClose}/></I18nextProvider>);await screen.findByText(initial.name);return i;
}
test.each(['he','ar','en'])('new cancellation explicitly reviews retained signatures and requires a reason in %s',async language=>{
 const api=apiFor(),i=await mount(api,'cancel',language);expect(screen.getByRole('dialog')).toHaveAttribute('dir',language==='en'?'ltr':'rtl');
 expect(screen.getByText(i.t('signingV2.lifecycle.cancel.preserved',{count:1,formattedCount:new Intl.NumberFormat({he:'he-IL',ar:'ar-IL',en:'en-GB'}[language]).format(1)}))).toBeTruthy();
 const confirm=screen.getByRole('button',{name:i.t('signingV2.lifecycle.cancel.confirm')});expect(confirm).toBeDisabled();
 fireEvent.change(screen.getByRole('textbox',{name:i.t('signingV2.lifecycle.reason')}),{target:{value:'Wrong package'}});await waitFor(()=>expect(confirm).toBeEnabled());
 fireEvent.click(confirm);fireEvent.click(confirm);await screen.findByText(i.t('signingV2.lifecycle.cancel.saved'));expect(api.executePackageAction).toHaveBeenCalledTimes(1);expect(api.executePackageAction.mock.calls[0][1]).toEqual({action:'cancel',previewHash:'hash',reason:'Wrong package'});
});
test('new assignment separates selecting staff, reviewing effect, and saving without sending',async()=>{
 const api=apiFor(),i=await mount(api,'assign');fireEvent.click(screen.getByRole('checkbox',{name:'Staff member'}));
 api.previewPackageAction.mockResolvedValueOnce({...initial,assigneeIds:[2],previewHash:'selected'});fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.lifecycle.assign.review')}));
 const reason=await screen.findByRole('textbox',{name:i.t('signingV2.lifecycle.reason')});expect(api.executePackageAction).not.toHaveBeenCalled();expect(api.previewPackageAction).toHaveBeenLastCalledWith('package',{action:'assign',assigneeIds:[2]});
 fireEvent.change(reason,{target:{value:'Transfer follow-up'}});fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.lifecycle.assign.confirm')}));await screen.findByText(i.t('signingV2.lifecycle.assign.saved'));expect(api.executePackageAction.mock.calls[0][1]).toEqual({action:'assign',assigneeIds:[2],previewHash:'selected',reason:'Transfer follow-up'});
});
test('lost cancellation response retries the frozen key, not a second operation',async()=>{
 const api=apiFor();api.executePackageAction.mockRejectedValueOnce({code:'REQUEST_FAILED'});const i=await mount(api);fireEvent.change(screen.getByRole('textbox',{name:i.t('signingV2.lifecycle.reason')}),{target:{value:'Duplicate request'}});fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.lifecycle.cancel.confirm')}));await screen.findByText(i.t('signingV2.errors.REQUEST_FAILED'));
 fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.lifecycle.cancel.confirm')}));await screen.findByText(i.t('signingV2.lifecycle.cancel.saved'));expect(api.executePackageAction.mock.calls[1]).toEqual(api.executePackageAction.mock.calls[0]);
});
test('signing while the dialog is open requires a new review, never silently cancels a changed package',async()=>{
 const api=apiFor();api.executePackageAction.mockRejectedValueOnce({code:'VERSION_CHANGED'});const i=await mount(api);fireEvent.change(screen.getByRole('textbox',{name:i.t('signingV2.lifecycle.reason')}),{target:{value:'Changed package'}});fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.lifecycle.cancel.confirm')}));await screen.findByText(i.t('signingV2.errors.VERSION_CHANGED'));expect(screen.getByRole('button',{name:i.t('signingV2.lifecycle.cancel.confirm')})).toBeDisabled();
 api.previewPackageAction.mockResolvedValueOnce({...initial,eligible:false,reason:'SIGNING_ALREADY_COMPLETE',acceptedCount:3});fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.refresh')}));await screen.findByText(i.t('signingV2.errors.SIGNING_ALREADY_COMPLETE'));expect(screen.queryByRole('textbox')).toBeNull();expect(api.executePackageAction).toHaveBeenCalledTimes(1);
});
test('permission lost during confirmation hides the private package review',async()=>{
 const api=apiFor();api.executePackageAction.mockRejectedValueOnce({code:'FORBIDDEN'});const i=await mount(api);fireEvent.change(screen.getByRole('textbox',{name:i.t('signingV2.lifecycle.reason')}),{target:{value:'Reason'}});fireEvent.click(screen.getByRole('button',{name:i.t('signingV2.lifecycle.cancel.confirm')}));await screen.findByText(i.t('signingV2.errors.FORBIDDEN'));expect(screen.queryByText(initial.name)).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();
});
