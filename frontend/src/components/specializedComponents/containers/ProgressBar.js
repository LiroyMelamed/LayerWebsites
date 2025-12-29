import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../text/AllTextKindFile";

import "./ProgressBar.scss";

const ProgressBar = ({ IsClosed, currentStage, totalStages, style }) => {
    const CurrentStageAccordingToIsClosed = IsClosed ? currentStage : currentStage - 1;
    const percentage = Math.min(100, (CurrentStageAccordingToIsClosed / totalStages) * 100);

    return (
        <div className="lw-progressBar" style={style}>
            <SimpleContainer className="lw-progressBar__labelRow">
                <TextBold12>שלבים שהסתיימו:</TextBold12>
                <Text12>{CurrentStageAccordingToIsClosed}/{totalStages}</Text12>
            </SimpleContainer>
            <div className="lw-progressBar__bar">
                <div className="lw-progressBar__fill" style={{ width: `${percentage}%` }} />
                <Text12
                    className="lw-progressBar__tooltip"
                    style={{
                        left: `${percentage}%`,
                        transform: percentage === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
                        opacity: percentage > 0 ? 1 : 0,
                    }}
                >
                    {Math.round(percentage)}%
                </Text12>
            </div>
        </div>
    );
};

export default ProgressBar;
