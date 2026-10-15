import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CalendarWidget, { bucketEvents } from './CalendarWidget';
jest.mock('react-router-dom', () => ({useNavigate:()=>jest.fn()}));
jest.mock('../../../services/firmSettings', () => ({useCalendarModuleEnabled:()=>true}));
const mockT = (key, args={}) => key === 'calendar.openEventAria' ? `Open ${args.title} ${args.time}` : key;
jest.mock('react-i18next',()=>({useTranslation:()=>({t:mockT,i18n:{language:'en'}})}));
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-12T06:00Z'));});
afterEach(()=>jest.useRealTimers());
const overnight = {id:1,title:'Overnight',startTime:'2026-10-11T23:30+03:00',endTime:'2026-10-12T00:30+03:00'};
const leave={id:2,title:'Leave',eventType:'leave',ownerName:'Dana Levy',startTime:'2026-10-11T00:00+03:00',endTime:'2026-10-13T23:59+03:00'};
test('compact dashboard keeps overnight/multiday events and excludes cancelled and midnight-ended events',()=>{
 const cancelled={...overnight,id:3,eventStatus:'cancelled'};
 const ended={...overnight,id:4,endTime:'2026-10-12T00:00+03:00'};
 const buckets=bucketEvents([overnight,leave,cancelled,ended]);
 expect(buckets.today.map(e=>e.id)).toEqual([2,1]);
 expect(buckets.tomorrow.map(e=>e.id)).toEqual([2]);
});
test('compact card opens exact original appointment and keeps full long accessible title',()=>{
 const onEventPress=jest.fn(); const event={...overnight,title:'Lease '+ 'Very long title '.repeat(20), managers:[{userId:12,name:'Dana Levy'}]};
 render(<CalendarWidget events={[event]} onEventPress={onEventPress}/>);
 fireEvent.click(screen.getByRole('button',{name:/Open Lease/}));
 expect(onEventPress).toHaveBeenCalledWith(event);
 expect(screen.getByText('DL')).toBeInTheDocument();
});
