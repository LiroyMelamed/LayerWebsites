import React from 'react';
import {act,render,screen,waitFor} from '@testing-library/react';
import {BillingLockProvider,useBillingLock} from './BillingLockProvider';
import billingApi from '../api/billingApi';
jest.mock('../api/billingApi',()=>({getLockStatus:jest.fn()}));
function State(){const s=useBillingLock();return <div data-testid="state">{JSON.stringify({locked:s.locked,owner:s.canManageBilling,url:s.payUrl})}</div>;}
const value=()=>JSON.parse(screen.getByTestId('state').textContent);
beforeEach(()=>{localStorage.clear();localStorage.setItem('token','synthetic-local-only');billingApi.getLockStatus.mockReset();});

test('customer never inherits a locally claimed owner flag or private recovery details',async()=>{
 localStorage.setItem('isPlatformAdmin','true');
 billingApi.getLockStatus.mockResolvedValue({success:true,data:{locked:true,canManageBilling:false,payUrl:'/private',status:'past_due'}});
 render(<BillingLockProvider><State/></BillingLockProvider>);
 await waitFor(()=>expect(value()).toEqual({locked:true,owner:false,url:null}));
});

test('operational failures keep verified owner recovery available and deduplicate refresh',async()=>{
 billingApi.getLockStatus.mockResolvedValueOnce({success:true,data:{locked:true,canManageBilling:true,payUrl:'/AdminStack/PlanUsage'}});
 render(<BillingLockProvider><State/></BillingLockProvider>);
 await waitFor(()=>expect(value().owner).toBe(true));
 let resolve;billingApi.getLockStatus.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 act(()=>{for(let i=0;i<8;i++)window.dispatchEvent(new Event('lw-billing-locked'));});
 expect(value().owner).toBe(true);expect(billingApi.getLockStatus).toHaveBeenCalledTimes(2);
 await act(async()=>resolve({success:true,data:{locked:true,canManageBilling:true,payUrl:'/AdminStack/PlanUsage'}}));
 expect(value().owner).toBe(true);
});

test('a failed lock-status request cannot recursively flood the API',async()=>{
 billingApi.getLockStatus.mockImplementation(async()=>{window.dispatchEvent(new Event('lw-billing-locked'));return {success:false,status:503};});
 render(<BillingLockProvider><State/></BillingLockProvider>);
 await act(async()=>{window.dispatchEvent(new Event('lw-billing-locked'));});
 expect(billingApi.getLockStatus.mock.calls.length).toBeLessThanOrEqual(2);
 expect(value().owner).toBe(false);
});
