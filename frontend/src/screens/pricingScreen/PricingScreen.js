// src/screens/pricingScreen/PricingScreen.js
import React, { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";

import PricingCalculatorCard from "../../components/pricing/PricingCalculatorCard";

import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";

import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";

import { images } from "../../assets/images/images";
import { openExternalUrl } from "../../utils/externalNavigation";
import { setLanguage } from "../../i18n/i18n";
import { usePopup } from "../../providers/PopUpProvider";
import { PRICING_CONFIG, buildWhatsAppUrl } from "../../components/pricing/pricingConfig";

import "./PricingScreen.scss";

export const PricingScreenName = "/Pricing";

export default function PricingScreen() {
    useEffect(() => {
        // Pricing page is Hebrew-only (matches Admin pricing screen behavior).
        void setLanguage("he");
    }, []);

    const { t } = useTranslation();

    const { openPopup, closePopup } = usePopup();

    const phoneNational = PRICING_CONFIG.contact.phoneNational;

    const whatsappUrl = useMemo(() => {
        return buildWhatsAppUrl(t("nav.contactMessage"));
    }, [t]);

    const openContactPopup = useCallback(() => {
        openPopup(
            <SimpleContainer className="lw-pricingScreen__contactPopup">
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
            </SimpleContainer>
        );
    }, [closePopup, openPopup, phoneNational, t, whatsappUrl]);

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
            </SimpleScrollView>

            <SimpleContainer className="lw-pricingScreen__floatingContact">
                <PrimaryButton onPress={openContactPopup}>{t("nav.contact")}</PrimaryButton>
            </SimpleContainer>
        </SimpleScreen>
    );
}
