import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12 } from "../text/AllTextKindFile";
import DoughnutChart from "./DoughnutChart";

import "./DoughnutChartWithDetails.scss";

export default function DoughnutChartWithDetails({ data, colors, labels, centerText, subText, doughnutStyle, style }) {
    function calculatePercentages(data) {
        const total = data.reduce((sum, value) => sum + value, 0);
        if (total === 0) {
            return null
        }
        return data.map(value => ((value / total) * 100).toFixed(0));
    }

    const percentages = calculatePercentages(data);

    return (
        <SimpleContainer className="lw-doughnutChartWithDetails" style={style}>
            <DoughnutChart
                data={data}
                colors={colors}
                labels={labels}
                centerText={centerText}
                subText={subText}
                style={{ flex: 1, ...doughnutStyle }}
            />

            <SimpleContainer className="lw-doughnutChartWithDetails__legend">
                {percentages && labels?.map((label, index) => (
                    <SimpleContainer
                        key={index}
                        className="lw-doughnutChartWithDetails__legendItem"
                    >
                        <SimpleContainer
                            className="lw-doughnutChartWithDetails__swatch"
                            style={{ backgroundColor: colors[index] }}
                        />
                        <Text12>{`${percentages[index]}% ${label}`}</Text12>
                    </SimpleContainer>
                ))}
            </SimpleContainer>
        </SimpleContainer>
    );
};
