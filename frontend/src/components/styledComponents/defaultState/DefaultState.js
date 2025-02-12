import { images } from "../../../assets/images/images";
import SimpleCard from "../../simpleComponents/SimpleCard";
import SimpleImage from "../../simpleComponents/SimpleImage";
import { TextBold14 } from "../../specializedComponents/text/AllTextKindFile";

export default function DefaultState({ imageSrc = images.MainPage.DataFlowing, imageStyle, content, style }) {

    const CardStyle = {
        width: '100%',
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
        </SimpleCard>
    );
};
