import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { BillingLockProvider,useBillingLock } from '../providers/BillingLockProvider';
import billingApi from '../api/billingApi';
jest.mock('../api/billingApi',()=>({__esModule:true,default:{getLockStatus:jest.fn()}}));
function Probe(){const lock=useBillingLock();return <div>{!lock.loaded?'loading':lock.locked?'locked':'open'}</div>;}
afterEach(()=>localStorage.clear());
test('billing reloads on token rotation and ignores a stale lock from the previous account',async()=>{
    let first;billingApi.getLockStatus.mockImplementationOnce(()=>new Promise(r=>first=r)).mockResolvedValue({success:true,data:{locked:false}});
    localStorage.setItem('token','old');render(<BillingLockProvider><Probe/></BillingLockProvider>);
    localStorage.setItem('token','current');act(()=>window.dispatchEvent(new Event('lw-auth-changed')));
    await screen.findByText('open');await act(async()=>first({success:true,data:{locked:true}}));
    expect(screen.getByText('open')).toBeInTheDocument();expect(billingApi.getLockStatus).toHaveBeenCalledTimes(2);
});
test('logout settles billing loading without carrying the former account lock',async()=>{
    billingApi.getLockStatus.mockResolvedValue({success:true,data:{locked:true}});
    localStorage.setItem('token','old');render(<BillingLockProvider><Probe/></BillingLockProvider>);
    await screen.findByText('locked');localStorage.clear();act(()=>window.dispatchEvent(new Event('lw-auth-changed')));
    await screen.findByText('open');
});
