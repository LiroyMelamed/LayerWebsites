// src/screens/billingScreen/PlansPricingScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useScreenSize } from "../../providers/ScreenSizeProvider";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleButton from "../../components/simpleComponents/SimpleButton";
import Separator from "../../components/styledComponents/separators/Separator";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";

import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";

import PricingCalculatorCard from "../../components/pricing/PricingCalculatorCard";
import { PRICING_CONFIG, getPricingSelectionDefaults } from "../../components/pricing/pricingConfig";
import TakbullCheckoutDialog from "../../components/billing/TakbullCheckoutDialog";

import billingApi from "../../api/billingApi";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import { showAppToast, toastFromApiError } from "../../components/ui/showAppToast";

import { images } from "../../assets/images/images";
import { AdminStackName } from "../../navigation/AdminStack";
import { MainScreenName } from "../mainScreen/MainScreen";
import { setLanguage } from "../../i18n/i18n";

import "./PlansPricingScreen.scss";

export const PlansPricingScreenName = "/PlansPricing";

function safeDiv(numerator, denominator) {
    const n = Number(numerator);
    const d = Number(denominator);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return n / d;
}

function formatRate(rate) {
    if (rate == null) return null;
    return rate.toFixed(2);
}

export default function PlansPricingScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const defaults = useMemo(() => getPricingSelectionDefaults(), []);
    const [selection, setSelection] = useState(defaults);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [checkoutUrl, setCheckoutUrl] = useState(null);

    const { result: plan } = useAutoHttpRequest(billingApi.getPlan, {
        onFailure: () => {},
    });

    useEffect(() => {
        void setLanguage('he');
    }, []);

    useEffect(() => {
        const pkg = plan?.package;
        if (pkg?.platformId || pkg?.resourceId || pkg?.signingId) {
            setSelection({
                platformId: pkg.platformId || defaults.platformId,
                resourceId: pkg.resourceId || defaults.resourceId,
                signingId: pkg.signingId || defaults.signingId,
            });
        }
    }, [plan, defaults.platformId, defaults.resourceId, defaults.signingId]);

    const disabledIds = plan?.disabledOptions || { platformIds: [], resourceIds: [], signingIds: [] };

    const saveAndPay = async () => {
        setBusy(true);
        setMessage("");
        try {
            const saved = await billingApi.savePackage(selection);
            if (!saved?.success) {
                const text = saved?.data?.message || saved?.message || t('planPricing.saveFailed');
                setMessage(text);
                toastFromApiError(saved, text);
                return;
            }
            if (saved.data?.checkout?.redirectUrl) {
                setCheckoutUrl(saved.data.checkout.redirectUrl);
                return;
            }
            if (saved.data?.snapshot?.card) {
                setMessage(t('planPricing.savedOk'));
                showAppToast({ type: 'success', text: t('planPricing.savedOk') });
                return;
            }
            const checkout = await billingApi.createCheckout({ kind: 'setup' });
            if (checkout?.success && checkout.data?.redirectUrl) {
                setCheckoutUrl(checkout.data.redirectUrl);
                return;
            }
            const text = checkout?.data?.message || checkout?.message || t('planPricing.checkoutFailed');
            setMessage(text);
            toastFromApiError(checkout, text);
        } catch (e) {
            toastFromApiError(e, t('planPricing.saveFailed'));
            setMessage(t('planPricing.saveFailed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName + MainScreenName}
                    GetNavBarData={getNavBarData}
                    chosenNavKey="planUsage"
                />
            )}

            <SimpleScrollView className="lw-plansPricingScreen__scroll">
                <TextBold24 className="lw-plansPricingScreen__title">{t('planPricing.title')}</TextBold24>
                <Text14 className="lw-plansPricingScreen__subtitle">{t('planPricing.subtitle')}</Text14>

                <PricingCalculatorCard
                    cardClassName="lw-plansPricingScreen__card"
                    subtitleClassName="lw-plansPricingScreen__sectionSubtitle"
                    dividerClassName="lw-plansPricingScreen__divider"
                    bulletsClassName="lw-plansPricingScreen__bullets"
                    value={selection}
                    onChange={setSelection}
                    disabledIds={disabledIds}
                    footer={(
                        <>
                            {message ? <Text14 className="lw-plansPricingScreen__saveMessage">{message}</Text14> : null}
                            <SimpleButton
                                className="lw-plansPricingScreen__saveButton"
                                onPress={saveAndPay}
                                disabled={busy}
                            >
                                <Text14>{t('planPricing.saveAndPay')}</Text14>
                            </SimpleButton>
                        </>
                    )}
                />

                <TextBold24 className="lw-plansPricingScreen__sectionTitle lw-plansPricingScreen__sectionTitle--spaced">{t('planPricing.signingSectionTitle')}</TextBold24>
                <Text14 className="lw-plansPricingScreen__sectionSubtitle">{t('planPricing.signingSectionSubtitle')}</Text14>

                <SimpleCard className="lw-plansPricingScreen__card">
                    <TextBold24>{t('planPricing.signing.title')}</TextBold24>
                    <ul className="lw-plansPricingScreen__bullets">
                        <li><Text14>{t('planPricing.signing.b1')}</Text14></li>
                        <li><Text14>{t('planPricing.signing.b2')}</Text14></li>
                        <li><Text14>{t('planPricing.signing.b3')}</Text14></li>
                        <li><Text14>{t('planPricing.signing.b4')}</Text14></li>
                    </ul>

                    <Separator className="lw-plansPricingScreen__divider" />

                    {(() => {
                        const currency = PRICING_CONFIG.currency;

                        const packages = PRICING_CONFIG.signing
                            .filter((p) => p.id !== 'none' && p.id !== 'unlimited')
                            .map((p) => ({
                                key: p.id,
                                packageName: p.label,
                                included: p.includedSignatures,
                                amount: p.amount,
                            }));

                        const unlimited = PRICING_CONFIG.signing.find((p) => p.id === 'unlimited');

                        return (
                            <ul className="lw-plansPricingScreen__bullets">
                                {packages.map((p) => {
                                    const rate = formatRate(safeDiv(p.amount, p.included));
                                    return (
                                        <li key={p.key}>
                                            <Text14>
                                                {t('planPricing.signing.packageLine', {
                                                    packageName: p.packageName,
                                                    included: p.included,
                                                    currency,
                                                    amount: p.amount,
                                                    rate,
                                                })}
                                            </Text14>
                                        </li>
                                    );
                                })}
                                {unlimited && (
                                    <li key="signingUnlimited">
                                        <Text14>
                                            {t('planPricing.signing.unlimitedLine', {
                                                currency,
                                                amount: unlimited.amount,
                                            })}
                                        </Text14>
                                    </li>
                                )}
                            </ul>
                        );
                    })()}

                    <Text14 className="lw-plansPricingScreen__commercialNote">{t('planPricing.signing.overageExplanation')}</Text14>
                    <Text14 className="lw-plansPricingScreen__commercialNote">{t('planPricing.signing.fairUseExplanation')}</Text14>
                </SimpleCard>
            </SimpleScrollView>
            <TakbullCheckoutDialog
                open={Boolean(checkoutUrl)}
                gatewayUrl={checkoutUrl}
                onClose={() => setCheckoutUrl(null)}
                onPaid={() => {
                    billingApi.invalidateCaches();
                    setCheckoutUrl(null);
                    setMessage(t('planPricing.savedOk'));
                }}
            />
        </SimpleScreen>
    );
}
