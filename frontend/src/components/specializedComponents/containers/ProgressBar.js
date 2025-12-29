import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../text/AllTextKindFile";

import "./ProgressBar.scss";

const ProgressBar = ({ IsClosed, currentStage, totalStages, style }) => {
    const CurrentStageAccordingToIsClosed = IsClosed ? currentStage : currentStage - 1;
    const percentage = Math.min(100, (CurrentStageAccordingToIsClosed / totalStages) * 100);

    const cssVars = {
        '--lw-progressBar-percent': `${percentage}%`,
        '--lw-progressBar-tooltipTransform': percentage === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
        '--lw-progressBar-tooltipOpacity': percentage > 0 ? 1 : 0,
    };

    const mergedStyle = style ? { ...cssVars, ...style } : cssVars;

    return (
        <div className="lw-progressBar" style={mergedStyle}>
            <SimpleContainer className="lw-progressBar__labelRow">
                <TextBold12>שלבים שהסתיימו:</TextBold12>
                <Text12>{CurrentStageAccordingToIsClosed}/{totalStages}</Text12>
            </SimpleContainer>
            <div className="lw-progressBar__bar">
                <Text12
                    className="lw-progressBar__tooltip"
                >
                    {Math.round(percentage)}%
                </Text12>
                <div className="lw-progressBar__fill" />
            </div>
        </div>
    );
};

export default ProgressBar;
