import { Text32 } from "../../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import { images } from "../../../assets/images/images";
import { colors } from "../../../constant/colors";

import "./TopCenteredLogo.scss";

export default function TopCenteredLogo({ logoSrc = images.Logos.LogoSlang, logoWidth = 100, style }) {
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
                כל המידע על התיק שלך במקום אחד!
            </Text32>
        </SimpleContainer>
    );
}
