import TertiaryButton from "../../../components/styledComponents/buttons/TertiaryButton";
import { Text32 } from "../../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { images } from "../../../assets/images/images";
import { colors } from "../../../constant/colors";

export default function TopCenteredLogoOtp({ logoSrc = images.Logos.FullLogoBlack, logoWidth = 100, style }) {
    const ContainerStyle = {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        marginTop: 40,
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
            <TertiaryButton
                children={'כניסת מנהלים'}
                style={ButtonStyle}
                size={buttonSizes.SMALL}
                innerTextColor={colors.text}
            />

            <SimpleImage
                src={logoSrc}
                style={{ maxHeight: '50px' }}
            />

            <Text32 style={{ marginTop: 60, textAlign: 'center', alignSelf: 'center' }}>הקלד את הקוד שקיבלת בהודעה</Text32>

        </SimpleContainer>
    );
}
