// src/screens/billingScreen/PlanUsageScreen.js
import React, { useMemo } from "react";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleButton from "../../components/simpleComponents/SimpleButton";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";

import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import ProgressBar from "../../components/specializedComponents/containers/ProgressBar";

import billingApi from "../../api/billingApi";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import { normalizeCurrencySymbol } from "../../constant/commercialPricing";

import { images } from "../../assets/images/images";
import { AdminStackName } from "../../navigation/AdminStack";
import { MainScreenName } from "../mainScreen/MainScreen";
import { PlansPricingScreenName } from "./PlansPricingScreen";

import "./PlanUsageScreen.scss";

export const PlanUsageScreenName = "/plan-usage";

const normalizeCurrency = normalizeCurrencySymbol;

function bytesToGb(bytes) {
    const b = Number(bytes || 0);
    if (!Number.isFinite(b) || b <= 0) return 0;
    return b / (1024 * 1024 * 1024);
}

function formatMoneyCents(cents) {
    const n = Number(cents);
    if (!Number.isFinite(n)) return null;
    return (n / 100).toFixed(2);
}

function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export default function PlanUsageScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();

    const { result: plan, isPerforming: isPlanLoading } = useAutoHttpRequest(
        billingApi.getPlan,
        {
            onFailure: () => {
                // Non-blocking UI; screen will show "unavailable" states.
            },
        }
    );

    const { result: usage, isPerforming: isUsageLoading } = useAutoHttpRequest(
        billingApi.getUsage,
        {
            onFailure: () => {
                // Non-blocking UI; screen will show "unavailable" states.
            },
        }
    );

    const normalized = useMemo(() => {
        const scope = plan?.scope || (plan?.firmId ? "firm" : "tenant");

        const planKey = plan?.planKey || "-";
        const planName = plan?.name || plan?.planName || "-";

        const priceCents = plan?.priceMonthlyCents ?? plan?.pricing?.priceMonthlyCents ?? null;
        const priceCurrency = plan?.priceCurrency ?? plan?.pricing?.currency ?? plan?.pricing?.priceCurrency ?? null;

        const retentionCoreDays =
            plan?.retention?.documentsCoreDays ?? plan?.effectiveDocumentsRetentionDaysCore ?? null;
        const retentionPiiDays =
            plan?.retention?.documentsPiiDays ?? plan?.effectiveDocumentsRetentionDaysPii ?? null;

        const quotas = plan?.quotas || {};

        const docsThisMonth = usage?.documents?.createdThisMonth ?? usage?.documents?.createdThisMonth ?? null;
        const storageGbUsed = usage?.storage?.bytesTotal != null ? bytesToGb(usage?.storage?.bytesTotal) : null;
        const seatsUsed = usage?.seats?.used ?? null;
        const otpSmsThisMonth = usage?.otp?.smsThisMonth ?? null;
        const evidenceGenerationsThisMonth = usage?.evidence?.generationsThisMonth ?? null;
        const evidenceCpuSecondsThisMonth = usage?.evidence?.cpuSecondsThisMonth ?? null;

        const monthStartUtc = usage?.monthStartUtc ?? usage?.period?.monthStartUtc ?? null;

        return {
            scope,
            firmId: plan?.firmId ?? null,
            enforcementMode: plan?.enforcementMode ?? null,

            planKey,
            planName,
            priceCents,
            priceCurrency,
            retentionCoreDays,
            retentionPiiDays,
            quotas,

            monthStartUtc,
            meters: {
                documentsThisMonth: safeNumber(docsThisMonth),
                storageGbUsed: storageGbUsed != null ? Number(storageGbUsed.toFixed(2)) : null,
                seatsUsed: safeNumber(seatsUsed),
                otpSmsThisMonth: safeNumber(otpSmsThisMonth),
                evidenceGenerationsThisMonth: safeNumber(evidenceGenerationsThisMonth),
                evidenceCpuSecondsThisMonth: safeNumber(evidenceCpuSecondsThisMonth),
            },
        };
    }, [plan, usage]);

    const renderRow = (label, value) => (
        <SimpleContainer className="lw-planUsageScreen__row">
            <div className="lw-planUsageScreen__label"><Text14>{label}</Text14></div>
            <div className="lw-planUsageScreen__value"><Text14>{value}</Text14></div>
        </SimpleContainer>
    );

    const renderMeter = ({ title, used, quota, unit, labelKey }) => {
        const usedNum = safeNumber(used);
        const rawQuotaNum = quota === null || quota === undefined ? null : safeNumber(quota);
        const quotaNum = rawQuotaNum === 0 ? null : rawQuotaNum;

        const usedText = usedNum === null ? t('planUsage.quotaNotAvailable') : `${usedNum}${unit ? ` ${unit}` : ''}`;
        const quotaText = quotaNum === null ? t('planUsage.quotaUnlimited') : `${quotaNum}${unit ? ` ${unit}` : ''}`;

        return (
            <SimpleContainer className="lw-planUsageScreen__meter">
                <TextBold24>{title}</TextBold24>
                {renderRow(t('planUsage.used'), usedText)}
                {renderRow(t('planUsage.limit'), quotaText)}
                {quotaNum !== null && usedNum !== null && quotaNum > 0 && (
                    <ProgressBar
                        IsClosed
                        currentStage={usedNum}
                        totalStages={quotaNum}
                        labelKey={labelKey}
                        showPercent
                    />
                )}
            </SimpleContainer>
        );
    };

    if (isPlanLoading && !plan) return <SimpleLoader />;

    const priceAmount = normalized.priceCents != null ? formatMoneyCents(normalized.priceCents) : null;
    const priceCurrency = normalizeCurrency(normalized.priceCurrency);
    const priceText = priceAmount && priceCurrency
        ? t('planUsage.priceMonthly', { amount: priceAmount, currency: priceCurrency })
        : t('planUsage.quotaNotAvailable');

    const coreRetentionText = normalized.retentionCoreDays ?? "-";
    const piiRetentionText = normalized.retentionPiiDays ?? "-";

    const scopeText = normalized.scope
        ? t(`planUsage.scopeValues.${String(normalized.scope).toLowerCase()}`, { defaultValue: String(normalized.scope) })
        : "-";

    const enforcementModeText = normalized.enforcementMode
        ? t(`planUsage.enforcementModeValues.${String(normalized.enforcementMode).toLowerCase()}`, { defaultValue: String(normalized.enforcementMode) })
        : null;

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName + MainScreenName}
                    GetNavBarData={getNavBarData}
                    chosenIndex={3}
                />
            )}

            <SimpleScrollView className="lw-planUsageScreen__scroll">
                <TextBold24 className="lw-planUsageScreen__title">{t('planUsage.title')}</TextBold24>

                <SimpleCard className="lw-planUsageScreen__card">
                    <TextBold24>{t('planUsage.planCardTitle')}</TextBold24>
                    {renderRow(t('planUsage.planName'), normalized.planName)}
                    {renderRow(t('planUsage.planKey'), normalized.planKey)}
                    {renderRow(t('planUsage.price'), priceText)}
                    {renderRow(t('planUsage.scope'), scopeText)}
                    {normalized.firmId != null && renderRow(t('planUsage.firmId'), String(normalized.firmId))}
                    {enforcementModeText && renderRow(t('planUsage.enforcementMode'), enforcementModeText)}

                    <SimpleButton
                        className="lw-planUsageScreen__upgradeButton"
                        onPress={() => navigate(AdminStackName + PlansPricingScreenName)}
                    >
                        <Text14>{t('planUsage.upgradeButton')}</Text14>
                    </SimpleButton>
                </SimpleCard>

                <SimpleCard className="lw-planUsageScreen__card">
                    <TextBold24>{t('planUsage.retentionTitle')}</TextBold24>
                    {renderRow(t('planUsage.retentionCore'), `${coreRetentionText} ${t('planUsage.days')}`)}
                    {renderRow(t('planUsage.retentionPii'), `${piiRetentionText} ${t('planUsage.days')}`)}
                </SimpleCard>

                <SimpleCard className="lw-planUsageScreen__card">
                    <TextBold24>{t('planUsage.usageCardTitle')}</TextBold24>
                    {normalized.monthStartUtc && renderRow(t('planUsage.monthStart'), new Date(normalized.monthStartUtc).toLocaleDateString())}
                    {isUsageLoading && !usage ? (
                        <Text14>{t('planUsage.loadingUsage')}</Text14>
                    ) : (
                        <>
                            {renderMeter({
                                title: t('planUsage.meters.documentsMonthly'),
                                used: normalized.meters.documentsThisMonth,
                                quota: normalized.quotas?.documentsMonthlyQuota,
                                unit: '',
                                labelKey: 'planUsage.progress.documentsMonthly',
                            })}

                            {renderMeter({
                                title: t('planUsage.meters.storageGb'),
                                used: normalized.meters.storageGbUsed,
                                quota: normalized.quotas?.storageGbQuota,
                                unit: 'GB',
                                labelKey: 'planUsage.progress.storageGb',
                            })}

                            {renderMeter({
                                title: t('planUsage.meters.seats'),
                                used: normalized.meters.seatsUsed,
                                quota: normalized.quotas?.usersQuota,
                                unit: '',
                                labelKey: 'planUsage.progress.seats',
                            })}

                            {renderMeter({
                                title: t('planUsage.meters.otpSms'),
                                used: normalized.meters.otpSmsThisMonth,
                                quota: normalized.quotas?.otpSmsMonthlyQuota,
                                unit: '',
                                labelKey: 'planUsage.progress.otpSms',
                            })}

                            {renderMeter({
                                title: t('planUsage.meters.evidenceGenerations'),
                                used: normalized.meters.evidenceGenerationsThisMonth,
                                quota: normalized.quotas?.evidenceGenerationsMonthlyQuota,
                                unit: '',
                                labelKey: 'planUsage.progress.evidenceGenerations',
                            })}

                            {renderMeter({
                                title: t('planUsage.meters.evidenceCpuSeconds'),
                                used: normalized.meters.evidenceCpuSecondsThisMonth,
                                quota: normalized.quotas?.evidenceCpuSecondsMonthlyQuota,
                                unit: 's',
                                labelKey: 'planUsage.progress.evidenceCpuSeconds',
                            })}
                        </>
                    )}
                </SimpleCard>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
