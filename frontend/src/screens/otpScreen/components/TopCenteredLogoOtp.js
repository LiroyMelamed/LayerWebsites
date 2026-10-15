import { Text32 } from "../../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import { images } from "../../../assets/images/images";
import { colors } from "../../../constant/colors";
import { useTranslation } from "react-i18next";
import { getPublicFirmLogoUrl, useNaturalLogoColors } from "../../../lib/tenantBranding";

import "./TopCenteredLogoOtp.scss";

export default function TopCenteredLogoOtp({ logoSrc, logoWidth = 100, style: _style }) {
    const { t } = useTranslation();
    const naturalColors = useNaturalLogoColors();
    const resolvedLogo = logoSrc || (naturalColors ? getPublicFirmLogoUrl() : images.Logos.LogoSlang);

    return (
        <SimpleContainer className="lw-topCenteredLogoOtp">
            <SimpleContainer className="lw-topCenteredLogoOtp__cornerLogo">
                <SimpleImage
                    src={resolvedLogo}
                    tintColor={naturalColors ? null : colors.text}
                    className="lw-topCenteredLogoOtp__logoImage"
                    style={{ width: logoWidth, maxWidth: 'min(80vw, 280px)', height: 'auto' }}
                />
            </SimpleContainer>

            <Text32 className="lw-topCenteredLogoOtp__title">
                {t('auth.enterOtpInstruction')}
            </Text32>
        </SimpleContainer>
    );
}
