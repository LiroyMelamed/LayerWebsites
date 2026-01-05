import { icons } from "../../../assets/icons/icons";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleIcon from "../../../components/simpleComponents/SimpleIcon";
import { Text12, TextBold14, TextBold36 } from "../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import addCommasToNumber from "../../../functions/numbers/addCommasToNumber";

import "./ShowDataCard.scss";

export default function ShowDataCard({ title, icon, numberText, comprationNumber, comprationText, optionalOnClick }) {
    return (
        <SimpleCard className="lw-showDataCard" onPress={optionalOnClick}>
            <TextBold14 >{title}</TextBold14>

            <SimpleContainer className="lw-showDataCard__number">
                <TextBold36>{numberText}</TextBold36>
            </SimpleContainer>

            {comprationNumber && comprationText &&
                <SimpleContainer className="lw-showDataCard__comparisonRow">
                    <Text12>{comprationText}</Text12>
                    <Text12 color={comprationNumber > 0 ? colors.positive : colors.negative}>
                        {addCommasToNumber(comprationNumber, null, "%")}
                    </Text12>
                    <SimpleContainer
                        className={
                            [
                                "lw-showDataCard__arrow",
                                comprationNumber > 0 ? "is-up" : "is-down",
                            ].join(" ")
                        }
                    >
                        <SimpleIcon
                            src={icons.Button.DownArrow}
                            size={12}
                            tintColor={comprationNumber > 0 ? colors.positive : colors.negative}
                        />
                    </SimpleContainer>
                </SimpleContainer>
            }
        </SimpleCard>
    );
}