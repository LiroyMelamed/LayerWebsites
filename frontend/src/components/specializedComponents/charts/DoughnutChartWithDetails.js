import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12 } from "../text/AllTextKindFile";
import DoughnutChart from "./DoughnutChart";

import "./DoughnutChartWithDetails.scss";

export default function DoughnutChartWithDetails({ data, colors, labels, centerText, subText, isCompact = false }) {
    const getLegendSwatchStyle = (color) => ({
        // runtime dynamic: legend swatch color comes from chart palette
        backgroundColor: color,
    });

    function calculatePercentages(data) {
        const total = data.reduce((sum, value) => sum + value, 0);
        if (total === 0) {
            return null
        }
        return data.map(value => ((value / total) * 100).toFixed(0));
    }

    const percentages = calculatePercentages(data);

    return (
        <SimpleContainer className="lw-doughnutChartWithDetails">
            <SimpleContainer
                className={
                    "lw-doughnutChartWithDetails__chart" + (isCompact ? " is-compact" : "")
                }
            >
                <DoughnutChart
                    data={data}
                    colors={colors}
                    labels={labels}
                    centerText={centerText}
                    subText={subText}
                />
            </SimpleContainer>

            <SimpleContainer className="lw-doughnutChartWithDetails__legend">
                {percentages && labels?.map((label, index) => (
                    <SimpleContainer
                        key={index}
                        className="lw-doughnutChartWithDetails__legendItem"
                    >
                        <SimpleContainer
                            className="lw-doughnutChartWithDetails__swatch"
                            style={getLegendSwatchStyle(colors[index])}
                        />
                        <Text12>{`${percentages[index]}% ${label}`}</Text12>
                    </SimpleContainer>
                ))}
            </SimpleContainer>
        </SimpleContainer>
    );
};
