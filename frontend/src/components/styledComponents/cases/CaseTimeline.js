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
                    {safeStages.slice().map((stage, index) => {
                        const isCurrent = index === safeCurrentStage - 1;
                        const isPast = index < safeCurrentStage - 1;
                        const isFuture = index > safeCurrentStage - 1;

                        let badgeText;
                        if (isCurrent) {
                            badgeText = isClosed && safeCurrentStage >= safeStages.length
                                ? t('cases.ended')
                                : t('common.new');
                        } else if (isPast) {
                            badgeText = DateDDMMYY(stage.Timestamp) || t('cases.stageCompleted');
                        } else {
                            // Future stage — never show old timestamps
                            badgeText = t('cases.stageContinues');
                        }

                        return (
                            <SimpleContainer key={index} className="lw-caseTimeline__stage">
                                <SimpleContainer
                                    className={
                                        isCurrent
                                            ? "lw-caseTimeline__dotWrap lw-caseTimeline__dotWrap--new"
                                            : isFuture
                                                ? "lw-caseTimeline__dotWrap lw-caseTimeline__dotWrap--future"
                                                : "lw-caseTimeline__dotWrap"
                                    }
                                >
                                    <SimpleContainer className="lw-caseTimeline__dot" />
                                </SimpleContainer>

                                <SimpleContainer
                                    className={
                                        isCurrent
                                            ? "lw-caseTimeline__stageDetails lw-caseTimeline__stageDetails--new"
                                            : isFuture
                                                ? "lw-caseTimeline__stageDetails lw-caseTimeline__stageDetails--future"
                                                : "lw-caseTimeline__stageDetails"
                                    }
                                >
                                    <SimpleContainer
                                        className={
                                            isCurrent
                                                ? "lw-caseTimeline__timestampBadge lw-caseTimeline__timestampBadge--new"
                                                : isFuture
                                                    ? "lw-caseTimeline__timestampBadge lw-caseTimeline__timestampBadge--future"
                                                    : "lw-caseTimeline__timestampBadge"
                                        }
                                    >
                                        {isCurrent
                                            ? <TextBold12>{badgeText}</TextBold12>
                                            : <Text12>{badgeText}</Text12>
                                        }
                                    </SimpleContainer>
                                    <TextBold12>{stage.Text}</TextBold12>
                                </SimpleContainer>
                            </SimpleContainer>
                        );
                    })}
                </SimpleContainer>


            </SimpleContainer>
        </SimpleContainer>
    );
}
