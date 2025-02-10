import { icons } from "../../../assets/icons/icons";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleIcon from "../../../components/simpleComponents/SimpleIcon";
import { Text12, TextBold14, TextBold20, TextBold36 } from "../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import addCommasToNumber from "../../../functions/numbers/addCommasToNumber";

export default function ShowDataCard({ title, icon, numberText, comprationNumber, comprationText }) {
    return (
        <SimpleCard style={{ flex: 1 }}>
            <TextBold14>{title}</TextBold14>

            <TextBold36 style={{ marginTop: 8 }}>{numberText}</TextBold36>

            {comprationNumber && comprationText &&
                <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', marginTop: 8 }}>
                    <SimpleIcon
                        src={icons.Button.DownArrow}
                        style={{
                            display: 'flex',
                            transform: `rotate(${comprationNumber > 0 ? 180 : 0}deg)`,
                            height: 12,
                            width: 12
                        }}
                        tintColor={comprationNumber > 0 ? colors.positive : colors.negative}
                    />
                    <Text12 color={comprationNumber > 0 ? colors.positive : colors.negative} style={{ marginRight: 8 }}>{addCommasToNumber(comprationNumber, null, "%")}</Text12>
                    <Text12 style={{ marginRight: 4 }}>{comprationText}</Text12>
                </SimpleContainer>
            }
        </SimpleCard>
    );
}