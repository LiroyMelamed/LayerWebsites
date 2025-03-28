import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../../specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import SimpleScrollView from "../../simpleComponents/SimpleScrollView";

export default function CaseTypeTimeline({ stages = [], title, style }) {
    return (
        <SimpleScrollView style={{ ...style, width: '100%' }}>
            <SimpleContainer style={styles.container}>
                <SimpleContainer style={styles.verticalLine} />

                <SimpleContainer style={styles.dotsContainer}>
                    {Array.isArray(stages) && stages.length > 0 ? (
                        stages.map((stage, index) => (
                            <SimpleContainer key={index} style={styles.stageContainer}>
                                <SimpleContainer style={stage.New ? styles.newDot : styles.defaultDot}>
                                    <SimpleContainer style={styles.dot} />
                                </SimpleContainer>

                                <SimpleContainer style={styles.stageDetails(stage.New)}>
                                    <SimpleContainer
                                        style={{
                                            backgroundColor: stage.New ? "#CAF1EE" : "#F7F8FF",
                                            padding: 4,
                                            borderRadius: 4
                                        }}
                                    >
                                        {stage.New ? (
                                            <TextBold12>חדש</TextBold12>
                                        ) : (
                                            <Text12>{stage.Timestamp || `שלב מס' ${index + 1}`}</Text12>
                                        )}
                                    </SimpleContainer>
                                    <TextBold12>{stage.Text}</TextBold12>
                                </SimpleContainer>
                            </SimpleContainer>
                        ))
                    ) : (
                        <TextBold12 style={{ textAlign: 'center', marginTop: 10 }}>
                            אין שלבים בסוג תיק זה
                        </TextBold12>
                    )}
                </SimpleContainer>
            </SimpleContainer>
        </SimpleScrollView>
    );
}


const styles = {
    container: {
        flexDirection: 'row-reverse',
        position: 'relative',
        zIndex: 1000,
        marginRight: 4,
        justifyContent: 'flex-start',
        width: "100%"
    },

    dotsContainer: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        zIndex: 1001,
        position: 'relative',
    },

    verticalLine: {
        position: 'absolute',
        top: 36, //TODO
        bottom: 36, //TODO
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