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

ChartJS.register(ArcElement, Tooltip, Legend);


const DoughnutChart = ({ data, colors, labels, centerText, subText, style }) => {
    const chartData = {
        labels: labels, // Labels for the chart segments
        datasets: [
            {
                data: data, // Values for the segments
                backgroundColor: colors, // Colors for the segments
                borderWidth: 0, // Removes borders
            },
        ],
    };

    const options = {
        cutout: "70%", // Inner circle size (makes it a doughnut)
        plugins: {
            legend: {
                display: false, // Hides the default legend
            },
            tooltip: {
                enabled: false, // Disable tooltips
            },
        },

    };

    const containerStyle = {
        ...styles.container,
        style
    }

    return (
        <SimpleContainer style={containerStyle}>
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
    },
    mainText: {
        display: 'flex',
        justifyContent: 'center'
    },
    subText: {
        color: "#888",
    },
};

export default DoughnutChart;
