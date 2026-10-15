import React from "react";
import { Doughnut } from "react-chartjs-2";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold16 } from "../text/AllTextKindFile";
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
} from "chart.js";

import "./DoughnutChart.scss";

ChartJS.register(ArcElement, Tooltip, Legend);

const DoughnutChart = ({ data, colors, labels, centerText, subText, className }) => {
    const chartData = {
        labels: labels,
        datasets: [
            {
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
            },
        ],
    };

    const options = {
        cutout: "70%",
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                enabled: false,
            },
        },
    };

    const mergedClassName = ["lw-doughnutChart", className].filter(Boolean).join(" ");

    return (
        <SimpleContainer className={mergedClassName}>
            <SimpleContainer className="lw-doughnutChart__centerText">
                <TextBold16 className="lw-doughnutChart__mainText">{centerText}</TextBold16>
                {subText && <Text12 className="lw-doughnutChart__subText">{subText}</Text12>}
            </SimpleContainer>
            <Doughnut data={chartData} options={options} />
        </SimpleContainer>
    );
};

export default DoughnutChart;
