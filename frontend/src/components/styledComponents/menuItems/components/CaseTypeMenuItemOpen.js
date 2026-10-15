import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import CaseTypeTimeline from "../../cases/CaseTypeTimeline";
import { useTranslation } from 'react-i18next';

import "./CaseTypeMenuItemOpen.scss";

export default function CaseTypeMenuItemOpen({ caseType, isOpen, editCaseType }) {
    const { t } = useTranslation();

    return (
        <SimpleContainer className={isOpen ? "lw-caseTypeMenuItemOpen lw-caseTypeMenuItemOpen--open" : "lw-caseTypeMenuItemOpen"}>
            <CaseTypeTimeline stages={caseType?.Descriptions || []} title={t('cases.stageDetailsTitle')} />
        </SimpleContainer>
    )
}
