import { useTranslation } from "react-i18next";
import CaseMenuItem from "../../../../components/styledComponents/menuItems/CaseMenuItem";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import { TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { caseMenuTitle } from "../../../../functions/cases/caseMenuTitle";

export default function CaseMenuModalShell({ fullCase, onDataChanged }) {
    const { t } = useTranslation();

    if (!fullCase) return null;

    return (
        <SimpleContainer className="lw-caseMenuModal">
            <SimpleContainer className="lw-caseMenuModal__header">
                <TextBold18 color={colors.primary} numberOfLines={2}>
                    {caseMenuTitle(fullCase)}
                </TextBold18>
            </SimpleContainer>
            <SimpleContainer className="lw-caseMenuModal__body">
                <CaseMenuItem
                    alwaysExpanded
                    fullCase={fullCase}
                    rightTitle={caseMenuTitle(fullCase)}
                    leftPreFirstLine={t("cases.caseType")}
                    leftValueFirstLine={fullCase.CaseTypeName}
                    rightPreSecondLine={t("cases.currentStage")}
                    rightValueSecondLine={
                        fullCase.IsClosed
                            ? t("cases.ended")
                            : fullCase.CurrentStage
                    }
                    rePerformFunction={onDataChanged}
                />
            </SimpleContainer>
        </SimpleContainer>
    );
}
