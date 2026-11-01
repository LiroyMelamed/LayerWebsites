const { assertBillingOperationsEnabled } = require('../billing/billingOperations');
/**
 * Takbull External API client (sandbox + production share the same host).
 * Ported from Melamotion for LayerWebsites firm billing.
 * Docs: https://api.takbull.co.il/ApiDocs
 */

const TAKBULL_API_BASE = 'https://api.takbull.co.il';
const TAKBULL_PAYMENT_GATEWAY = `${TAKBULL_API_BASE}/PaymentGateway`;

function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireCreds(credentials) {
    const apiKey = typeof credentials?.apiKey === 'string' ? credentials.apiKey.trim() : '';
    const apiSecret = typeof credentials?.apiSecret === 'string' ? credentials.apiSecret.trim() : '';
    if (!apiKey || !apiSecret) {
        throw new Error('Takbull credentials require apiKey and apiSecret.');
    }
    return { apiKey, apiSecret };
}

function authHeaders(creds) {
    return {
        'Content-Type': 'application/json',
        API_Key: creds.apiKey,
        API_Secret: creds.apiSecret,
    };
}

function pickStringField(record, keys) {
    for (const key of keys) {
        const v = record[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    return null;
}

// Ask Takbull to create the payment document as part of the single payment
// operation. Never issue a second DocumentApi/Create request after a timeout:
// that endpoint has no documented idempotency contract. The merchant's existing
// document/tax/email settings remain authoritative unless explicitly overridden.
function paymentDocumentOptions(input) {
    const createDocument = input.createDocument !== false;
    if (!createDocument) return { CreateDocument: false };
    const configuredType = input.documentType ?? process.env.TAKBULL_DOCUMENT_TYPE;
    if (configuredType == null || String(configuredType).trim() === '') return { CreateDocument: true };
    const documentType = Number(configuredType);
    if (![320, 400].includes(documentType)) {
        throw new Error('TAKBULL_DOCUMENT_TYPE must be 320 (tax invoice/receipt) or 400 (receipt).');
    }
    return { CreateDocument: true, DocumentType: documentType };
}

function applyCustomer(body, input) {
    if (!input.customerFullName && !input.customerPhone && !input.customerEmail && !input.customerAddress) return;
    body.CustomerFullName = input.customerFullName || undefined;
    body.CustomerPhoneNumber = input.customerPhone || undefined;
    const address = asRecord(input.customerAddress);
    body.Customer = {
        CustomerFullName: input.customerFullName || undefined,
        PhoneNumber: input.customerPhone || undefined,
        Email: input.customerEmail || undefined,
        ...(input.customerAddress ? { Address: {
            Address1: address.address1 || undefined,
            Address2: address.address2 || undefined,
            City: address.city || undefined,
            Country: address.country || undefined,
            Zip: address.zip || undefined,
        } } : {}),
    };
}

function extractTakbullDocument(raw) {
    const rec = asRecord(raw);
    const id = pickStringField(rec, ['documentId', 'DocumentId', 'invoiceId', 'InvoiceId']);
    const uniqId = pickStringField(rec, ['invoiceUniqId', 'InvoiceUniqId', 'documentUniqId', 'DocumentUniqId']);
    const number = pickStringField(rec, ['documentNumber', 'DocumentNumber']);
    const hasReference = Boolean((id && id !== '0') || uniqId || (number && number !== '0'));
    return {
        created: rec.isDocumentCreated === true || hasReference ? true : (rec.isDocumentCreated === false ? false : null),
        id: id && id !== '0' ? id : null,
        uniqId,
        number: number && number !== '0' ? number : null,
        // A document reference is not an email delivery acknowledgment.
        deliveryStatus: 'unknown',
    };
}

function requirePositiveAmount(input) {
    if (!Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) {
        throw new Error('Takbull payment amount must be positive.');
    }
}

async function isConfirmedFailedTransaction(input, transactionId) {
    assertBillingOperationsEnabled();
    if (!transactionId) return false;
    try {
        const response = await fetch(`${TAKBULL_API_BASE}/api/ExtranalAPI/GetTransaction?${new URLSearchParams({ transactionInternalNumber: transactionId })}`, {
            headers: authHeaders(requireCreds(input.credentials)),
            signal: AbortSignal.timeout(20000),
            redirect: 'error',
        });
        if (!response.ok) return false;
        const t = asRecord(await response.json());
        // A failed document request can follow an approved charge. Only the
        // matching terminal card transaction can permit a new payment attempt.
        return String(t.transactionId) === transactionId
            && t.currency === input.currency.toUpperCase()
            && Number(t.amount) === Number(input.amount)
            && Number(t.transactionType) === 10 && Number(t.paymentMethod) === 3
            && [2, 6].includes(Number(t.status))
            && t.statusCode != null && String(t.statusCode).trim() !== ''
            && Number.isFinite(Number(t.statusCode)) && Number(t.statusCode) !== 0;
    } catch (_) {
        return false;
    }
}

function paymentGatewayUrl(uniqId) {
    return `${TAKBULL_PAYMENT_GATEWAY}?orderUniqId=${encodeURIComponent(uniqId)}`;
}

function isTakbullPaymentPaid(validated) {
    if (!validated?.ok) return false;
    if (validated.transactionStatusCode === 0) return true;
    if (validated.orderStatus === 3) return true;
    const statusRaw = validated.raw?.Status ?? validated.raw?.status;
    if (typeof statusRaw === 'string' && statusRaw.trim().toLowerCase() === 'approved') return true;
    const tx = asRecord(validated.raw?.transaction);
    const txStatus = tx.status ?? tx.Status;
    if (txStatus === 1 || txStatus === '1') return true;
    return false;
}

function extractTokenFromValidated(raw) {
    const rec = asRecord(raw);
    const creditCard = asRecord(rec.CreditCard ?? rec.creditCard);
    const token =
        pickStringField(rec, ['token', 'Token', 'cardToken', 'CardToken']) ||
        pickStringField(creditCard, ['CardExternalToken', 'cardExternalToken', 'token', 'Token']);
    if (!token) return null;

    const last4Digits =
        pickStringField(rec, ['last4Digits', 'Last4Digits', 'last4DigitsCardNumber']) ||
        pickStringField(creditCard, ['Last4Digits', 'last4Digits']);
    const expMonth =
        pickStringField(rec, ['TokenExpirationMonth', 'tokenExpirationMonth', 'cardTokenExpirationMonth']) ||
        pickStringField(creditCard, ['CardTokenExpirationMonth', 'cardTokenExpirationMonth']);
    const expYear =
        pickStringField(rec, ['TokenExpirationYear', 'tokenExpirationYear', 'cardTokenExpirationYear']) ||
        pickStringField(creditCard, ['CardTokenExpirationYear', 'cardTokenExpirationYear']);
    const cardBrand =
        pickStringField(rec, ['cardtype', 'cardType', 'CardType', 'cardBrand']) ||
        pickStringField(creditCard, ['cardtype', 'CardType']);

    return {
        token,
        last4Digits: last4Digits ? last4Digits.slice(-4) : null,
        expMonth,
        expYear,
        cardBrand,
    };
}

async function createTakbullPaymentPage(input) {
    assertBillingOperationsEnabled();
    requirePositiveAmount(input);
    const body = {
        order_reference: input.orderReference,
        OrderTotalSum: input.amount,
        Currency: input.currency.toUpperCase() === 'ILS' ? 'ILS' : input.currency.toUpperCase(),
        Language: 'he',
        DealType: 1,
        PaymentMethodType: 3,
        DisplayType: input.returnMode === 'redirect' ? 'redirect' : 'iframe',
        PostProcessMethod: input.returnMode === 'redirect' ? '0' : '1',
        ...paymentDocumentOptions(input),
        SaveToken: input.saveToken !== false,
        RedirectAddress: input.redirectAddress,
        CancelReturnAddress: input.cancelReturnAddress,
        IPNAddress: input.ipnAddress,
    };

    if (input.purpose || body.CreateDocument) {
        body.Products = [
            {
                SKU: String(input.orderReference).slice(0, 40),
                ProductName: input.purpose || 'תשלום מנוי',
                Description: input.purpose || 'תשלום מנוי',
                Price: input.amount,
                Quantity: 1,
                CurrencyCode: body.Currency,
            },
        ];
    }

    applyCustomer(body, input);

    const res = await fetch(`${TAKBULL_API_BASE}/api/ExtranalAPI/GetTakbullPaymentPageRedirectUrl`, {
        method: 'POST',
        headers: authHeaders(requireCreds(input.credentials)),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
    });

    const raw = asRecord(await res.json().catch(() => ({})));
    if (!res.ok) {
        throw new Error(
            `Takbull create payment page failed (${res.status}): ${
                typeof raw.description === 'string' ? raw.description : res.statusText
            }`
        );
    }

    const uniqId = typeof raw.uniqId === 'string' ? raw.uniqId : '';
    if (raw.responseCode !== 0 || !uniqId) {
        const description =
            typeof raw.description === 'string'
                ? raw.description
                : typeof raw.internalDescription === 'string'
                    ? raw.internalDescription
                    : 'Unknown Takbull error';
        throw new Error(`Takbull create payment page rejected: ${description}`);
    }

    return { uniqId, redirectUrl: paymentGatewayUrl(uniqId), raw };
}

async function validateTakbullNotification(credentials, uniqId) {
    assertBillingOperationsEnabled();
    const creds = requireCreds(credentials);
    const res = await fetch(`${TAKBULL_API_BASE}/api/ExtranalAPI/ValidateNotification`, {
        method: 'POST',
        headers: authHeaders(creds),
        body: JSON.stringify({ uniqId }),
    });

    const raw = asRecord(await res.json().catch(() => ({})));
    if (!res.ok) {
        return { ok: false, paid: false, internalDescription: `HTTP ${res.status}`, raw };
    }

    const internalCode =
        typeof raw.internalCode === 'number'
            ? raw.internalCode
            : typeof raw.InternalCode === 'number'
                ? raw.InternalCode
                : undefined;
    const internalDescription =
        typeof raw.internalDescription === 'string'
            ? raw.internalDescription
            : typeof raw.InternalDescription === 'string'
                ? raw.InternalDescription
                : undefined;
    const transactionStatus =
        typeof raw.tranSactionStatus === 'number'
            ? raw.tranSactionStatus
            : typeof raw.transactionStatus === 'number'
                ? raw.transactionStatus
                : undefined;
    const orderStatus = typeof raw.orderStatus === 'number' ? raw.orderStatus : undefined;
    const amount = typeof raw.amount === 'number' ? raw.amount : undefined;
    const tx = asRecord(raw.transaction);
    const transactionStatusCodeRaw = tx.statusCode ?? tx.StatusCode;
    const transactionStatusCode =
        typeof transactionStatusCodeRaw === 'number'
            ? transactionStatusCodeRaw
            : typeof transactionStatusCodeRaw === 'string' && transactionStatusCodeRaw.trim() !== ''
                ? Number(transactionStatusCodeRaw)
                : undefined;

    const ok =
        internalCode === 0 ||
        (typeof internalDescription === 'string' && ['OK', 'VERIFIED'].includes(internalDescription.toUpperCase()));

    const result = {
        ok,
        paid: false,
        amount,
        orderStatus,
        transactionStatus,
        transactionStatusCode: Number.isFinite(transactionStatusCode) ? transactionStatusCode : undefined,
        internalCode,
        internalDescription,
        raw,
        document: extractTakbullDocument(raw),
    };
    result.paid = isTakbullPaymentPaid(result);

    const extracted = extractTokenFromValidated(raw);
    if (extracted) {
        result.token = extracted.token;
        result.last4Digits = extracted.last4Digits;
        result.expMonth = extracted.expMonth;
        result.expYear = extracted.expYear;
        result.cardBrand = extracted.cardBrand;
    }

    return result;
}

async function chargeTakbullToken(input) {
    assertBillingOperationsEnabled();
    requirePositiveAmount(input);
    const currency = input.currency.toUpperCase() === 'ILS' ? 'ILS' : input.currency.toUpperCase();
    const body = {
        order_reference: input.orderReference,
        OrderTotalSum: input.amount,
        Currency: currency,
        Language: 'he',
        DealType: 1,
        PaymentMethodType: 3,
        ...paymentDocumentOptions(input),
        SaveToken: false,
        MaxNumberOfPayments: 1,
        IPNAddress: input.ipnAddress,
        RedirectAddress: input.redirectAddress || input.ipnAddress,
        CancelReturnAddress: input.cancelReturnAddress || input.ipnAddress,
        CreditCard: { CardExternalToken: input.cardExternalToken },
    };

    if (input.purpose || body.CreateDocument) {
        body.Products = [
            {
                SKU: String(input.orderReference).slice(0, 40),
                ProductName: input.purpose || 'תשלום מנוי',
                Description: input.purpose || 'תשלום מנוי',
                Price: input.amount,
                Quantity: 1,
                CurrencyCode: currency,
            },
        ];
    }

    applyCustomer(body, input);

    const res = await fetch(`${TAKBULL_API_BASE}/api/ExtranalAPI/ChargeToken`, {
        method: 'POST',
        headers: authHeaders(requireCreds(input.credentials)),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
    });

    const raw = asRecord(await res.json().catch(() => ({})));
    const internalCode =
        typeof raw.internalCode === 'number'
            ? raw.internalCode
            : typeof raw.InternalCode === 'number'
                ? raw.InternalCode
                : null;
    const internalDescription =
        typeof raw.internalDescription === 'string'
            ? raw.internalDescription
            : typeof raw.InternalDescription === 'string'
                ? raw.InternalDescription
                : null;
    const transactionInternalNumber =
        pickStringField(raw, ['transactionInternalNumber', 'TransactionInternalNumber', 'transactionInternalId', 'TransactionInternalId']) ||
        null;
    const orderStatus = typeof raw.orderStatus === 'number' ? raw.orderStatus : null;

    const ok = res.ok && internalCode === 0;
    const definitiveFailure = !ok && await isConfirmedFailedTransaction(input, transactionInternalNumber);
    return {
        ok,
        definitiveFailure,
        internalCode,
        internalDescription,
        transactionInternalNumber,
        orderStatus,
        raw,
        documentRequested: body.CreateDocument,
        document: extractTakbullDocument(raw),
        token: extractTokenFromValidated(raw),
    };
}

const {
    getTakbullCredentialsFromEnv,
    getTakbullMode,
    resolveSetupAmountIls,
} = require('./takbullCredentials');

module.exports = {
    TAKBULL_API_BASE,
    TAKBULL_PAYMENT_GATEWAY,
    paymentGatewayUrl,
    isTakbullPaymentPaid,
    extractTokenFromValidated,
    extractTakbullDocument,
    createTakbullPaymentPage,
    validateTakbullNotification,
    chargeTakbullToken,
    getTakbullCredentialsFromEnv,
    getTakbullMode,
    resolveSetupAmountIls,
    requireCreds,
};
