// src/screens/pricingScreen/PricingScreen.js
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleButton from "../../components/simpleComponents/SimpleButton";

import { Text14, TextBold18, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";

import { images } from "../../assets/images/images";
import { openExternalUrl } from "../../utils/externalNavigation";
import { COMMERCIAL_PRICING } from "../../constant/commercialPricing";

import "./PricingScreen.scss";

export const PricingScreenName = "/pricing";

function BulletList({ items }) {
    return (
        <ul className="lw-pricingScreen__bullets">
            {items.map((txt) => (
                <li key={txt}>
                    <Text14>{txt}</Text14>
                </li>
            ))}
        </ul>
    );
}

function FaqItem({ title, body, isOpen, onToggle }) {
    return (
        <div className="lw-pricingScreen__faqItem">
            <SimpleContainer className="lw-pricingScreen__faqHeader" onPress={onToggle} role="button" tabIndex={0}>
                <TextBold18>{title}</TextBold18>
                <Text14 aria-hidden="true">{isOpen ? "−" : "+"}</Text14>
            </SimpleContainer>
            {isOpen && (
                <div className="lw-pricingScreen__faqAnswer">
                    <Text14>{body}</Text14>
                </div>
            )}
            <div className="lw-pricingScreen__divider" />
        </div>
    );
}

export default function PricingScreen() {
    const { t } = useTranslation();

    const [openFaqKey, setOpenFaqKey] = useState("faq1");

    const faq = useMemo(
        () => [
            { key: "faq1", q: t("pricingPage.faq.q1"), a: t("pricingPage.faq.a1") },
            { key: "faq2", q: t("pricingPage.faq.q2"), a: t("pricingPage.faq.a2") },
            { key: "faq3", q: t("pricingPage.faq.q3"), a: t("pricingPage.faq.a3") },
        ],
        [t]
    );

    const whatsappUrl = useMemo(() => {
        const msg = encodeURIComponent(t("nav.contactMessage"));
        return `https://wa.me/972507299064?text=${msg}`;
    }, [t]);

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleScrollView className="lw-pricingScreen__scroll">
                <h2 className="lw-pricingScreen__title"><TextBold24>{t("pricingPage.title")}</TextBold24></h2>
                <Text14 className="lw-pricingScreen__subtitle">{t("pricingPage.subtitle")}</Text14>
                <Text14 className="lw-pricingScreen__subtitle">{t("pricingPage.clarifyingLine")}</Text14>

                <div className="lw-pricingScreen__grid">
                    <SimpleCard className="lw-pricingScreen__card">
                        <TextBold24>{t("pricingPage.core.title")}</TextBold24>
                        <Text14 className="lw-pricingScreen__priceLine">
                            {t("planPricing.priceMonthly", { currency: COMMERCIAL_PRICING.currencySymbol, amount: COMMERCIAL_PRICING.coreMonthlyAmount })}
                        </Text14>
                        <BulletList
                            items={[
                                t("pricingPage.core.b1"),
                                t("pricingPage.core.b2"),
                                t("pricingPage.core.b3"),
                                t("pricingPage.core.b4"),
                            ]}
                        />
                    </SimpleCard>

                    <SimpleCard className="lw-pricingScreen__card">
                        <TextBold24>{t("pricingPage.channels.title")}</TextBold24>

                        <TextBold18>{t("pricingPage.channels.portalTitle")}</TextBold18>
                        <Text14 className="lw-pricingScreen__priceLine">
                            {t("planPricing.priceMonthly", { currency: COMMERCIAL_PRICING.currencySymbol, amount: COMMERCIAL_PRICING.portalMonthlyAmount })}
                        </Text14>

                        <TextBold18 style={{ marginTop: 12 }}>{t("pricingPage.channels.appTitle")}</TextBold18>
                        <Text14 className="lw-pricingScreen__priceLine">
                            {t("planPricing.priceMonthly", { currency: COMMERCIAL_PRICING.currencySymbol, amount: COMMERCIAL_PRICING.appMonthlyAmount })}
                        </Text14>

                        <TextBold18 style={{ marginTop: 12 }}>{t("pricingPage.channels.bundleTitle")}</TextBold18>
                        <Text14 className="lw-pricingScreen__priceLine">
                            {t("planPricing.priceMonthly", { currency: COMMERCIAL_PRICING.currencySymbol, amount: COMMERCIAL_PRICING.channelsBundleMonthlyAmount })}
                        </Text14>

                        <BulletList
                            items={[
                                t("pricingPage.channels.b1"),
                                t("pricingPage.channels.b2"),
                            ]}
                        />
                    </SimpleCard>

                    <SimpleCard className="lw-pricingScreen__card">
                        <TextBold24>{t("pricingPage.signing.title")}</TextBold24>
                        <Text14 className="lw-pricingScreen__priceLine">
                            {t("planPricing.priceMonthly", { currency: COMMERCIAL_PRICING.currencySymbol, amount: COMMERCIAL_PRICING.signingAddonMonthlyAmount })}
                        </Text14>
                        <Text14>
                            {t("pricingPage.signing.includes", { included: COMMERCIAL_PRICING.signingIncludedDocs })}
                        </Text14>
                        <Text14>
                            {t("pricingPage.signing.overage", { currency: COMMERCIAL_PRICING.currencySymbol, overage: COMMERCIAL_PRICING.signingOveragePerDocAmount })}
                        </Text14>

                        <BulletList
                            items={[
                                t("pricingPage.signing.b1"),
                                t("pricingPage.signing.b2"),
                                t("pricingPage.signing.noteOtpOptional"),
                            ]}
                        />
                    </SimpleCard>
                </div>

                <SimpleCard className="lw-pricingScreen__faqCard">
                    <TextBold24>{t("pricingPage.faq.title")}</TextBold24>

                    {faq.map((item) => (
                        <FaqItem
                            key={item.key}
                            title={item.q}
                            body={item.a}
                            isOpen={openFaqKey === item.key}
                            onToggle={() => setOpenFaqKey((prev) => (prev === item.key ? null : item.key))}
                        />
                    ))}

                    <div className="lw-pricingScreen__cta">
                        <SimpleButton onPress={() => openExternalUrl(whatsappUrl)}>
                            <TextBold18>{t("nav.contact")}</TextBold18>
                        </SimpleButton>
                    </div>
                </SimpleCard>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
