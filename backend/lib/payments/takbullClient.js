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
    const body = {
        order_reference: input.orderReference,
        OrderTotalSum: input.amount,
        Currency: input.currency.toUpperCase() === 'ILS' ? 'ILS' : input.currency.toUpperCase(),
        Language: 'he',
        DealType: 1,
        PaymentMethodType: 3,
        DisplayType: 'iframe',
        PostProcessMethod: '1',
        CreateDocument: false,
        SaveToken: input.saveToken !== false,
        RedirectAddress: input.redirectAddress,
        CancelReturnAddress: input.cancelReturnAddress,
        IPNAddress: input.ipnAddress,
    };

    if (input.purpose) {
        body.Products = [
            {
                SKU: String(input.orderReference).slice(0, 40),
                ProductName: input.purpose,
                Description: input.purpose,
                Price: input.amount,
                Quantity: 1,
                CurrencyCode: body.Currency,
            },
        ];
    }

    if (input.customerFullName || input.customerPhone || input.customerEmail) {
        body.CustomerFullName = input.customerFullName || undefined;
        body.CustomerPhoneNumber = input.customerPhone || undefined;
        body.Customer = {
            CustomerFullName: input.customerFullName || undefined,
            PhoneNumber: input.customerPhone || undefined,
            Email: input.customerEmail || undefined,
        };
    }

    const res = await fetch(`${TAKBULL_API_BASE}/api/ExtranalAPI/GetTakbullPaymentPageRedirectUrl`, {
        method: 'POST',
        headers: authHeaders(input.credentials),
        body: JSON.stringify(body),
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
    const currency = input.currency.toUpperCase() === 'ILS' ? 'ILS' : input.currency.toUpperCase();
    const body = {
        order_reference: input.orderReference,
        OrderTotalSum: input.amount,
        Currency: currency,
        Language: 'he',
        DealType: 1,
        PaymentMethodType: 3,
        CreateDocument: false,
        SaveToken: false,
        MaxNumberOfPayments: 1,
        IPNAddress: input.ipnAddress,
        RedirectAddress: input.redirectAddress || input.ipnAddress,
        CancelReturnAddress: input.cancelReturnAddress || input.ipnAddress,
        CreditCard: { CardExternalToken: input.cardExternalToken },
    };

    if (input.purpose) {
        body.Products = [
            {
                SKU: String(input.orderReference).slice(0, 40),
                ProductName: input.purpose,
                Description: input.purpose,
                Price: input.amount,
                Quantity: 1,
                CurrencyCode: currency,
            },
        ];
    }

    if (input.customerFullName || input.customerPhone || input.customerEmail) {
        body.CustomerFullName = input.customerFullName || undefined;
        body.CustomerPhoneNumber = input.customerPhone || undefined;
        body.Customer = {
            CustomerFullName: input.customerFullName || undefined,
            PhoneNumber: input.customerPhone || undefined,
            Email: input.customerEmail || undefined,
        };
    }

    const res = await fetch(`${TAKBULL_API_BASE}/api/ExtranalAPI/ChargeToken`, {
        method: 'POST',
        headers: authHeaders(input.credentials),
        body: JSON.stringify(body),
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
        pickStringField(raw, ['transactionInternalNumber', 'TransactionInternalNumber', 'transactionInternalId']) ||
        null;
    const orderStatus = typeof raw.orderStatus === 'number' ? raw.orderStatus : null;

    return {
        ok: res.ok && internalCode === 0,
        internalCode,
        internalDescription,
        transactionInternalNumber,
        orderStatus,
        raw,
        token: extractTokenFromValidated(raw),
    };
}

function getTakbullCredentialsFromEnv() {
    const apiKey = String(process.env.TAKBULL_API_KEY || '').trim();
    const apiSecret = String(process.env.TAKBULL_API_SECRET || '').trim();
    if (!apiKey || !apiSecret) return null;
    return { apiKey, apiSecret };
}

module.exports = {
    TAKBULL_API_BASE,
    TAKBULL_PAYMENT_GATEWAY,
    paymentGatewayUrl,
    isTakbullPaymentPaid,
    extractTokenFromValidated,
    createTakbullPaymentPage,
    validateTakbullNotification,
    chargeTakbullToken,
    getTakbullCredentialsFromEnv,
    requireCreds,
};
