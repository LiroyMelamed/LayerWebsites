import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimplePopUp from "../../simpleComponents/SimplePopUp";
import { Text14, TextBold16 } from "../../specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../buttons/PrimaryButton";
import Separator from "../separators/Separator";

export default function ErrorPopup({ closePopup, errorText }) {
    return (
        <SimpleContainer style={{ flexDirection: 'column' }}>
            <TextBold16>אופס...</TextBold16>

            <Separator style={{ margin: '20px 0px' }} />

            <Text14 style={{ margin: '20px 0px' }}>{errorText}</Text14>

            <Separator style={{ margin: '20px 0px' }} />

            <PrimaryButton onPress={() => closePopup()} style={{ alignSelf: 'flex-start' }}>אישור</PrimaryButton>
        </SimpleContainer>
    );
}