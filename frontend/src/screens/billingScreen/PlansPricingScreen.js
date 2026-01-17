// src/screens/billingScreen/PlansPricingScreen.js
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useScreenSize } from "../../providers/ScreenSizeProvider";

import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";

import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";

import billingApi from "../../api/billingApi";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import { COMMERCIAL_PRICING } from "../../constant/commercialPricing";

import { images } from "../../assets/images/images";
import { AdminStackName } from "../../navigation/AdminStack";
import { MainScreenName } from "../mainScreen/MainScreen";

import "./PlansPricingScreen.scss";

export const PlansPricingScreenName = "/plans-pricing";

function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export default function PlansPricingScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();

    const { result: plansResult, isPerforming: isPlansLoading } = useAutoHttpRequest(
        billingApi.getPlans,
        {
            onFailure: () => {
                // Non-blocking UI; screen will show "unavailable" states.
            },
        }
    );

    // Optional: read current plan so we can highlight it.
    const { result: currentPlan } = useAutoHttpRequest(billingApi.getPlan, {
        onFailure: () => { },
    });

    const { plans, currentPlanKey } = useMemo(() => {
        const plans = Array.isArray(plansResult?.plans) ? plansResult.plans : [];
        const currentPlanKey = currentPlan?.planKey || currentPlan?.plan_key || null;
        return { plans, currentPlanKey };
    }, [plansResult, currentPlan]);

    const renderRow = (label, value) => (
        <SimpleContainer className="lw-plansPricingScreen__row">
            <div className="lw-plansPricingScreen__label"><Text14>{label}</Text14></div>
            <div className="lw-plansPricingScreen__value"><Text14>{value}</Text14></div>
        </SimpleContainer>
    );

    if (isPlansLoading && !plansResult) return <SimpleLoader />;

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName + MainScreenName}
                    GetNavBarData={getNavBarData}
                    chosenIndex={3}
                />
            )}

            <SimpleScrollView className="lw-plansPricingScreen__scroll">
                <h2 className="lw-plansPricingScreen__title"><TextBold24>{t('planPricing.title')}</TextBold24></h2>
                <Text14 className="lw-plansPricingScreen__subtitle">{t('planPricing.subtitle')}</Text14>

                <h3 className="lw-plansPricingScreen__sectionTitle"><TextBold24>{t('planPricing.commercialPricingTitle')}</TextBold24></h3>
                <Text14 className="lw-plansPricingScreen__sectionSubtitle">{t('planPricing.commercialPricingSubtitle')}</Text14>

                <div className="lw-plansPricingScreen__commercialGrid">
                    <SimpleCard className="lw-plansPricingScreen__card">
                        <TextBold24>{t('planPricing.commercial.core.title')}</TextBold24>
                        <Text14 className="lw-plansPricingScreen__commercialPrice">{t('planPricing.priceMonthly', {
                            currency: COMMERCIAL_PRICING.currencySymbol,
                            amount: COMMERCIAL_PRICING.coreMonthlyAmount,
                        })}</Text14>
                        <Text14 className="lw-plansPricingScreen__commercialDescription">{t('planPricing.commercial.core.description')}</Text14>
                    </SimpleCard>

                    <SimpleCard className="lw-plansPricingScreen__card">
                        <TextBold24>{t('planPricing.commercial.channels.title')}</TextBold24>
                        <ul className="lw-plansPricingScreen__bullets">
                            <li><Text14>{t('planPricing.commercial.channels.portalLine', {
                                currency: COMMERCIAL_PRICING.currencySymbol,
                                amount: COMMERCIAL_PRICING.portalMonthlyAmount,
                            })}</Text14></li>
                            <li><Text14>{t('planPricing.commercial.channels.appLine', {
                                currency: COMMERCIAL_PRICING.currencySymbol,
                                amount: COMMERCIAL_PRICING.appMonthlyAmount,
                            })}</Text14></li>
                            <li><Text14>{t('planPricing.commercial.channels.bundleLine', {
                                currency: COMMERCIAL_PRICING.currencySymbol,
                                amount: COMMERCIAL_PRICING.channelsBundleMonthlyAmount,
                            })}</Text14></li>
                        </ul>
                    </SimpleCard>

                    <SimpleCard className="lw-plansPricingScreen__card">
                        <TextBold24>{t('planPricing.commercial.signing.title')}</TextBold24>
                        <Text14 className="lw-plansPricingScreen__commercialPrice">{t('planPricing.priceMonthly', {
                            currency: COMMERCIAL_PRICING.currencySymbol,
                            amount: COMMERCIAL_PRICING.signingAddonMonthlyAmount,
                        })}</Text14>
                        <Text14>{t('planPricing.commercial.signing.includes', {
                            included: COMMERCIAL_PRICING.signingIncludedDocs,
                        })}</Text14>
                        <Text14>{t('planPricing.commercial.signing.overage', {
                            currency: COMMERCIAL_PRICING.currencySymbol,
                            overage: COMMERCIAL_PRICING.signingOveragePerDocAmount,
                        })}</Text14>
                        <Text14 className="lw-plansPricingScreen__commercialNote">{t('planPricing.commercial.signing.noteOtpOptional')}</Text14>
                    </SimpleCard>
                </div>

                <h3 className="lw-plansPricingScreen__sectionTitle lw-plansPricingScreen__sectionTitle--spaced"><TextBold24>{t('planPricing.systemPlansTitle')}</TextBold24></h3>
                <Text14 className="lw-plansPricingScreen__sectionSubtitle">{t('planPricing.systemPlansSubtitle')}</Text14>

                {plans.length === 0 ? (
                    <SimpleCard className="lw-plansPricingScreen__card">
                        <Text14>{t('planPricing.noPlans')}</Text14>
                    </SimpleCard>
                ) : (
                    <div className="lw-plansPricingScreen__grid">
                        {plans.map((plan) => {
                            const planKey = String(plan?.planKey || "-");
                            const name = plan?.name || "-";
                            const priceText = t('planPricing.pricePerCommercial');

                            const retentionCore = plan?.documentsRetentionDaysCore ?? plan?.documentsRetentionDays ?? null;
                            const retentionPii = plan?.documentsRetentionDaysPii ?? plan?.documentsRetentionDays ?? null;

                            const isCurrent = currentPlanKey && planKey && String(currentPlanKey).toUpperCase() === planKey.toUpperCase();

                            const docsQuota = safeNumber(plan?.documentsMonthlyQuota);
                            const storageQuota = safeNumber(plan?.storageGbQuota);
                            const usersQuota = safeNumber(plan?.usersQuota);

                            return (
                                <SimpleCard
                                    key={planKey}
                                    className={[
                                        'lw-plansPricingScreen__card',
                                        isCurrent ? 'lw-plansPricingScreen__card--current' : null,
                                    ].filter(Boolean).join(' ')}
                                >
                                    <TextBold24>{name}</TextBold24>
                                    <Text14 className="lw-plansPricingScreen__planKey">{t('planPricing.planKey', { planKey })}</Text14>

                                    {isCurrent && (
                                        <Text14 className="lw-plansPricingScreen__currentBadge">{t('planPricing.currentPlan')}</Text14>
                                    )}

                                    <div className="lw-plansPricingScreen__divider" />

                                    {renderRow(t('planPricing.price'), priceText)}
                                    {renderRow(t('planPricing.retentionCore'), retentionCore != null ? `${retentionCore} ${t('planPricing.days')}` : t('planPricing.notAvailable'))}
                                    {renderRow(t('planPricing.retentionPii'), retentionPii != null ? `${retentionPii} ${t('planPricing.days')}` : t('planPricing.notAvailable'))}

                                    <div className="lw-plansPricingScreen__divider" />

                                    {renderRow(t('planPricing.documentsMonthly'), docsQuota == null ? t('planPricing.unlimited') : String(docsQuota))}
                                    {renderRow(t('planPricing.storageGb'), storageQuota == null ? t('planPricing.unlimited') : String(storageQuota))}
                                    {renderRow(t('planPricing.users'), usersQuota == null ? t('planPricing.unlimited') : String(usersQuota))}

                                    <Text14 className="lw-plansPricingScreen__planFooter">{t('planPricing.systemPlansCardFooter')}</Text14>
                                </SimpleCard>
                            );
                        })}
                    </div>
                )}
            </SimpleScrollView>
        </SimpleScreen>
    );
}
