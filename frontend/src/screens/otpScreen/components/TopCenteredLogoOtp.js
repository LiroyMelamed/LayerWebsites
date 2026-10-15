import { Text32 } from "../../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import { images } from "../../../assets/images/images";
import { colors } from "../../../constant/colors";
import { useTranslation } from "react-i18next";

import "./TopCenteredLogoOtp.scss";

export default function TopCenteredLogoOtp({ logoSrc = images.Logos.LogoSlang, logoWidth = 100, style: _style }) {
    const { t } = useTranslation();

    return (
        <SimpleContainer className="lw-topCenteredLogoOtp">
            <SimpleContainer className="lw-topCenteredLogoOtp__cornerLogo">
                <SimpleImage
                    src={logoSrc}
                    tintColor={colors.text}
                    className="lw-topCenteredLogoOtp__logoImage"
                />
            </SimpleContainer>

            <Text32 className="lw-topCenteredLogoOtp__title">
                {t('auth.enterOtpInstruction')}
            </Text32>
        </SimpleContainer>
    );
}
