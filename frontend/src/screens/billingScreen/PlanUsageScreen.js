// src/screens/billingScreen/PlanUsageScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import TakbullCheckoutDialog from "../../components/billing/TakbullCheckoutDialog";
import { useBillingLock } from "../../providers/BillingLockProvider";

import Skeleton from "../../components/simpleComponents/Skeleton";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleButton from "../../components/simpleComponents/SimpleButton";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";

import { Text14, TextBold14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import ProgressBar from "../../components/specializedComponents/containers/ProgressBar";

import billingApi from "../../api/billingApi";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import { formatDisplayDate } from "../../functions/date/formatDateForInput";
import { showAppToast, toastFromApiError } from "../../components/ui/showAppToast";

import { images } from "../../assets/images/images";
import { AdminStackName } from "../../navigation/AdminStack";
import { MainScreenName } from "../mainScreen/MainScreen";
import { PlansPricingScreenName } from "./PlansPricingScreen";

import "./PlanUsageScreen.scss";

export const PlanUsageScreenName = "/PlanUsage";

function bytesToMb(bytes) {
    const b = Number(bytes || 0);
    if (!Number.isFinite(b) || b <= 0) return 0;
    return b / (1024 * 1024);
}

function formatStorageDisplay(bytes) {
    const b = Number(bytes || 0);
    if (!Number.isFinite(b) || b <= 0) return '0 MB';
    const mb = b / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
}

function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function formatIls(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return null;
    return `${n} ₪`;
}

export default function PlanUsageScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { refresh: refreshLock } = useBillingLock();
    const [checkoutUrl, setCheckoutUrl] = useState(null);
    const [payBusy, setPayBusy] = useState(false);
    const [payNotice, setPayNotice] = useState(null);

    const { result: planResult, isPerforming: isPlanLoading, performRequest: reloadPlan } = useAutoHttpRequest(
        billingApi.getPlan,
        {
            onFailure: () => {
                // Non-blocking UI; screen will show "unavailable" states.
            },
        }
    );

    const { result: usageResult, isPerforming: isUsageLoading } = useAutoHttpRequest(
        billingApi.getUsage,
        {
            onFailure: () => {
                // Non-blocking UI; screen will show "unavailable" states.
            },
        }
    );

    const plan = asRecord(planResult);
    const usage = asRecord(usageResult);

    const normalized = useMemo(() => {
        const scope = plan?.scope || (plan?.firmId ? "firm" : "tenant");
        const pkg = asRecord(plan?.package) || {};
        const billing = asRecord(plan?.billing) || {};

        const planName = pkg.displayName || plan?.name || plan?.planName || pkg.resource?.label || "-";
        const planKey = plan?.planKey || pkg.resource?.planKey || "-";
        const priceIls = pkg.total ?? billing.priceMonthlyIls ?? null;
        const priceCents = plan?.priceMonthlyCents ?? plan?.pricing?.priceMonthlyCents ?? null;
        const priceCurrency = plan?.priceCurrency ?? pkg.currency ?? plan?.pricing?.currency ?? "ILS";

        const retentionCoreDays =
            plan?.retention?.documentsCoreDays ?? plan?.effectiveDocumentsRetentionDaysCore ?? null;
        const retentionPiiDays =
            plan?.retention?.documentsPiiDays ?? plan?.effectiveDocumentsRetentionDaysPii ?? null;

        const quotas = plan?.quotas || {};

        const docsThisMonth = usage?.documents?.createdThisMonth ?? null;
        const storageMbUsed = usage?.storage?.bytesTotal != null ? bytesToMb(usage?.storage?.bytesTotal) : null;
        const storageBytesTotal = usage?.storage?.bytesTotal ?? null;
        const seatsUsed = usage?.seats?.used ?? null;
        // sms.sentThisMonth = all SMS (OTP + notifications + any); backward compat with old otp field
        const smsThisMonth = usage?.sms?.sentThisMonth ?? usage?.otp?.smsThisMonth ?? null;

        const monthStartUtc = usage?.monthStartUtc ?? usage?.period?.monthStartUtc ?? null;

        return {
            scope,
            firmId: plan?.firmId ?? null,
            enforcementMode: plan?.enforcementMode ?? null,

            planKey,
            planName,
            priceIls,
            priceCents,
            priceCurrency,
            retentionCoreDays,
            retentionPiiDays,
            quotas,
            billing,
            pkg,
            payments: Array.isArray(billing.payments) ? billing.payments : [],
            upcomingPayment: billing.upcomingPayment
                ? {
                    ...billing.upcomingPayment,
                    amountIls: Number(billing.upcomingPayment.amountIls || priceIls || 0),
                }
                : null,
            billingInterval: billing.billingInterval === "yearly" ? "yearly" : "monthly",
            priceYearlyIls: billing.priceYearlyIls ?? null,

            monthStartUtc,
            meters: {
                documentsThisMonth: safeNumber(docsThisMonth),
                storageMbUsed: storageMbUsed != null ? Number(storageMbUsed.toFixed(1)) : null,
                storageBytesTotal: safeNumber(storageBytesTotal),
                seatsUsed: safeNumber(seatsUsed),
                smsThisMonth: safeNumber(smsThisMonth),
            },
        };
    }, [plan, usage]);

    useEffect(() => {
        const paid = searchParams.get('paid');
        if (paid !== '1' && paid !== '0') return;
        const ok = paid === '1';
        const text = ok ? t('planUsage.paySuccess') : t('planUsage.payFailed');
        setPayNotice({ type: ok ? 'success' : 'error', text });
        showAppToast({ type: ok ? 'success' : 'error', text });
        billingApi.invalidateCaches();
        void reloadPlan([]);
        void refreshLock();
        const next = new URLSearchParams(searchParams);
        next.delete('paid');
        setSearchParams(next, { replace: true });
    }, [searchParams, refreshLock, reloadPlan, setSearchParams, t]);

    const chargeSaved = async (kind = "retry") => {
        setPayBusy(true);
        try {
            const res = await billingApi.chargeNow({ kind });
            if (res?.data?.skipped) {
                showAppToast({ type: "info", text: t("planUsage.chargeSkipped") });
                return;
            }
            if (!res?.success || res?.data?.ok === false) {
                toastFromApiError(res, t("planUsage.chargeFailed"));
                setPayNotice({ type: "error", text: t("planUsage.chargeFailed") });
                return;
            }
            showAppToast({ type: "success", text: t("planUsage.chargeOk") });
            setPayNotice({ type: "success", text: t("planUsage.chargeOk") });
            billingApi.invalidateCaches();
            void reloadPlan([]);
            void refreshLock();
        } catch (e) {
            toastFromApiError(e, t("planUsage.chargeFailed"));
        } finally {
            setPayBusy(false);
        }
    };

    const startCheckout = async (kind = "setup") => {
        setPayBusy(true);
        try {
            const res = await billingApi.createCheckout({ kind });
            if (res?.success && res.data?.redirectUrl) {
                setCheckoutUrl(res.data.redirectUrl);
                return;
            }
            toastFromApiError(res, t("planUsage.checkoutFailed"));
        } catch (e) {
            toastFromApiError(e, t("planUsage.checkoutFailed"));
        } finally {
            setPayBusy(false);
        }
    };

    const saveBillingInterval = async (nextInterval) => {
        const pkg = normalized.pkg || {};
        if (!pkg.platformId || !pkg.resourceId || !pkg.signingId) return;
        if (nextInterval === normalized.billingInterval) return;
        setPayBusy(true);
        try {
            const res = await billingApi.savePackage({
                platformId: pkg.platformId,
                resourceId: pkg.resourceId,
                signingId: pkg.signingId,
                billingInterval: nextInterval,
            });
            if (!res?.success) {
                toastFromApiError(res, t("planUsage.checkoutFailed"));
                return;
            }
            showAppToast({ type: "success", text: t("planUsage.intervalSaved") });
            billingApi.invalidateCaches();
            void reloadPlan([]);
        } catch (e) {
            toastFromApiError(e, t("planUsage.checkoutFailed"));
        } finally {
            setPayBusy(false);
        }
    };

    const payYearNow = async () => {
        if (normalized.billing?.card) {
            await chargeSaved("annual");
            return;
        }
        await startCheckout("annual");
    };

    const renderRow = (label, value) => (
        <SimpleContainer className="lw-planUsageScreen__row">
            <div className="lw-planUsageScreen__label"><TextBold14>{label}</TextBold14></div>
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

    const monthlyIls = normalized.priceIls != null
        ? formatIls(normalized.priceIls)
        : (normalized.priceCents != null ? formatIls(Number(normalized.priceCents) / 100) : null);
    const priceText = monthlyIls
        ? t('planUsage.priceMonthly', { amount: monthlyIls.replace(' ₪', ''), currency: '₪' })
        : t('planUsage.quotaNotAvailable');
    const yearlyAmount = Number(normalized.priceYearlyIls || normalized.billing?.priceYearlyIls || 0);
    const yearlyIls = yearlyAmount > 0 ? formatIls(yearlyAmount) : null;
    const yearlyText = yearlyIls
        ? t('planUsage.priceYearly', { amount: yearlyIls.replace(' ₪', ''), currency: '₪' })
        : null;
    const billingInterval = normalized.billingInterval || 'monthly';
    const statusText = normalized.billing?.status
        ? t(`planUsage.statusValues.${normalized.billing.status}`, { defaultValue: String(normalized.billing.status) })
        : "-";
    const nextChargeAmount = formatIls(
        normalized.billing?.nextChargeIls
        || (billingInterval === 'yearly' ? yearlyAmount : null)
        || (normalized.billing?.stillComplimentary ? normalized.priceIls : null)
        || normalized.priceIls
    );
    const paymentRows = [
        ...(normalized.upcomingPayment ? [normalized.upcomingPayment] : []),
        ...normalized.payments,
    ];

    const coreRetentionText = normalized.retentionCoreDays ?? "-";
    const piiRetentionText = normalized.retentionPiiDays ?? "-";

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName + MainScreenName}
                    GetNavBarData={getNavBarData}
                    chosenNavKey="planUsage"
                />
            )}

            <SimpleScrollView>
                {payNotice?.text && (
                    <SimpleCard className={`lw-planUsageScreen__banner lw-planUsageScreen__banner--${payNotice.type}`}>
                        <TextBold14>{payNotice.text}</TextBold14>
                    </SimpleCard>
                )}
                {(isPlanLoading && !plan) ? (
                    <SimpleCard className="lw-planUsageScreen__card">
                        <Skeleton width={120} height={20} borderRadius={6} />
                        {[1, 2, 3, 4].map(i => (
                            <SimpleContainer key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.625rem 0' }}>
                                <Skeleton width="30%" height={14} />
                                <Skeleton width="40%" height={14} />
                            </SimpleContainer>
                        ))}
                    </SimpleCard>
                ) : (
                    <>
                        <SimpleCard className="lw-planUsageScreen__card">
                            <TextBold24>{t('planUsage.planCardTitle')}</TextBold24>
                            {renderRow(t('planUsage.status'), statusText)}
                            {renderRow(t('planUsage.planName'), normalized.planName)}
                            {renderRow(t('planUsage.price'), priceText)}
                            {yearlyText && renderRow(t('planUsage.priceYearlyLabel'), yearlyText)}
                            {renderRow(
                                t('planUsage.billingInterval'),
                                billingInterval === 'yearly'
                                    ? t('planUsage.intervalYearly')
                                    : t('planUsage.intervalMonthly')
                            )}
                            {normalized.billing?.stillComplimentary && normalized.billing?.complimentaryUntil && (
                                renderRow(
                                    t('planUsage.complimentaryUntil'),
                                    formatDisplayDate(normalized.billing.complimentaryUntil)
                                )
                            )}
                            {normalized.billing?.card?.last4
                                ? renderRow(t('planUsage.savedCard'), `**** ${normalized.billing.card.last4}`)
                                : renderRow(t('planUsage.savedCard'), t('planUsage.noCard'))}
                            {normalized.billing?.renewsAt && renderRow(
                                t('planUsage.nextCharge'),
                                `${formatDisplayDate(normalized.billing.renewsAt)}${nextChargeAmount ? ` · ${nextChargeAmount} ${t('planUsage.exclVat')}` : ''}`
                            )}
                            {normalized.billing?.status === 'past_due' && normalized.billing?.graceUntil && renderRow(
                                t('planUsage.graceUntil'),
                                formatDisplayDate(normalized.billing.graceUntil)
                            )}
                            {normalized.pkg?.breakdown?.length > 0 && normalized.pkg.breakdown.map((line) => (
                                renderRow(line.label, `${line.amount} ₪`)
                            ))}

                            <SimpleContainer className="lw-planUsageScreen__intervalRow" role="group">
                                <SimpleButton
                                    className={`lw-planUsageScreen__intervalButton${billingInterval === 'monthly' ? ' is-selected' : ''}`}
                                    onPress={() => saveBillingInterval('monthly')}
                                    disabled={payBusy}
                                >
                                    <Text14>{t('planUsage.intervalMonthly')}</Text14>
                                </SimpleButton>
                                <SimpleButton
                                    className={`lw-planUsageScreen__intervalButton${billingInterval === 'yearly' ? ' is-selected' : ''}`}
                                    onPress={() => saveBillingInterval('yearly')}
                                    disabled={payBusy}
                                >
                                    <Text14>{t('planUsage.intervalYearly')}</Text14>
                                </SimpleButton>
                            </SimpleContainer>

                            <SimpleButton
                                className="lw-planUsageScreen__upgradeButton"
                                onPress={() => navigate(AdminStackName + PlansPricingScreenName)}
                            >
                                <Text14>{t('planUsage.upgradeButton')}</Text14>
                            </SimpleButton>
                            {normalized.billing?.billingEnabled !== false && yearlyAmount > 0 && (
                                <SimpleButton
                                    className="lw-planUsageScreen__upgradeButton"
                                    onPress={payYearNow}
                                    disabled={payBusy}
                                >
                                    <Text14>{t('planUsage.payYearNow', { amount: yearlyAmount })}</Text14>
                                </SimpleButton>
                            )}
                            {!normalized.billing?.stillComplimentary && (
                                <SimpleButton
                                    className="lw-planUsageScreen__upgradeButton"
                                    onPress={() => (normalized.billing?.card ? chargeSaved() : startCheckout())}
                                    disabled={payBusy}
                                >
                                    <Text14>
                                        {normalized.billing?.card
                                            ? t('planUsage.chargeNow')
                                            : t('planUsage.addCard')}
                                    </Text14>
                                </SimpleButton>
                            )}
                            {!normalized.billing?.card && normalized.billing?.stillComplimentary && (
                                <SimpleButton
                                    className="lw-planUsageScreen__upgradeButton"
                                    onPress={() => startCheckout()}
                                    disabled={payBusy}
                                >
                                    <Text14>{t('planUsage.addCard')}</Text14>
                                </SimpleButton>
                            )}
                            {normalized.billing?.card && (
                                <SimpleButton
                                    className="lw-planUsageScreen__upgradeButton"
                                    onPress={() => startCheckout()}
                                    disabled={payBusy}
                                >
                                    <Text14>{t('planUsage.replaceCard')}</Text14>
                                </SimpleButton>
                            )}
                        </SimpleCard>

                        <SimpleCard className="lw-planUsageScreen__card">
                            <TextBold24>{t('planUsage.paymentsTitle')}</TextBold24>
                            {paymentRows.length === 0 ? (
                                <Text14>{t('planUsage.noPayments')}</Text14>
                            ) : (
                                paymentRows.map((row) => {
                                    const when = formatDisplayDate(row.settledAt || row.createdAt);
                                    const kind = t(`planUsage.paymentKind.${row.kind}`, { defaultValue: row.purpose || row.kind });
                                    const status = t(`planUsage.paymentStatus.${row.status}`, { defaultValue: row.status });
                                    const amount = formatIls(row.amountIls) || '-';
                                    return (
                                        <SimpleContainer key={row.id} className="lw-planUsageScreen__paymentRow">
                                            {renderRow(kind, `${amount} · ${status}`)}
                                            {renderRow(t('planUsage.paymentDate'), when)}
                                            {row.errorMessage ? renderRow(t('planUsage.paymentError'), row.errorMessage) : null}
                                        </SimpleContainer>
                                    );
                                })
                            )}
                        </SimpleCard>

                        <SimpleCard className="lw-planUsageScreen__card">
                            <TextBold24>{t('planUsage.retentionTitle')}</TextBold24>
                            {renderRow(t('planUsage.retentionCore'), `${coreRetentionText} ${t('planUsage.days')}`)}
                            {renderRow(t('planUsage.retentionPii'), `${piiRetentionText} ${t('planUsage.days')}`)}
                        </SimpleCard>

                        <SimpleCard className="lw-planUsageScreen__card">
                            <TextBold24>{t('planUsage.usageCardTitle')}</TextBold24>
                            {normalized.monthStartUtc && renderRow(t('planUsage.monthStart'), formatDisplayDate(normalized.monthStartUtc))}
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
                                        title: t('planUsage.meters.storageMb'),
                                        used: normalized.meters.storageMbUsed,
                                        quota: normalized.quotas?.storageMbQuota,
                                        unit: 'MB',
                                        labelKey: 'planUsage.progress.storageMb',
                                    })}
                                    {normalized.meters.storageBytesTotal != null && (
                                        <Text14 className="lw-planUsageScreen__storageDetail">
                                            {t('planUsage.storageApprox', { size: formatStorageDisplay(normalized.meters.storageBytesTotal) })}
                                        </Text14>
                                    )}

                                    {renderMeter({
                                        title: t('planUsage.meters.seats'),
                                        used: normalized.meters.seatsUsed,
                                        quota: normalized.quotas?.usersQuota,
                                        unit: '',
                                        labelKey: 'planUsage.progress.seats',
                                    })}

                                    {renderMeter({
                                        title: t('planUsage.meters.sms'),
                                        used: normalized.meters.smsThisMonth,
                                        quota: normalized.quotas?.otpSmsMonthlyQuota,
                                        unit: '',
                                        labelKey: 'planUsage.progress.sms',
                                    })}
                                </>
                            )}
                        </SimpleCard>
                    </>
                )}
            </SimpleScrollView>
            <TakbullCheckoutDialog
                open={Boolean(checkoutUrl)}
                gatewayUrl={checkoutUrl}
                onClose={() => setCheckoutUrl(null)}
                onPaid={() => {
                    billingApi.invalidateCaches();
                    void reloadPlan([]);
                    void refreshLock();
                    setCheckoutUrl(null);
                    const text = t('planUsage.paySuccess');
                    setPayNotice({ type: 'success', text });
                    showAppToast({ type: 'success', text });
                }}
                onFailed={(description) => {
                    setCheckoutUrl(null);
                    const text = description || t('planUsage.payFailed');
                    setPayNotice({ type: 'error', text });
                    showAppToast({ type: 'error', text });
                }}
            />
        </SimpleScreen>
    );
}
