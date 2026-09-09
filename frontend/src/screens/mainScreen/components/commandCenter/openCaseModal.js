import casesApi from "../../../../api/casesApi";
import CaseFullView from "../../../../components/styledComponents/cases/CaseFullView";
import { toastFromApiError } from "../../../../components/ui/showAppToast";

/**
 * Open a case in CaseFullView without leaving the current page.
 */
export async function openCaseModal({
    caseId,
    openPopup,
    closePopup,
    onSaved,
}) {
    if (!caseId || !openPopup || !closePopup) return false;

    try {
        const res = await casesApi.getCaseById(caseId);
        const caseDetails = res?.data ?? res;
        if (!caseDetails || (!caseDetails.CaseId && !caseDetails.caseid)) {
            throw new Error("Case not found");
        }

        openPopup(
            <CaseFullView
                caseDetails={caseDetails}
                rePerformRequest={() => onSaved?.()}
                closePopUpFunction={closePopup}
            />
        );
        return true;
    } catch (err) {
        toastFromApiError(err, "לא ניתן לפתוח את התיק");
        return false;
    }
}
