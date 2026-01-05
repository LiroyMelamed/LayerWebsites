import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../../specializedComponents/text/AllTextKindFile";
import { DateDDMMYY } from "../../../functions/date/DateDDMMYY";

import "./CaseTimeline.scss";

export default function CaseTimeline({ stages, currentStage, title, style: _style }) {
    return (
        <SimpleContainer
            className="lw-caseTimeline"
        >
            <SimpleContainer className="lw-caseTimeline__title">
                <TextBold12>
                    {title}
                </TextBold12>
            </SimpleContainer>
            <SimpleContainer
                className="lw-caseTimeline__container"
            >
                <SimpleContainer className="lw-caseTimeline__verticalLine" />

                <SimpleContainer className="lw-caseTimeline__dotsContainer">
                    {stages?.slice().map((stage, index) => (
                        <SimpleContainer key={index} className="lw-caseTimeline__stage">
                            <SimpleContainer
                                className={
                                    index == currentStage - 1
                                        ? "lw-caseTimeline__dotWrap lw-caseTimeline__dotWrap--new"
                                        : "lw-caseTimeline__dotWrap"
                                }
                            >
                                <SimpleContainer className="lw-caseTimeline__dot" />
                            </SimpleContainer>

                            <SimpleContainer
                                className={
                                    index == currentStage - 1
                                        ? "lw-caseTimeline__stageDetails lw-caseTimeline__stageDetails--new"
                                        : "lw-caseTimeline__stageDetails"
                                }
                            >
                                <SimpleContainer
                                    className={
                                        index == currentStage - 1
                                            ? "lw-caseTimeline__timestampBadge lw-caseTimeline__timestampBadge--new"
                                            : "lw-caseTimeline__timestampBadge"
                                    }
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
