import React, { useEffect, useRef } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../text/AllTextKindFile";
import { useTranslation } from 'react-i18next';

import "./ProgressBar.scss";

const ProgressBar = ({
    IsClosed,
    currentStage,
    totalStages,
    labelKey = 'cases.completedStagesLabel',
    showPercent = true,
    style: _style,
}) => {
    const { t } = useTranslation();
    const rootRef = useRef(null);

    const safeTotalStages = Number(totalStages) || 0;
    const safeCurrentStage = Number(currentStage) || 0;

    // Stage N of T → N/T percentage. Last stage = 100% and closed.
    const rawPercentage = safeTotalStages > 0
        ? (safeCurrentStage / safeTotalStages) * 100
        : 0;
    const percentage = Math.max(0, Math.min(100, rawPercentage));

    useEffect(() => {
        if (!rootRef.current) return;
        rootRef.current.style.setProperty('--lw-progressBar-percent', `${percentage}%`);
    }, [percentage]);

    return (
        <SimpleContainer ref={rootRef} className="lw-progressBar">
            <SimpleContainer className="lw-progressBar__labelRow">
                <TextBold12>{t(labelKey)}</TextBold12>
                <Text12>{safeCurrentStage}/{totalStages}</Text12>
                {showPercent && (
                    <Text12 className="lw-progressBar__percent">{Math.round(percentage)}%</Text12>
                )}
            </SimpleContainer>
            <SimpleContainer className="lw-progressBar__bar">
                <SimpleContainer className="lw-progressBar__fill" />
            </SimpleContainer>
        </SimpleContainer>
    );
};

export default ProgressBar;
