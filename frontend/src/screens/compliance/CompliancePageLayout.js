import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import ComplianceBadges from "../../components/compliance/ComplianceBadges";
import { images } from "../../assets/images/images";
import ImageButton from "../../components/specializedComponents/buttons/ImageButton";
import "./CompliancePageLayout.scss";

const Logo = images.Logos.LogoSlangWhite;

/**
 * Shared layout for all public compliance pages
 * (/security, /privacy, /continuity, /compliance).
 */
export default function CompliancePageLayout({ titleKey, children }) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <SimpleScreen className="lw-compliancePage">
            <SimpleContainer className="lw-compliancePage__header">
                <ImageButton
                    src={Logo}
                    className="lw-compliancePage__logo"
                    onPress={() => navigate("/")}
                />
                <h1 className="lw-compliancePage__title">{t(titleKey)}</h1>
            </SimpleContainer>

            <SimpleScrollView className="lw-compliancePage__body">
                <SimpleContainer className="lw-compliancePage__content">
                    {children}
                </SimpleContainer>

                <SimpleContainer className="lw-compliancePage__footer">
                    <ComplianceBadges size="small" layout="row" showLabels={true} />
                    <p className="lw-compliancePage__disclaimer">
                        {t("compliance.disclaimer")}
                    </p>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
