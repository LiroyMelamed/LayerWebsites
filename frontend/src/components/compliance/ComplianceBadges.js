import React from "react";
import { useTranslation } from "react-i18next";
import { images } from "../../assets/images/images";
import SimpleContainer from "../simpleComponents/SimpleContainer";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import complianceApi from "../../api/complianceApi";
import "./ComplianceBadges.scss";

const FALLBACK_MODE = "aligned";

/**
 * Reusable compliance badges component.
 *
 * Displays ISO 27001, ISO 27701 and ISO 22301 badges with
 * text that adapts to the COMPLIANCE_BADGES_MODE flag
 * served by the backend.
 *
 * Props:
 *   size      – "small" | "medium" | "large"  (default: "medium")
 *   layout    – "row" | "column"               (default: "row")
 *   showLabels – boolean                       (default: true)
 */
export default function ComplianceBadges({ size = "medium", layout = "row", showLabels = true }) {
    const { t } = useTranslation();
    const { result: complianceData } = useAutoHttpRequest(complianceApi.getStatus);

    const mode = complianceData?.mode || FALLBACK_MODE;
    const isCertified = mode === "certified";

    const badges = [
        {
            key: "iso27001",
            src: images.Badges.Iso27001,
            alt: "ISO/IEC 27001",
            label: isCertified
                ? t("compliance.badges.iso27001Certified")
                : t("compliance.badges.iso27001Aligned"),
        },
        {
            key: "iso27701",
            src: images.Badges.Iso27701,
            alt: "ISO/IEC 27701",
            label: isCertified
                ? t("compliance.badges.iso27701Certified")
                : t("compliance.badges.iso27701Ready"),
        },
        {
            key: "iso22301",
            src: images.Badges.Iso22301,
            alt: "ISO 22301",
            label: isCertified
                ? t("compliance.badges.iso22301Certified")
                : t("compliance.badges.iso22301Based"),
        },
    ];

    return (
        <SimpleContainer className={`lw-complianceBadges lw-complianceBadges--${layout} lw-complianceBadges--${size}`}>
            {badges.map((b) => (
                <SimpleContainer key={b.key} className="lw-complianceBadges__item">
                    <img src={b.src} alt={b.alt} className="lw-complianceBadges__img" />
                    {showLabels && (
                        <span className="lw-complianceBadges__label">{b.label}</span>
                    )}
                </SimpleContainer>
            ))}
        </SimpleContainer>
    );
}
