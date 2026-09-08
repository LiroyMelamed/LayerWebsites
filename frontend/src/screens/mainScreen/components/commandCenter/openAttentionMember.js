import {
    enrichAttentionMember,
    isAttentionCalendarItem,
    isAttentionSigningItem,
    resolveAttentionCaseId,
    resolveAttentionCaseName,
    resolveAttentionEventId,
    resolveAttentionSigningFileId,
} from "./attentionDisplayUtils";
import { openCalendarEventModal } from "./openCalendarEventModal";
import { openCaseMenuModal } from "./openCaseMenuModal";
import { openSigningFileModal } from "./openSigningFileModal";

/**
 * Open a single attention member inside the popup stack (case / signing / event).
 */
export async function openAttentionMember(member, modalHandlers = {}) {
    const item = enrichAttentionMember(member);
    const { pushPopup, closePopup, popPopup, onDataChanged } = modalHandlers;

    if (!pushPopup) return false;

    if (isAttentionSigningItem(item)) {
        const signingFileId = resolveAttentionSigningFileId(item);
        if (signingFileId) {
            return openSigningFileModal({
                signingFileId,
                pushPopup,
                closePopup,
                onChanged: onDataChanged,
            });
        }
    }

    if (isAttentionCalendarItem(item)) {
        const eventId = resolveAttentionEventId(item);
        if (eventId) {
            return openCalendarEventModal({
                eventId,
                pushPopup,
                popPopup,
                closePopup,
                onSaved: onDataChanged,
                onDeleted: onDataChanged,
            });
        }
    }

    const caseId = resolveAttentionCaseId(item);
    const caseName = resolveAttentionCaseName(item);
    if (caseId || caseName) {
        return openCaseMenuModal({
            caseId,
            caseName,
            pushPopup,
            onSaved: onDataChanged,
        });
    }

    return false;
}
