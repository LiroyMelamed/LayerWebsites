'use strict';

// Provider reads bind a hosted order to its approved card transaction. Callback
// fields and ValidateNotification alone are not the card/transaction authority.
async function verifyHostedPayment(credentials, reference, expectedOrder, amount, fetcher=fetch, requireToken=false) {
    if (!reference || !expectedOrder || !Number.isFinite(amount) || amount <= 0) throw Error('PAYMENT_VERIFICATION_REQUIRED');
    const read = async (name, query) => {
        const response=await fetcher('https://api.takbull.co.il/api/ExtranalAPI/'+name+'?'+new URLSearchParams(query), {
            headers:{API_Key:credentials.apiKey,API_Secret:credentials.apiSecret},
            signal:AbortSignal.timeout(20000),redirect:'error',
        });
        if(!response.ok)throw new Error('SIGNUP_PROVIDER_UNAVAILABLE');
        return response.json();
    };
    const order=await read('GetOrder',{orderUniqId:reference});
    if(order.uniqId!==reference || order.order_reference!==expectedOrder || order.currency!=='ILS' || Number(order.orderTotalSum)!==amount || Number(order.orderStatus)!==3)
        throw new Error('SIGNUP_PAYMENT_IDENTITY_MISMATCH');
    const approved=(Array.isArray(order.transactions)?order.transactions:[]).filter(t=>t&&Number(t.status)===1);
    if(approved.length!==1||Number(approved[0].amount)!==amount||!approved[0].transactionId)throw new Error('SIGNUP_PAYMENT_IDENTITY_MISMATCH');
    const id=String(approved[0].transactionId),t=await read('GetTransaction',{transactionInternalNumber:id});
    if(String(t.transactionId)!==id||t.currency!=='ILS'||Number(t.amount)!==amount||Number(t.status)!==1||t.statusCode==null||Number(t.statusCode)!==0||Number(t.transactionType)!==10||Number(t.paymentMethod)!==3)
        throw new Error('SIGNUP_PAYMENT_IDENTITY_MISMATCH');
    const validToken = typeof t.cardToken==='string' && Boolean(t.cardToken) && t.cardToken.length<=4096;
    if (requireToken && !validToken) throw new Error('SIGNUP_PAYMENT_TOKEN_REQUIRED');
    return {transactionId:id,tokenInfo:validToken ? {token:t.cardToken,last4Digits:/^\d{4}$/.test(t.last4DigitsCardNumber||'')?t.last4DigitsCardNumber:null,
        expMonth:t.cardTokenExpirationMonth||null,expYear:t.cardTokenExpirationYear||null,cardBrand:t.cardtype||null} : null};
}
async function verifySignupPayment(credentials, reference, expectedOrder, fetcher=fetch) {
    return verifyHostedPayment(credentials, reference, expectedOrder, 1, fetcher, true);
}
async function verifyChargedTransaction(credentials,id,amount,fetcher=fetch){
    const response=await fetcher('https://api.takbull.co.il/api/ExtranalAPI/GetTransaction?'+new URLSearchParams({transactionInternalNumber:id}),{
        headers:{API_Key:credentials.apiKey,API_Secret:credentials.apiSecret},signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!response.ok)throw Error('RENEWAL_PROVIDER_UNAVAILABLE');
    const t=await response.json();
    if(String(t.transactionId)!==String(id)||t.currency!=='ILS'||Number(t.amount)!==amount||Number(t.status)!==1||t.statusCode==null||Number(t.statusCode)!==0||Number(t.transactionType)!==10||Number(t.paymentMethod)!==3)
        throw Error('RENEWAL_PAYMENT_IDENTITY_MISMATCH');
    return true;
}
module.exports={verifySignupPayment,verifyChargedTransaction,verifyHostedPayment};
