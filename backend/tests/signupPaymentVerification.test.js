const test=require('node:test'),assert=require('node:assert/strict');
const {verifySignupPayment,verifyChargedTransaction}=require('../lib/payments/verifySignupPayment');
const {addIsraelCalendarMonths}=require('../lib/billing/calendarMonths');
const credentials={apiKey:'synthetic',apiSecret:'synthetic'};
const order={uniqId:'order-id',order_reference:'signup-intent',currency:'ILS',orderTotalSum:1,orderStatus:3,transactions:[{transactionId:'transaction-id',status:1,amount:1}]};
const transaction={transactionId:'transaction-id',amount:1,currency:'ILS',status:1,statusCode:0,transactionType:10,paymentMethod:3,cardToken:'synthetic-card-token',last4DigitsCardNumber:'1234'};
const provider=(changes={})=>async url=>new Response(JSON.stringify(url.includes('/GetOrder')?{...order,...changes.order}:{...transaction,...changes.transaction}),{status:200,headers:{'Content-Type':'application/json'}});
test('signup uses authenticated order and card transaction, not callback amount/token',async()=>{
 const r=await verifySignupPayment(credentials,'order-id','signup-intent',provider());assert.equal(r.transactionId,'transaction-id');assert.equal(r.tokenInfo.token,'synthetic-card-token');
});
test('signup rejects foreign, missing, wrong amount/currency/type and missing token evidence',async()=>{
 for(const patch of [{order:{uniqId:'foreign'}},{order:{order_reference:'foreign'}},{order:{currency:'USD'}},{order:{orderTotalSum:2}},{order:{orderStatus:2}},{order:{transactions:[]}},{transaction:{transactionId:'foreign'}},{transaction:{amount:2}},{transaction:{currency:'USD'}},{transaction:{status:0}},{transaction:{statusCode:null}},{transaction:{transactionType:20}},{transaction:{paymentMethod:2}},{transaction:{cardToken:null}}])await assert.rejects(verifySignupPayment(credentials,'order-id','signup-intent',provider(patch)));
});
test('saved-token renewal requires exact independently read transaction evidence',async()=>{
 assert.equal(await verifyChargedTransaction(credentials,'transaction-id',1,provider()),true);
 for(const patch of [{amount:2},{currency:null},{statusCode:null},{transactionId:'foreign'},{paymentMethod:2}])await assert.rejects(verifyChargedTransaction(credentials,'transaction-id',1,provider({transaction:patch})));
});
test('three calendar months use Israel local time and clamp month ends through DST',()=>{
 for(const [from,to] of [['2026-01-31T10:15:00Z','2026-04-30T09:15:00Z'],['2026-10-11T21:52:26Z','2027-01-11T22:52:26Z'],['2023-11-30T10:15:00Z','2024-02-29T10:15:00Z']])assert.equal(addIsraelCalendarMonths(new Date(from),3).toISOString(),new Date(to).toISOString());
});
