import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SimpleContainer from '../simpleComponents/SimpleContainer';
import SimpleButton from '../simpleComponents/SimpleButton';
import { Text14, TextBold20 } from '../specializedComponents/text/AllTextKindFile';
import billingApi from '../../api/billingApi';
import './TakbullCheckoutDialog.scss';

export default function TakbullCheckoutDialog({ open, gatewayUrl, intentId, uniqId, onClose, onPaid, onFailed, title, hint }) {
    const { t } = useTranslation();
    const [height, setHeight] = useState(640);
    const [confirming, setConfirming] = useState(false);
    const iframe = useRef(null);
    const callbacks = useRef(null);
    callbacks.current = { onClose, onPaid, onFailed, t };

    useEffect(() => {
        if (!open) return undefined;
        let active = true;
        let handled = false;
        let expectedOrigin;
        try { expectedOrigin = new URL(gatewayUrl).origin; } catch { return undefined; }
        setConfirming(false);
        async function onMessage(event) {
            if (event.source !== iframe.current?.contentWindow || event.origin !== expectedOrigin) return;
            if (typeof event.data === 'number' && Number.isFinite(event.data)) {
                setHeight(Math.max(420, Math.min(900, event.data + 50)));
                return;
            }
            const data = event.data;
            if (data && typeof data === 'object' && data.message === 'paymentreplay') {
                const code = data.value?.InternalCode;
                if (code == null || handled) return;
                handled = true;
                setConfirming(true);
                let paid = false;
                try {
                    // The iframe is a wake-up only. The server verifies this
                    // exact order and any separate subscription collection.
                    if (intentId || uniqId) {
                        const confirmed = await billingApi.confirmCheckout({ intentId, uniqId });
                        paid = confirmed?.success === true && confirmed?.data?.success === true;
                    }
                } catch (_) {
                    // An unknown outcome must not invite a second payment.
                }
                if (active) {
                    setConfirming(false);
                    if (paid) callbacks.current.onPaid?.();
                    else callbacks.current.onFailed?.(callbacks.current.t('billing.paymentUnconfirmed'));
                    callbacks.current.onClose?.();
                }
            }
        }
        window.addEventListener('message', onMessage);
        return () => { active = false; window.removeEventListener('message', onMessage); };
    }, [open, gatewayUrl, intentId, uniqId]);

    if (!open) return null;

    return (
        <div className="lw-takbullCheckout" role="dialog" aria-modal="true" aria-busy={confirming}>
            <SimpleContainer className="lw-takbullCheckout__panel">
                <TextBold20>{title || t('billing.checkoutTitle')}</TextBold20>
                <Text14 className="lw-takbullCheckout__hint">{hint || t('billing.checkoutHint')}</Text14>
                {gatewayUrl ? (
                    <iframe
                        ref={iframe}
                        title="Takbull checkout"
                        src={gatewayUrl}
                        className="lw-takbullCheckout__iframe"
                        style={{ height }}
                        allow="payment *; clipboard-read; clipboard-write"
                        referrerPolicy="no-referrer-when-downgrade"
                    />
                ) : null}
                {confirming ? <Text14 role="status">{t('common.loading')}</Text14> : null}
                <SimpleContainer className="lw-takbullCheckout__actions">
                    <SimpleButton onPress={onClose}>
                        <Text14>{t('common.cancel')}</Text14>
                    </SimpleButton>
                </SimpleContainer>
            </SimpleContainer>
        </div>
    );
}
