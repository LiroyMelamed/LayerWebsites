import PropTypes from "prop-types";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import DoughnutChart from "../../../components/specializedComponents/charts/DoughnutChart";
import { Text12, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";

export default function ComparisonDataCard({ title, data, colors, labels, centerText, subText, style }) {
    function calculatePercentages(data) {
        const total = data.reduce((sum, value) => sum + value, 0);
        return data.map(value => ((value / total) * 100).toFixed(0)); // Returns percentages rounded to 0 decimal places
    }

    const percentages = calculatePercentages(data); // Calculate percentages dynamically

    return (
        <SimpleCard style={style}>
            <TextBold14>{title}</TextBold14>

            <SimpleContainer
                style={{
                    display: "flex",
                    flexDirection: "row",
                    marginTop: 16,
                    justifyContent: 'space-between'
                }}
            >
                <SimpleContainer style={{ display: 'flex', width: '50%', justifyContent: 'center', flexDirection: 'column' }}>
                    {labels.map((label, index) => (
                        <SimpleContainer
                            key={index}
                            style={{
                                display: "flex",
                                flexDirection: "row-reverse",
                                alignItems: "center",
                                marginBottom: 8,
                            }}
                        >
                            <SimpleContainer
                                style={{
                                    width: 12,
                                    height: 12,
                                    backgroundColor: colors[index],
                                    marginLeft: 8,
                                    borderRadius: 4,
                                }}
                            />
                            <Text12>{`${percentages[index]}% ${label}`}</Text12>
                        </SimpleContainer>
                    ))}
                </SimpleContainer>
                <SimpleContainer style={{ width: '30%' }}>
                    <DoughnutChart
                        data={data}
                        colors={colors}
                        labels={labels}
                        centerText={centerText}
                        subText={subText}
                    />
                </SimpleContainer>
            </SimpleContainer>
        </SimpleCard>
    );
}

// Prop validation
ComparisonDataCard.propTypes = {
    title: PropTypes.string.isRequired,
    data: PropTypes.arrayOf(PropTypes.number).isRequired,
    colors: PropTypes.arrayOf(PropTypes.string).isRequired,
    labels: PropTypes.arrayOf(PropTypes.string).isRequired,
    centerText: PropTypes.string.isRequired,
    subText: PropTypes.string.isRequired,
};

// Default props
ComparisonDataCard.defaultProps = {
    title: "Comparison Data",
    data: [62, 26, 12], // Example data
    colors: ["#FFC700", "#FFDA73", "#FFF4C2"], // Default colors
    labels: ["New", "Returning", "Inactive"], // Default labels
    centerText: "4,890", // Default center text
    subText: "since last month", // Default sub text
};
