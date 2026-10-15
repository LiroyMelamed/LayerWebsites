import { useEffect, useState } from "react";
import casesApi from "../../../../api/casesApi";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { toastFromApiError } from "../../../../components/ui/showAppToast";
import CaseMenuModalShell from "./CaseMenuModalShell";

export default function CaseMenuModalLoader({ caseId, caseName, onDataChanged }) {
    const [fullCase, setFullCase] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                let res;
                if (caseId) {
                    res = await casesApi.getCaseById(caseId);
                } else if (caseName) {
                    res = await casesApi.getCaseByName(caseName);
                } else {
                    throw new Error("Case not found");
                }

                const nextCase = res?.data ?? res;
                if (cancelled) return;

                if (!nextCase || (!nextCase.CaseId && !nextCase.caseid)) {
                    throw new Error("Case not found");
                }

                setFullCase(nextCase);
            } catch (err) {
                if (cancelled) return;
                setFailed(true);
                toastFromApiError(err, "לא ניתן לפתוח את התיק");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [caseId, caseName]);

    if (fullCase) {
        return (
            <CaseMenuModalShell
                fullCase={fullCase}
                onDataChanged={onDataChanged}
            />
        );
    }

    if (failed) {
        return (
            <SimpleContainer className="lw-caseMenuModal lw-caseMenuModal--loading">
                <Skeleton width="100%" height={20} borderRadius={4} />
            </SimpleContainer>
        );
    }

    return (
        <SimpleContainer className="lw-caseMenuModal lw-caseMenuModal--loading">
            <Skeleton width="100%" height={24} borderRadius={6} />
            <Skeleton width="88%" height={16} borderRadius={4} />
            <Skeleton width="72%" height={120} borderRadius={8} />
        </SimpleContainer>
    );
}
