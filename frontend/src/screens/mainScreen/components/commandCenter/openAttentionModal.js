import AttentionDetailsModal from "./AttentionDetailsModal";

export function openAttentionModal({
    attentionItems = [],
    openPopup,
    closePopup,
    pushPopup,
    popPopup,
    onDataChanged,
}) {
    if (!openPopup) return false;

    openPopup(
        <AttentionDetailsModal
            items={attentionItems}
            openPopup={openPopup}
            pushPopup={pushPopup}
            popPopup={popPopup}
            closePopup={closePopup}
            onEventChanged={() => onDataChanged?.()}
        />,
    );
    return true;
}
