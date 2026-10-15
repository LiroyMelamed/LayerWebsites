import React from 'react';
import {act,render,screen,waitFor} from '@testing-library/react';
import axios from 'axios';
import {FirmPermissionsProvider,useFirmPermissions} from '../providers/FirmPermissionsProvider';
import '../api/apiUtils';

jest.mock('../i18n/i18n',()=>({__esModule:true,default:{t:key=>key}}));
jest.mock('../lib/tenantSlug',()=>({getActiveTenantSlug:()=>null}));
jest.mock('axios',()=>{
 const instance={interceptors:{request:{use:jest.fn()},response:{use:jest.fn()}},get:jest.fn()};
 const fn=jest.fn();fn.create=jest.fn(()=>instance);fn.post=jest.fn();fn.instance=instance;return {__esModule:true,default:fn};
});
const rejectResponse=axios.instance.interceptors.response.use.mock.calls.at(-1)[1];
function Probe(){const p=useFirmPermissions();return <div>{!p.loaded?'loading':p.error?'recoverable error':p.scope?.permissionMode||'none'}<button onClick={p.refresh}>retry</button></div>;}
const locationBefore=window.location;
beforeEach(()=>{
 localStorage.clear();localStorage.setItem('token','old-synthetic');localStorage.setItem('refreshToken','refresh-synthetic');
 delete window.location;window.location={pathname:'/AdminStack/MainScreen',href:'/AdminStack/MainScreen'};
 axios.mockReset();axios.post.mockReset();axios.instance.get.mockReset();
});
afterEach(()=>{localStorage.clear();delete window.location;window.location=locationBefore;});
test('a real silent token rotation restarts the initial scope request and exits the loader',async()=>{
 let firstDone;axios.instance.get.mockImplementationOnce(()=>new Promise(r=>firstDone=r)).mockResolvedValue({success:true,data:{permissionMode:'role',pages:['main']}});
 render(<FirmPermissionsProvider><Probe/></FirmPermissionsProvider>);
 expect(screen.getByText('loading')).toBeTruthy();
 axios.post.mockResolvedValue({status:200,data:{token:'rotated-synthetic',refreshToken:'rotated-refresh'}});
 axios.mockResolvedValue({status:200,data:{permissionMode:'legacy'},config:{url:'staff/session-scope'}});
 await act(async()=>{await rejectResponse({response:{status:401},config:{url:'staff/session-scope',headers:{Authorization:'Bearer old-synthetic'}}});});
 await waitFor(()=>expect(screen.getByText('role')).toBeTruthy());
 await act(async()=>firstDone({success:true,data:{permissionMode:'platform_admin'}}));
 expect(screen.getByText('role')).toBeTruthy();expect(axios.instance.get).toHaveBeenCalledTimes(2);
 expect(axios.post.mock.calls[0][2].timeout).toBe(15000);
});
test('late concurrent 401 uses the already rotated token without refreshing again',async()=>{
 localStorage.setItem('token','current-synthetic');axios.mockResolvedValue({status:200,data:{locked:false},config:{url:'billing/lock-status'}});
 const result=await rejectResponse({response:{status:401},config:{url:'billing/lock-status',headers:{Authorization:'Bearer old-synthetic'}}});
 expect(result.success).toBe(true);expect(axios.post).not.toHaveBeenCalled();
 expect(axios.mock.calls[0][0].headers.Authorization).toBe('Bearer current-synthetic');
});
test('an in-flight refresh cannot resurrect a logged out account or overwrite a new login',async()=>{
 let finish;axios.post.mockImplementation(()=>new Promise(r=>finish=r));
 const pending=rejectResponse({response:{status:401},config:{url:'staff/session-scope',headers:{Authorization:'Bearer old-synthetic'}}});
 localStorage.setItem('token','new-login-synthetic');localStorage.setItem('refreshToken','new-login-refresh');
 finish({status:200,data:{token:'stale-refreshed',refreshToken:'stale-refresh'}});await pending;
 expect(localStorage.getItem('token')).toBe('new-login-synthetic');expect(window.location.href).toBe('/AdminStack/MainScreen');
});
test('scope failure settles loading as a recoverable error; retry clears it',async()=>{
 axios.instance.get.mockResolvedValueOnce({success:false,status:503,message:'Synthetic outage'}).mockResolvedValueOnce({success:true,data:{permissionMode:'role'}});
 render(<FirmPermissionsProvider><Probe/></FirmPermissionsProvider>);
 await screen.findByText('recoverable error');
 await act(async()=>screen.getByRole('button',{name:'retry'}).click());await screen.findByText('role');
});
