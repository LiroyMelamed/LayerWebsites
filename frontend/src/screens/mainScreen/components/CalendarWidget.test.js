import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import CalendarWidget, { bucketEvents } from './CalendarWidget';
const mockNavigate = jest.fn();
let mockCalendarEnabled = true;
jest.mock('react-router-dom', () => ({useNavigate:()=>mockNavigate}));
jest.mock('../../../services/firmSettings', () => ({useCalendarModuleEnabled:()=>mockCalendarEnabled}));
const mockT = (key, args={}) => key === 'calendar.openEventAria' ? `Open ${args.title} ${args.time}` : key;
jest.mock('react-i18next',()=>({useTranslation:()=>({t:mockT,i18n:{language:'en'}})}));
beforeEach(()=>{mockCalendarEnabled=true;mockNavigate.mockClear();jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-12T06:00Z'));});
afterEach(()=>jest.useRealTimers());
const overnight = {id:1,title:'Overnight',startTime:'2026-10-11T23:30+03:00',endTime:'2026-10-12T00:30+03:00'};
const leave={id:2,title:'Leave',eventType:'leave',ownerName:'Dana Levy',startTime:'2026-10-11T00:00+03:00',endTime:'2026-10-13T23:59+03:00'};

test('empty calendar remains visible with its open-calendar action',()=>{
 render(<CalendarWidget events={[]} isPerforming={false}/>);
 expect(screen.getByText('calendar.widgetTitle')).toBeInTheDocument();
 expect(screen.getByText('calendar.widgetEmpty')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'managerHome.actions.openCalendar'}));
 expect(mockNavigate).toHaveBeenCalledWith('/AdminStack/CalendarScreen');
});

test('empty calendar still respects the office module setting',()=>{
 mockCalendarEnabled=false;
 const {container}=render(<CalendarWidget events={[]} isPerforming={false}/>);
 expect(container).toBeEmptyDOMElement();
});
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

test('today introduction runs once per authenticated user per day and respects reduced motion',()=>{
 localStorage.clear(); window.matchMedia=jest.fn(()=>({matches:false}));
 localStorage.setItem('token',`x.${btoa(JSON.stringify({userid:42}))}.x`);
 const first=render(<CalendarWidget events={[overnight]}/>);
 expect(first.container.querySelector('.lw-calendarWidget--intro')).toBeInTheDocument();
 act(()=>jest.advanceTimersByTime(800));expect(first.container.querySelector('.lw-calendarWidget--intro')).toBeNull();first.unmount();
 const second=render(<CalendarWidget events={[overnight]}/>);expect(second.container.querySelector('.lw-calendarWidget--intro')).toBeNull();second.unmount();
 localStorage.setItem('token',`x.${btoa(JSON.stringify({userid:43}))}.x`);window.matchMedia.mockReturnValue({matches:true});
 const reduced=render(<CalendarWidget events={[overnight]}/>);expect(reduced.container.querySelector('.lw-calendarWidget--intro')).toBeNull();
 localStorage.clear();
});
