import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ApiUtils from "../../api/apiUtils";

/**
 * Resolves /n/:slug → external target (Waze / Maps / RSVP).
 */
export default function ShortNavRedirectScreen() {
    const { slug } = useParams();
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const safe = String(slug || "").trim();
            if (!/^[A-Za-z0-9_-]{6,16}$/.test(safe)) {
                if (!cancelled) setError("קישור לא תקין");
                return;
            }
            try {
                const res = await ApiUtils.get(`calendar/short-links/${encodeURIComponent(safe)}`);
                const url = res?.data?.url || res?.url || "";
                if (!url) {
                    if (!cancelled) setError("קישור לא נמצא");
                    return;
                }
                window.location.replace(url);
            } catch {
                if (!cancelled) setError("קישור לא נמצא");
            }
        })();
        return () => { cancelled = true; };
    }, [slug]);

    return (
        <div dir="rtl" style={{ padding: "2rem", fontFamily: "Heebo, Arial, sans-serif", textAlign: "center" }}>
            {error || "מעביר…"}
        </div>
    );
}
