import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EventFormModal from './EventFormModal';
import calendarApi from '../../../api/calendarApi';

jest.mock('react-i18next', () => ({...jest.requireActual('react-i18next'),useTranslation:()=>({t:key=>key,i18n:{language:'he'}})}));
jest.mock('../../../hooks/useAutoHttpRequest', () => () => ({result:[],performRequest:jest.fn()}));
jest.mock('../../../components/styledComponents/cases/CaseFullView', () => () => null);
jest.mock('../../../api/calendarApi', () => ({__esModule:true,default:{resendInvite:jest.fn(),checkConflict:jest.fn(async()=>({success:true,data:{conflicts:[]}})),getClientCases:jest.fn(async()=>({success:true,data:{cases:[]}}))}}));
jest.mock('../../../api/platformSettingsApi', () => ({__esModule:true,default:{getSettings:jest.fn(async()=>({success:true,data:{}}))}}));
jest.mock('../../../api/remindersApi', () => ({__esModule:true,default:{getTemplates:jest.fn(async()=>({success:true,data:{templates:[]}}))}}));
jest.mock('../../../services/firmSettings', () => ({getFirmName:()=> 'QA'}));
jest.mock('../../../components/ui/toast', () => ({toastError:jest.fn(),toastSuccess:jest.fn(),toastWarning:jest.fn()}));

const event={id:212,eventType:'appointment',title:'Original',officeNotes:'Existing note',startTime:'2026-11-17T08:00:00Z',endTime:'2026-11-17T09:00:00Z',leadName:'Synthetic',leadEmail:'qa@example.invalid',inviteStatus:'none',invitationDelivery:{status:'unsent',channels:[]},clients:[],managers:[],lawyerReminderOffsets:[],clientReminderOffsets:[]};

test('first send updates the open popup without parent prop changes and preserves unsaved notes', async()=>{
 const onUpdated=jest.fn();
 calendarApi.resendInvite.mockResolvedValueOnce({success:true,data:{event:{...event,inviteStatus:'pending',invitationDelivery:{status:'deferred',channels:[]}},deferred:true,deferredUntil:'2026-11-17T07:00:00Z'}});
 render(<EventFormModal event={event} onUpdated={onUpdated}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'calendar.officeNotes'}),{target:{value:'Unsaved draft'}});
 fireEvent.click(screen.getByRole('button',{name:'calendar.inviteSend'}));
 expect(await screen.findByText('calendar.inviteDelivery.deferred')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'calendar.inviteResend'})).toBeEnabled();
 expect(screen.getByRole('textbox',{name:'calendar.officeNotes'})).toHaveValue('Unsaved draft');
 await waitFor(()=>expect(onUpdated).toHaveBeenCalledTimes(1));
});


test('a duplicated draft preserves explicitly empty reminders and its chosen channels', async()=>{
 render(<EventFormModal event={{...event,id:undefined,reminderChannels:{push:false,sms:false,email:true},reminderTargets:{client:false,managers:false}}}/>);
 expect(screen.getAllByRole('button',{name:'calendar.reminder30m'}).every(button=>button.getAttribute('aria-pressed')!=='true')).toBe(true);
 expect(screen.getAllByText('calendar.eventRemindersNone')).toHaveLength(2);
});
