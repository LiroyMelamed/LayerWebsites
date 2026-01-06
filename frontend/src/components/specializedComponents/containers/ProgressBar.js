import React, { useEffect, useRef } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../text/AllTextKindFile";

import "./ProgressBar.scss";

const ProgressBar = ({ IsClosed, currentStage, totalStages, style: _style }) => {
    const rootRef = useRef(null);

    const CurrentStageAccordingToIsClosed = IsClosed ? currentStage : currentStage - 1;
    const safeTotalStages = Number(totalStages) || 0;
    const safeCurrentStage = Number(CurrentStageAccordingToIsClosed) || 0;
    const rawPercentage = safeTotalStages > 0 ? (safeCurrentStage / safeTotalStages) * 100 : 0;
    const percentage = Math.max(0, Math.min(100, rawPercentage));

    useEffect(() => {
        if (!rootRef.current) return;
        rootRef.current.style.setProperty('--lw-progressBar-percent', `${percentage}%`);
    }, [percentage]);

    return (
        <SimpleContainer ref={rootRef} className="lw-progressBar">
            <SimpleContainer className="lw-progressBar__labelRow">
                <TextBold12>שלבים שהסתיימו:</TextBold12>
                <Text12>{CurrentStageAccordingToIsClosed}/{totalStages}</Text12>
                <Text12 className="lw-progressBar__percent">{Math.round(percentage)}%</Text12>
            </SimpleContainer>
            <SimpleContainer className="lw-progressBar__bar">
                <SimpleContainer className="lw-progressBar__fill" />
            </SimpleContainer>
        </SimpleContainer>
    );
};

export default ProgressBar;
