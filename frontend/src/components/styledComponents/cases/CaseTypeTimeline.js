import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../../specializedComponents/text/AllTextKindFile";
import SimpleScrollView from "../../simpleComponents/SimpleScrollView";
import { useTranslation } from "react-i18next";

import "./CaseTypeTimeline.scss";

export default function CaseTypeTimeline({ stages = [], title, style: _style }) {
    const { t } = useTranslation();
    return (
        <SimpleScrollView className="lw-caseTypeTimeline">
            <SimpleContainer className="lw-caseTypeTimeline__container">
                <SimpleContainer className="lw-caseTypeTimeline__verticalLine" />

                <SimpleContainer className="lw-caseTypeTimeline__dotsContainer">
                    {Array.isArray(stages) && stages.length > 0 ? (
                        stages.map((stage, index) => (
                            <SimpleContainer key={index} className="lw-caseTypeTimeline__stage">
                                <SimpleContainer
                                    className={
                                        stage.New
                                            ? "lw-caseTypeTimeline__dotWrap lw-caseTypeTimeline__dotWrap--new"
                                            : "lw-caseTypeTimeline__dotWrap"
                                    }
                                >
                                    <SimpleContainer className="lw-caseTypeTimeline__dot" />
                                </SimpleContainer>

                                <SimpleContainer
                                    className={
                                        stage.New
                                            ? "lw-caseTypeTimeline__stageDetails lw-caseTypeTimeline__stageDetails--new"
                                            : "lw-caseTypeTimeline__stageDetails"
                                    }
                                >
                                    <SimpleContainer
                                        className={
                                            stage.New
                                                ? "lw-caseTypeTimeline__timestampBadge lw-caseTypeTimeline__timestampBadge--new"
                                                : "lw-caseTypeTimeline__timestampBadge"
                                        }
                                    >
                                        {stage.New ? (
                                            <TextBold12>{t('cases.ended')}</TextBold12>
                                        ) : (
                                            <Text12>{stage.Timestamp || t('cases.stageNumber', { number: index + 1 })}</Text12>
                                        )}
                                    </SimpleContainer>
                                    <TextBold12>{stage.Text}</TextBold12>
                                </SimpleContainer>
                            </SimpleContainer>
                        ))
                    ) : (
                        <TextBold12 className="lw-caseTypeTimeline__empty">
                            {t('cases.noStagesInCaseType')}
                        </TextBold12>
                    )}
                </SimpleContainer>
            </SimpleContainer>
        </SimpleScrollView>
    );
}
