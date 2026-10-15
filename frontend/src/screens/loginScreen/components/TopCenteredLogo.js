import { Text32 } from "../../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import { images } from "../../../assets/images/images";
import { colors } from "../../../constant/colors";
import { useTranslation } from "react-i18next";
import ComplianceBadges from "../../../components/compliance/ComplianceBadges";

import "./TopCenteredLogo.scss";

export default function TopCenteredLogo({ logoSrc = images.Logos.LogoSlang, logoWidth = 100, style }) {
    const { t } = useTranslation();

    return (
        <SimpleContainer className="lw-topCenteredLogo" style={style}>
            <SimpleContainer className="lw-topCenteredLogo__cornerLogo">
                <SimpleImage
                    src={logoSrc}
                    tintColor={colors.text}
                    className="lw-topCenteredLogo__logoImage"
                />
            </SimpleContainer>

            <Text32 className="lw-topCenteredLogo__title">
                {t('auth.tagline')}
            </Text32>

            <SimpleContainer className="lw-topCenteredLogo__isoBadgeWrap">
                <ComplianceBadges size="small" layout="row" showLabels={false} />
            </SimpleContainer>
        </SimpleContainer>
    );
}
