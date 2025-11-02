import { Text32 } from "../../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import { images } from "../../../assets/images/images";
import { colors } from "../../../constant/colors";

export default function TopCenteredLogoOtp({ logoSrc = images.Logos.LogoSlang, logoWidth = 100, style }) {
    const ContainerStyle = {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        position: 'relative',
        ...style,
    };

    return (
        <SimpleContainer style={ContainerStyle}>
            <SimpleContainer style={{ position: 'absolute', top: 12, left: 12 }}>
                <SimpleImage src={logoSrc} tintColor={colors.text} style={{ width: 56, height: 56 }} />
            </SimpleContainer>

            <Text32 style={{ marginTop: 80, textAlign: 'center', alignSelf: 'center', color: colors.text }}>הקלד את הקוד שקיבלת בהודעה</Text32>
        </SimpleContainer>
    );
}
