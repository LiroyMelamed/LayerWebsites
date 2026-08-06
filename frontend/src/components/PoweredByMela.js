import React from "react";

/**
 * Discreet "built by MelaMedia" attribution link.
 * Used at the bottom of the login screen and the app sidebar.
 */
export default function PoweredByMela({ style }) {
    return (
        <a
            href="https://mela-media.co.il"
            target="_blank"
            rel="noopener noreferrer"
            style={{
                display: "block",
                textAlign: "center",
                fontSize: 11,
                lineHeight: 1.4,
                color: "#A0AEC0",
                textDecoration: "none",
                padding: "10px 0 4px",
                opacity: 0.85,
                ...style,
            }}
        >
            נבנה ע״י <span style={{ color: "#4C6690", fontWeight: 700 }}>MelaMedia</span>
        </a>
    );
}
