import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import { TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DoughnutChartWithDetails from "../../../components/specializedComponents/charts/DoughnutChartWithDetails.js";
import SimpleImage from "../../../components/simpleComponents/SimpleImage.js";
import { images } from "../../../assets/images/images.js";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState.js";

export default function ComparisonDataCard({ title, data, colors, labels, centerText, subText, style }) {

    if (checkIfAllZeros(data)) {
        return (
            <DefaultState
                content={"כשהיה לנו יותר מידע נציג לך פילוח נתונים"}
                imageStyle={{ height: 156 }}
                imageSrc={images.Defaults.Analytics}
            />
        )
    }

    return (
        <SimpleCard style={{ ...style, flexDirection: 'column' }}>
            <TextBold14>{title}</TextBold14>

            <DoughnutChartWithDetails
                labels={labels}
                centerText={centerText}
                data={data}
                colors={colors}
                subText={subText}
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

