import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../../specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import { DateDDMMYY } from "../../../functions/date/DateDDMMYY";

export default function CaseTimeline({ stages, currentStage, title, style }) {
    return (
        <SimpleContainer
            style={style}
        >
            <SimpleContainer>
                <TextBold12>
                    {title}
                </TextBold12>
            </SimpleContainer>
            <SimpleContainer
                style={styles.container}
            >
                <SimpleContainer style={styles.verticalLine} />

                <SimpleContainer style={styles.dotsContainer}>
                    {stages?.slice().map((stage, index) => (
                        <SimpleContainer key={index} style={styles.stageContainer}>
                            <SimpleContainer
                                style={index == currentStage - 1 ? styles.newDot : styles.defaultDot}
                            >
                                <SimpleContainer style={styles.dot} />
                            </SimpleContainer>

                            <SimpleContainer style={styles.stageDetails(index == currentStage - 1)}>
                                <SimpleContainer
                                    style={{
                                        backgroundColor: index == currentStage - 1 ? "#CAF1EE" : "#F7F8FF", paddingTop: 4,
                                        paddingBottom: 4, paddingRight: 4,
                                        paddingLeft: 4, borderRadius: 4
                                    }}
                                >
                                    {index == currentStage - 1 ?
                                        <TextBold12>חדש</TextBold12>
                                        :
                                        <Text12>{DateDDMMYY(stage.Timestamp) || (index < currentStage - 1 ? "שלב הסתיים" : "שלב המשך")}</Text12>
                                    }
                                </SimpleContainer>
                                <TextBold12>{stage.Text}</TextBold12>
                            </SimpleContainer>
                        </SimpleContainer>
                    ))}
                </SimpleContainer>


            </SimpleContainer>
        </SimpleContainer>
    );
}


const styles = {
    container: {
        flexDirection: 'row',
        paddingTop: 16,
        position: 'relative',
        zIndex: 1000,
        marginRight: 4,
        flex: 1
    },

    dotsContainer: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        zIndex: 1001,
        position: 'relative',
        flex: 1
    },

    verticalLine: {
        position: 'absolute',
        top: 54,
        bottom: 36,
        width: 1,
        right: 3,
        backgroundColor: '#CAF1EE',
        zIndex: 1000
    },

    back: {
        backgroundColor: colors.white,
        borderRadius: 8,
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1002
    },

    newDot: {
        display: 'relative',
        marginRight: -4,
        display: 'flex',
        backgroundColor: '#CAF1EE',
        borderRadius: 8,
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center'
    },

    stageContainer: {
        display: 'flex',
        width: '100%',
        flexDirection: 'row-reverse',
        alignItems: 'center'
    },

    dot: {
        display: 'flex',
        width: 6,
        height: 6,
        borderRadius: 8,
        backgroundColor: colors.winter,
    },

    stageDetails: (isNew) => ({
        display: 'flex',
        width: '100%',
        flexDirection: 'column',
        alignItems: 'flex-end',
        marginRight: 4,
        backgroundColor: isNew ? colors.pressed : colors.transparent,
        paddingTop: 8,
        paddingBottom: 8,
        paddingRight: 16,
        paddingLeft: 16,
        borderRadius: 8,
    }),
}