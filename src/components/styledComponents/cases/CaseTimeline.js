import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../../specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import { DateDDMMYY } from "../../../functions/date/DateDDMMYY";

export default function CaseTimeline({ stages, title, style }) {
    console.log("stages", stages);

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
                    {stages.slice().reverse().map((stage, index) => (
                        <SimpleContainer key={index} style={styles.stageContainer}>
                            <SimpleContainer
                                style={stage.new ? styles.newDot : styles.defaultDot}
                            >
                                {/* Dot */}
                                <SimpleContainer style={styles.dot} />
                            </SimpleContainer>
                            {console.log("stage.Timestamp", stage.Timestamp)
                            }

                            {/* Container with date and stage name */}
                            <SimpleContainer style={styles.stageDetails(stage.new)}>
                                <SimpleContainer
                                    style={{
                                        backgroundColor: stage.new ? "#CAF1EE" : "#F7F8FF", paddingTop: 4,
                                        paddingBottom: 4, paddingRight: 4,
                                        paddingLeft: 4, borderRadius: 4
                                    }}
                                >
                                    <Text12>{stage.new ? "חדש" : DateDDMMYY(stage.Timestamp) || "שלב המשך"}</Text12>
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
        top: 54, //TODO
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
    },

    newDot: {
        backgroundColor: '#CAF1EE',
        borderRadius: 8,
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
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