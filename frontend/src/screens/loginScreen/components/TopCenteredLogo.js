import TertiaryButton from "../../../components/styledComponents/buttons/TertiaryButton";
import { Text32 } from "../../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { images } from "../../../assets/images/images";
import { colors } from "../../../constant/colors";

export default function TopCenteredLogo({ logoSrc = images.Logos.FullLogoBlack, logoWidth = 100, style }) {
    const ContainerStyle = {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        marginTop: 20,
        ...style,
    };

    const ButtonStyle = {
        position: 'absolute',
        top: '12px',
        left: '12px',
        border: `1px solid ${colors.disabledHighlighted}`,
        backgroundColor: colors.disabled
    };

    return (
        <SimpleContainer style={ContainerStyle}>
            <SimpleImage
                src={logoSrc}
                tintColor={colors.text}
                style={{ maxHeight: '50px' }}
            />

            <Text32 style={{ marginTop: 60, textAlign: 'center', alignSelf: 'center' }}>כל המידע על התיק שלך במקום אחד!</Text32>

        </SimpleContainer>
    );
}
