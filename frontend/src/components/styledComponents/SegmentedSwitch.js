import React from "react";
import "./SegmentedSwitch.scss";

export default function SegmentedSwitch({
    options = [],
    value,
    onChange,
    title,
    className = "",
    ariaLabel,
}) {
    if (!Array.isArray(options) || options.length === 0) return null;

    const handleSelect = (next) => {
        if (next === value) return;
        if (typeof onChange === "function") onChange(next);
    };

    return (
        <div className={`lw-segmentedSwitch ${className}`.trim()}>
            {title && (
                <div className="lw-segmentedSwitch__title">{title}</div>
            )}
            <div
                className="lw-segmentedSwitch__track"
                role="radiogroup"
                aria-label={ariaLabel || title || undefined}
            >
                {options.map((opt) => {
                    const isActive = opt.value === value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            className={`lw-segmentedSwitch__option${isActive ? " is-active" : ""}`}
                            onClick={() => handleSelect(opt.value)}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
