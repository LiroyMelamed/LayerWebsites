/** Shared popup stack helpers for command-center modals. */

export const POPUP_EMBEDDED_SCROLL_MARKERS = [
    'lw-commandCenter__attentionModal',
    'lw-commandCenter__drillDownModal',
    'lw-caseMenuModal',
    'lw-commandCenter__todayEventsModal',
];

export function popupContentUsesEmbeddedScroll(className) {
    if (typeof className !== 'string') return false;
    return POPUP_EMBEDDED_SCROLL_MARKERS.some((marker) => className.includes(marker));
}

/** Prefer push (stack navigation); fall back to root open. */
export function resolveShowPopup({ pushPopup, openPopup } = {}) {
    return pushPopup || openPopup || null;
}

/** Build handlers object passed into attention / drill-down flows. */
export function createPopupModalHandlers({
    openPopup,
    pushPopup,
    popPopup,
    closePopup,
    onDataChanged,
}) {
    return {
        openPopup,
        pushPopup,
        popPopup,
        closePopup,
        onDataChanged,
        onEventSaved: onDataChanged,
        onEventDeleted: onDataChanged,
    };
}
