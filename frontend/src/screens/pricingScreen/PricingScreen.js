// src/screens/pricingScreen/PricingScreen.js
import React, { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import PricingCalculatorCard from "../../components/pricing/PricingCalculatorCard";

import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";

import { Text14, TextBold18, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";

import { images } from "../../assets/images/images";
import { openExternalUrl } from "../../utils/externalNavigation";
import { setLanguage } from "../../i18n/i18n";
import { usePopup } from "../../providers/PopUpProvider";
import { PRICING_CONFIG, buildWhatsAppUrl } from "../../components/pricing/pricingConfig";

import "./PricingScreen.scss";

export const PricingScreenName = "/pricing";

export default function PricingScreen() {
    useEffect(() => {
        const previousDemoMode = window.__LW_DEMO_MODE__;
        const previousDemoToken = window.__LW_DEMO_TOKEN__;

        // Pricing page is Hebrew-only (matches Admin pricing screen behavior).
        void setLanguage("he");

        window.__LW_DEMO_MODE__ = true;
        window.__LW_DEMO_TOKEN__ = "demo-token";

        return () => {
            if (previousDemoMode === undefined) delete window.__LW_DEMO_MODE__;
            else window.__LW_DEMO_MODE__ = previousDemoMode;

            if (previousDemoToken === undefined) delete window.__LW_DEMO_TOKEN__;
            else window.__LW_DEMO_TOKEN__ = previousDemoToken;
        };
    }, []);

    const { t } = useTranslation();

    const { openPopup, closePopup } = usePopup();

    const phoneNational = PRICING_CONFIG.contact.phoneNational;

    const whatsappUrl = useMemo(() => {
        return buildWhatsAppUrl(t("nav.contactMessage"));
    }, [t]);

    const openContactPopup = useCallback(() => {
        openPopup(
            <SimpleCard className="lw-pricingScreen__contactPopup">
                <TextBold24>{t("nav.contact")}</TextBold24>
                <Text14 className="lw-pricingScreen__subtitle">
                    {t("nav.contactMessage")}
                </Text14>

                <SimpleContainer className="lw-pricingScreen__contactActions">
                    <PrimaryButton
                        onPress={() => {
                            openExternalUrl(whatsappUrl);
                            closePopup();
                        }}
                    >
                        {t("nav.contact")}
                    </PrimaryButton>

                    <SecondaryButton
                        onPress={() => {
                            openExternalUrl(`tel:${phoneNational}`, { newTab: false });
                            closePopup();
                        }}
                    >
                        {phoneNational}
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleCard>
        );
    }, [closePopup, openPopup, phoneNational, t, whatsappUrl]);

    const isMicroFrame = useMemo(() => {
        if (typeof window === "undefined") return false;
        try {
            const params = new URLSearchParams(window.location.search);
            return params.get("lwMicro") === "1" || params.get("lwMicro") === "true";
        } catch {
            return false;
        }
    }, []);

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleScrollView className="lw-pricingScreen__scroll">
                <TextBold24 className="lw-pricingScreen__title">{t("pricingPage.title")}</TextBold24>
                <Text14 className="lw-pricingScreen__subtitle">{t("pricingPage.subtitle")}</Text14>

                <PricingCalculatorCard
                    cardClassName="lw-pricingScreen__calculatorCard"
                    subtitleClassName="lw-pricingScreen__calculatorSubtitle"
                    dividerClassName="lw-pricingScreen__divider"
                    bulletsClassName="lw-pricingScreen__bullets"
                />

                {!isMicroFrame && (
                    <SimpleCard className="lw-pricingScreen__demoCard">
                        <TextBold24>{t("pricingPage.demo.title")}</TextBold24>
                        <Text14 className="lw-pricingScreen__subtitle">{t("pricingPage.demo.subtitle")}</Text14>

                        <div className="lw-pricingScreen__phones">
                            <div className="lw-pricingScreen__phoneColumn">
                                <TextBold18 className="lw-pricingScreen__phoneLabel">צד עורך הדין</TextBold18>
                                <div className="lw-iphone">
                                    <div className="lw-iphone__notch" aria-hidden="true" />
                                    <div className="lw-iphone__screen">
                                        <iframe
                                            className="lw-iphone__iframe"
                                            title={t("pricingPage.demo.adminTitle")}
                                            src={`/AdminStack/MainScreen?lwMicro=1&demo=1`}
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="lw-pricingScreen__phoneColumn">
                                <TextBold18 className="lw-pricingScreen__phoneLabel">צד הלקוח</TextBold18>
                                <div className="lw-iphone">
                                    <div className="lw-iphone__notch" aria-hidden="true" />
                                    <div className="lw-iphone__screen">
                                        <iframe
                                            className="lw-iphone__iframe"
                                            title={t("pricingPage.demo.clientTitle")}
                                            src={`/ClientStack/ClientMainScreen?lwMicro=1&demo=1`}
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </SimpleCard>
                )}
            </SimpleScrollView>

            <SimpleContainer className="lw-pricingScreen__floatingContact">
                <PrimaryButton onPress={openContactPopup}>{t("nav.contact")}</PrimaryButton>
            </SimpleContainer>
        </SimpleScreen>
    );
}
