import React from "react";

import appleCalendarIcon from "../../../assets/images/calendar-invite/apple-calendar.png";
import googleCalendarIcon from "../../../assets/images/calendar-invite/google-calendar.png";
import googleMapsIcon from "../../../assets/images/calendar-invite/google-maps.png";
import wazeIcon from "../../../assets/images/calendar-invite/waze.png";

function BrandIcon({ src, size = 26, className = "" }) {
    return (
        <img
            src={src}
            alt=""
            width={size}
            height={size}
            className={["lw-calendarInvite__brandIcon", className].filter(Boolean).join(" ")}
            aria-hidden="true"
            draggable={false}
        />
    );
}

export function GoogleCalendarIcon({ size = 26 }) {
    return <BrandIcon src={googleCalendarIcon} size={size} />;
}

export function AppleCalendarIcon({ size = 26 }) {
    return <BrandIcon src={appleCalendarIcon} size={size} />;
}

export function WazeIcon({ size = 26 }) {
    return <BrandIcon src={wazeIcon} size={size} />;
}

export function GoogleMapsIcon({ size = 26 }) {
    return <BrandIcon src={googleMapsIcon} size={size} />;
}

export function InviteIconButton({
    label,
    onPress,
    disabled = false,
    className = "",
    children,
}) {
    return (
        <button
            type="button"
            className={["lw-calendarInvite__iconBtn", className].filter(Boolean).join(" ")}
            onClick={onPress}
            disabled={disabled}
            aria-label={label}
            title={label}
        >
            {children}
        </button>
    );
}
