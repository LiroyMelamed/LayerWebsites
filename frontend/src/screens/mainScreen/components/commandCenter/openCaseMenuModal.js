import CaseMenuModalLoader from "./CaseMenuModalLoader";
import { resolveShowPopup } from "../../../../utils/popupStackUtils";

export function openCaseMenuModal({
    caseId,
    caseName,
    openPopup,
    pushPopup,
    onSaved,
}) {
    const showPopup = resolveShowPopup({ pushPopup, openPopup });
    if ((!caseId && !caseName) || !showPopup) return false;

    showPopup(
        <CaseMenuModalLoader
            caseId={caseId}
            caseName={caseName}
            onDataChanged={() => onSaved?.()}
        />,
    );
    return true;
}
