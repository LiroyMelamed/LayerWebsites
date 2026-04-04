import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import Skeleton from "../../../components/simpleComponents/Skeleton";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import { TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DoughnutChartWithDetails from "../../../components/specializedComponents/charts/DoughnutChartWithDetails.js";
import { images } from "../../../assets/images/images.js";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState.js";
import { useScreenSize } from "../../../providers/ScreenSizeProvider.js";
import { useTranslation } from "react-i18next";

import "./ComprasionDataCard.scss";

export default function ComparisonDataCard({ title, data, colors, labels, centerText, subText, style: _style, className, onPress, isPerforming }) {
    const { isSmallScreen } = useScreenSize();
    const { t } = useTranslation();

    if (isPerforming) {
        return (
            <SimpleCard className={["lw-comparisonDataCard", className].filter(Boolean).join(' ')}>
                <TextBold14>{title}</TextBold14>
                <SimpleContainer style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0' }}>
                    <Skeleton circle height={120} />
                    <SimpleContainer style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                        <Skeleton width="70%" height={12} />
                        <Skeleton width="50%" height={12} />
                        <Skeleton width="60%" height={12} />
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleCard>
        );
    }

    if (checkIfAllZeros(data)) {
        return (
            <DefaultState
                content={t("mainScreen.moreDataForAnalytics")}
                imageClassName="lw-defaultState__image--h156"
                imageSrc={images.Defaults.Analytics}
            />
        )
    }

    return (
        <SimpleCard className={["lw-comparisonDataCard", onPress ? "lw-comparisonDataCard--clickable" : "", className].filter(Boolean).join(' ')} onPress={onPress}>
            <TextBold14>{title}</TextBold14>

            <DoughnutChartWithDetails
                labels={labels}
                centerText={centerText}
                data={data}
                colors={colors}
                subText={subText}
                isCompact={isSmallScreen}
            />

        </SimpleCard>
    );
}


//Functions
function checkIfAllZeros(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return true;
    }
    return list.every(element => element === 0);
}

