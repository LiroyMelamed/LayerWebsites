import React from 'react';
import {act,render,screen,waitFor} from '@testing-library/react';
import {FirmPermissionsProvider,useFirmPermissions} from '../providers/FirmPermissionsProvider';
import {staffRolesApi} from '../api/staffRolesApi';
jest.mock('../api/staffRolesApi',()=>({staffRolesApi:{getSessionScope:jest.fn()}}));
function Probe(){const p=useFirmPermissions();return <div>{p.loaded ? (p.scope?.permissionMode || 'none') : 'loading'}</div>;}
afterEach(()=>localStorage.clear());
test('auth change invalidates cached permissions and ignores the old user response',async()=>{
 let oldDone,newDone;staffRolesApi.getSessionScope.mockImplementationOnce(()=>new Promise(r=>oldDone=r)).mockImplementationOnce(()=>new Promise(r=>newDone=r));
 localStorage.setItem('token','old-synthetic');render(<FirmPermissionsProvider><Probe/></FirmPermissionsProvider>);
 localStorage.setItem('token','new-synthetic');act(()=>window.dispatchEvent(new Event('lw-auth-changed')));
 await act(async()=>newDone({permissionMode:'role',pages:['main']}));
 await waitFor(()=>expect(screen.getByText('role')).toBeTruthy());
 await act(async()=>oldDone({permissionMode:'platform_admin'}));
 expect(screen.getByText('role')).toBeTruthy();
 act(()=>{localStorage.removeItem('token');window.dispatchEvent(new Event('lw-auth-changed'));});
 await waitFor(()=>expect(screen.getByText('none')).toBeTruthy());
});
