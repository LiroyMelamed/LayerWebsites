import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SimpleContainer from '../simpleComponents/SimpleContainer';
import SimpleButton from '../simpleComponents/SimpleButton';
import { Text14, TextBold20 } from '../specializedComponents/text/AllTextKindFile';
import './TakbullCheckoutDialog.scss';

export default function TakbullCheckoutDialog({ open, gatewayUrl, onClose, onPaid, onFailed }) {
    const { t } = useTranslation();
    const [height, setHeight] = useState(640);

    useEffect(() => {
        if (!open) return undefined;
        function onMessage(event) {
            if (typeof event.data === 'number' && Number.isFinite(event.data)) {
                setHeight(Math.max(420, Math.min(900, event.data + 50)));
                return;
            }
            const data = event.data;
            if (data && typeof data === 'object' && data.message === 'paymentreplay') {
                const code = data.value?.InternalCode;
                if (code === 0) {
                    onPaid?.();
                    onClose?.();
                    return;
                }
                if (code != null) {
                    const description =
                        data.value?.InternalDescription
                        || data.value?.Description
                        || data.value?.description
                        || null;
                    onFailed?.(description);
                    onClose?.();
                }
            }
        }
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [open, onClose, onPaid, onFailed]);

    if (!open) return null;

    return (
        <div className="lw-takbullCheckout" role="dialog" aria-modal="true">
            <SimpleContainer className="lw-takbullCheckout__panel">
                <TextBold20>{t('billing.checkoutTitle')}</TextBold20>
                <Text14 className="lw-takbullCheckout__hint">{t('billing.checkoutHint')}</Text14>
                {gatewayUrl ? (
                    <iframe
                        title="Takbull checkout"
                        src={gatewayUrl}
                        className="lw-takbullCheckout__iframe"
                        style={{ height }}
                        allow="payment *; clipboard-read; clipboard-write"
                        referrerPolicy="no-referrer-when-downgrade"
                    />
                ) : null}
                <SimpleContainer className="lw-takbullCheckout__actions">
                    {gatewayUrl ? (
                        <SimpleButton onPress={() => window.open(gatewayUrl, '_blank', 'noopener,noreferrer')}>
                            <Text14>{t('billing.openInNewTab')}</Text14>
                        </SimpleButton>
                    ) : null}
                    <SimpleButton onPress={onClose}>
                        <Text14>{t('billing.closeCheckout')}</Text14>
                    </SimpleButton>
                </SimpleContainer>
            </SimpleContainer>
        </div>
    );
}
