import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12 } from "../text/AllTextKindFile";
import DoughnutChart from "./DoughnutChart";

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
        <SimpleContainer
            style={{
                display: "flex",
                flexDirection: "row",
                marginTop: 16,
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                ...style
            }}
        >
            <SimpleContainer style={{ display: 'flex', flex: 1, flexDirection: 'column', }}>
                {percentages && labels?.map((label, index) => (
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

            <DoughnutChart
                data={data}
                colors={colors}
                labels={labels}
                centerText={centerText}
                subText={subText}
                style={{ flex: 1, ...doughnutStyle }}
            />
        </SimpleContainer>
    );
};
