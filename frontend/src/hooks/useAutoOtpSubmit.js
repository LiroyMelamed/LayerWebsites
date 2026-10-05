import { useEffect, useRef, useState } from "react";

// Submit a completed code once. A failed attempt stays editable without a retry loop.
export default function useAutoOtpSubmit({ enabled, scope, code, verify, onVerified, onError }) {
    const current = useRef(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        const state = { active: true, busy: false, last: null };
        current.current = state;
        setBusy(false);
        return () => { state.active = false; };
    }, [scope, enabled]);
    useEffect(() => {
        const state = current.current;
        if (code.length !== 6) { state.last = null; return; }
        if (!enabled || !state.active || state.busy || state.last === code) return;
        state.last = code;
        state.busy = true;
        setBusy(true);
        (async () => {
            try {
                const result = await verify(code);
                if (!state.active) return;
                if (!(result?.success || result?.status === 200) || result?.data?.verified !== true) {
                    throw new Error(result?.data?.message || 'הקוד שגוי או פג תוקף. תקנו את הקוד ונסו שוב.');
                }
                onVerified(result.data);
            } catch (error) {
                if (state.active) onError(error.message || 'האימות נכשל. נסו שוב.');
            } finally {
                state.busy = false;
                if (state.active) setBusy(false);
            }
        })();
    }, [enabled, code, scope, verify, onVerified, onError]);
    return busy;
}
