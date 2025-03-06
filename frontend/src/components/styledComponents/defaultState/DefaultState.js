import { images } from "../../../assets/images/images";
import SimpleCard from "../../simpleComponents/SimpleCard";
import SimpleImage from "../../simpleComponents/SimpleImage";
import { TextBold14 } from "../../specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../buttons/PrimaryButton";

export default function DefaultState({ imageSrc = images.MainPage.DataFlowing, imageStyle, content, actionButton, actionButtonPressFunction, actionButtonLeftIcon, actionButtonRightIcon, actionButtonSize, style }) {

    const CardStyle = {
        maxWidth: '100%',
        alignItems: "center",
        flexDirection: "column",
        ...style,
    }

    return (
        <SimpleCard style={CardStyle}>
            <SimpleImage src={imageSrc} style={imageStyle} />
            <TextBold14 style={{ marginTop: 8 }}>
                {content}
            </TextBold14>

            {actionButton &&
                <PrimaryButton onPress={actionButtonPressFunction} rightIcon={actionButtonRightIcon} leftIcon={actionButtonLeftIcon} size={actionButtonSize} style={{ marginTop: 8 }}>{actionButton}</PrimaryButton>
            }
        </SimpleCard>
    );
};
