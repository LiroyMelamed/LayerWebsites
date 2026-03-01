// Utilities for opening external links safely when the app is embedded in an iframe.
// Goal: open in a new tab when possible, and avoid breaking when top window is cross-origin.

function getTopWindowSafe() {
    try {
        if (typeof window !== "undefined" && window.top) return window.top;
    } catch {
        // window.top might be cross-origin; fall back.
    }
    return typeof window !== "undefined" ? window : null;
}

export function openExternalUrl(url, { newTab = true } = {}) {
    const u = String(url || "").trim();
    if (!u) return;

    const win = getTopWindowSafe() || window;

    // For protocols like tel/mailto: prefer same-window navigation.
    const isProtocol = /^(tel:|mailto:)/i.test(u);
    if (isProtocol || !newTab) {
        try {
            // Try to break out of iframe if possible.
            if (win && win.location) {
                win.location.href = u;
                return;
            }
        } catch {
            // ignore
        }
        try {
            window.location.href = u;
        } catch {
            // ignore
        }
        return;
    }

    // Standard external URL: attempt to open from top window.
    // NOTE: with "noopener,noreferrer" window.open() returns null even on
    // success, so we must NOT check the return value to decide whether the
    // open worked.  Instead we rely on the fact that if open() does not
    // throw, the tab was created.
    try {
        win?.open?.(u, "_blank", "noopener,noreferrer");
        return;                 // opened successfully — stop here
    } catch {
        // cross-origin top window or popup blocked — try current window
    }

    try {
        window?.open?.(u, "_blank", "noopener,noreferrer");
        return;
    } catch {
        // ignore
    }

    // Last resort: same-window navigation.
    try {
        window.location.href = u;
    } catch {
        // ignore
    }
}
