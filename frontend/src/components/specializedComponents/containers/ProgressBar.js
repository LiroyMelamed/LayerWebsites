import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../text/AllTextKindFile";

const ProgressBar = ({ currentStage, totalStages, style }) => {
    const percentage = Math.min(100, (currentStage / totalStages) * 100);

    const containerStyles = {
        width: '100%',
        ...style
    };

    const barStyles = {
        position: 'relative',
        height: '10px',
        backgroundColor: '#e0e0e0', // Light gray background
        borderRadius: '5px',
        overflow: 'visible', // Allow overflow for tooltip
    };

    const fillStyles = {
        height: '100%',
        backgroundColor: '#3b82f6', // Blue fill color
        width: `${percentage}%`,
        transition: 'width 0.4s ease', // Smooth transition for fill
        borderRadius: '5px',
        position: 'relative',
    };

    const tooltipStyles = {
        position: 'absolute',
        top: '-10px', // Position below the progress bar
        left: `${percentage}%`, // Align tooltip based on progress percentage
        transform: percentage === 100 ? 'translateX(-100%)' : 'translateX(-50%)', // Adjust transform at 100%
        backgroundColor: '#1f2937', // Dark background for tooltip
        color: '#fff',
        padding: '8px 4px',
        borderRadius: '10000px',
        opacity: percentage > 0 ? 1 : 0, // Hide tooltip when progress is 0
        transition: 'left 0.4s ease, transform 0.4s ease', // Smooth transition for tooltip movement
    };

    return (
        <div style={containerStyles}>
            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', marginBottom: 20 }}>
                <TextBold12>התקדמות שלבים:</TextBold12>
                <Text12 style={{ marginRight: 4 }}>{currentStage}/{totalStages}</Text12>
            </SimpleContainer>
            <div style={barStyles}>
                <div style={fillStyles}></div>
                <Text12 style={{ ...tooltipStyles }}>
                    {Math.round(percentage)}%
                </Text12>
            </div>
        </div>
    );
};

export default ProgressBar;
