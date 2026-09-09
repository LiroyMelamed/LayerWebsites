import { Text32 } from "../../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import { images } from "../../../assets/images/images";
import { colors } from "../../../constant/colors";
import { useTranslation } from "react-i18next";
import ComplianceBadges from "../../../components/compliance/ComplianceBadges";
import { getPublicFirmLogoUrl, useNaturalLogoColors } from "../../../lib/tenantBranding";

import "./TopCenteredLogo.scss";

export default function TopCenteredLogo({
    logoSrc,
    logoWidth = 100,
    style,
    className = '',
    showCompliance = true,
    showTagline = true,
}) {
    const { t } = useTranslation();
    const naturalColors = useNaturalLogoColors();
    const resolvedLogo = logoSrc || (naturalColors ? getPublicFirmLogoUrl() : images.Logos.LogoSlang);

    const rootClass = ['lw-topCenteredLogo', className].filter(Boolean).join(' ');

    return (
        <SimpleContainer className={rootClass} style={style}>
            <SimpleContainer className="lw-topCenteredLogo__cornerLogo">
                <SimpleImage
                    src={resolvedLogo}
                    tintColor={naturalColors ? null : colors.text}
                    className="lw-topCenteredLogo__logoImage"
                    style={{ width: logoWidth, maxWidth: 'min(80vw, 280px)', height: 'auto' }}
                />
            </SimpleContainer>

            {showTagline && (
                <Text32 className="lw-topCenteredLogo__title">
                    {t('auth.tagline')}
                </Text32>
            )}

            {showCompliance && (
                <SimpleContainer className="lw-topCenteredLogo__isoBadgeWrap">
                    <ComplianceBadges size="small" layout="row" showLabels={false} />
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}
