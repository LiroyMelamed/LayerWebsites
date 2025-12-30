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
import { colors } from "../../../constant/colors";

ChartJS.register(ArcElement, Tooltip, Legend);

const DoughnutChart = ({ data, colors, labels, centerText, subText, style, className }) => {
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

    const containerStyle = {
        ...styles.container,
        ...style
    }

    return (
        <SimpleContainer className={className} style={containerStyle}>
            <SimpleContainer style={styles.centerText}>
                <TextBold16 style={styles.mainText}>{centerText}</TextBold16>
                {subText && <Text12 style={styles.subText}>{subText}</Text12>}
            </SimpleContainer>
            <Doughnut data={chartData} options={options} />
        </SimpleContainer>
    );
};

const styles = {
    container: {
        position: "relative",
    },
    centerText: {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1,
        textAlign: "center",
        flexDirection: 'column',
        pointerEvents: 'none',
        maxWidth: '90%'
    },
    mainText: {
        display: 'flex',
        justifyContent: 'center'
    },
    subText: {
        color: colors.text,
        textAlign: "center",

    },
};

export default DoughnutChart;
