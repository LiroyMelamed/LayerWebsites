import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../../specializedComponents/text/AllTextKindFile";
import { DateDDMMYY } from "../../../functions/date/DateDDMMYY";
import { useTranslation } from "react-i18next";

import "./CaseTimeline.scss";

export default function CaseTimeline({ stages, currentStage, isClosed = false, title, style }) {
    const { t } = useTranslation();
    const safeStages = Array.isArray(stages) ? stages : [];
    const safeCurrentStage = Number(currentStage) || 0;

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
                    {safeStages.slice().map((stage, index) => (
                        <SimpleContainer key={index} className="lw-caseTimeline__stage">
                            <SimpleContainer
                                className={
                                    index == safeCurrentStage - 1
                                        ? "lw-caseTimeline__dotWrap lw-caseTimeline__dotWrap--new"
                                        : "lw-caseTimeline__dotWrap"
                                }
                            >
                                <SimpleContainer className="lw-caseTimeline__dot" />
                            </SimpleContainer>

                            <SimpleContainer
                                className={
                                    index == safeCurrentStage - 1
                                        ? "lw-caseTimeline__stageDetails lw-caseTimeline__stageDetails--new"
                                        : "lw-caseTimeline__stageDetails"
                                }
                            >
                                <SimpleContainer
                                    className={
                                        index == safeCurrentStage - 1
                                            ? "lw-caseTimeline__timestampBadge lw-caseTimeline__timestampBadge--new"
                                            : "lw-caseTimeline__timestampBadge"
                                    }
                                >
                                    {index == safeCurrentStage - 1 ?
                                        <TextBold12>{isClosed && safeCurrentStage >= safeStages.length ? t('cases.ended') : t('common.new')}</TextBold12>
                                        :
                                        <Text12>{DateDDMMYY(stage.Timestamp) || (index < safeCurrentStage - 1 ? t('cases.stageCompleted') : t('cases.stageContinues'))}</Text12>
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
