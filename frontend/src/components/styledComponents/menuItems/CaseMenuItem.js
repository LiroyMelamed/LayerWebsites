import { useState } from "react";
import { useTranslation } from 'react-i18next';
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { icons } from "../../../assets/icons/icons";
import ImageButton from "../../specializedComponents/buttons/ImageButton";
import { Text12, TextBold12, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";
import useHttpRequest from "../../../hooks/useHttpRequest";
import CaseMenuItemOpen from "./components/CaseMenuItemOpen";
import SimpleLoader from "../../simpleComponents/SimpleLoader";
import { usePopup } from "../../../providers/PopUpProvider";
import CaseFullView from "../cases/CaseFullView";
import casesApi from "../../../api/casesApi";

import "./CaseMenuItem.scss";

export default function CaseMenuItem({
    fullCase,
    rightTitle,
    rightPreSecondLine,
    rightValueSecondLine,
    valueColorRightSecondLine,

    leftPreFirstLine,
    leftValueFirstLine,
    valueColorLeftFirstLine,
    leftPreSecondLine,
    leftValueSecondLine,
    leftValueColorSecondLine,

    rePerformFunction,
    isClient = false,
    style
}) {
    const { t } = useTranslation();
    const { isPerforming: isPerformingSetCase, performRequest: setCase } = useHttpRequest(casesApi.updateStageById);
    const { openPopup, closePopup } = usePopup();
    const [fullCaseListener, setFullCaseListener] = useState(fullCase);
    const [isOpen, setIsOpen] = useState(false);

    function updateStage() {
        if (fullCaseListener.IsClosed) return;
        if (fullCaseListener.CurrentStage > fullCaseListener.Descriptions.length) return;

        const tempDescription = [...fullCaseListener.Descriptions];
        const curIdx = fullCaseListener.CurrentStage - 1;

        // Mark current stage as completed with timestamp
        tempDescription[curIdx] = { ...tempDescription[curIdx], Timestamp: new Date(), IsNew: false };

        const nextStage = fullCaseListener.CurrentStage + 1;
        const isAdvancingToLast = nextStage >= fullCaseListener.Descriptions.length;

        if (isAdvancingToLast) {
            // Advancing to the last stage → also mark it done and close the case
            const lastIdx = fullCaseListener.Descriptions.length - 1;
            if (lastIdx > curIdx) {
                tempDescription[lastIdx] = { ...tempDescription[lastIdx], Timestamp: new Date(), IsNew: false };
            }
            const updated = {
                ...fullCaseListener,
                CurrentStage: fullCaseListener.Descriptions.length,
                IsClosed: true,
                Descriptions: tempDescription
            };
            setFullCaseListener(updated);
            setCase(fullCaseListener.CaseId, updated);
        } else {
            // Normal advance — move to next stage
            tempDescription[nextStage - 1] = { ...tempDescription[nextStage - 1], IsNew: true };
            const updated = {
                ...fullCaseListener,
                CurrentStage: nextStage,
                Descriptions: tempDescription
            };
            setFullCaseListener(updated);
            setCase(fullCaseListener.CaseId, updated);
        }
    }

    return (
        <SimpleContainer className="lw-caseMenuItem">
            <SimpleContainer className="lw-caseMenuItem__header" onPress={() => setIsOpen(!isOpen)}>
                <ImageButton
                    src={icons.Button.DownArrow}
                    className={
                        "lw-caseMenuItem__toggle" + (isOpen ? " is-open" : "")
                    }
                />

                <SimpleContainer className="lw-caseMenuItem__content">
                    <SimpleContainer className="lw-caseMenuItem__row lw-caseMenuItem__row--top">
                        <SimpleContainer className="lw-caseMenuItem__title">
                            <TextBold14>
                                {rightTitle}
                            </TextBold14>
                        </SimpleContainer>

                        {leftValueFirstLine ? (
                            <SimpleContainer className="lw-caseMenuItem__pair lw-caseMenuItem__pair--caseType">
                                <TextBold12>{leftPreFirstLine}</TextBold12>
                                <Text12>{leftValueFirstLine}</Text12>
                            </SimpleContainer>
                        ) : null}
                    </SimpleContainer>

                    <SimpleContainer className="lw-caseMenuItem__row lw-caseMenuItem__row--bottom">
                        <SimpleContainer className="lw-caseMenuItem__pair lw-caseMenuItem__pair--grow">
                            <TextBold12>{rightPreSecondLine}</TextBold12>
                            {isPerformingSetCase ? (
                                <SimpleLoader />
                            ) : (
                                <Text12>
                                    {rightPreSecondLine === t('cases.currentStage') && fullCaseListener?.IsClosed
                                        ? t('cases.completedSuccessfully')
                                        : (fullCaseListener?.Descriptions?.[fullCaseListener?.CurrentStage - 1]?.Text || rightValueSecondLine)}
                                </Text12>
                            )}
                        </SimpleContainer>

                    </SimpleContainer>
                </SimpleContainer>


            </SimpleContainer>

            <CaseMenuItemOpen
                isOpen={isOpen}
                fullCase={fullCaseListener}
                updateStage={() => updateStage()}
                editCase={() => openPopup(<CaseFullView caseDetails={fullCaseListener} rePerformRequest={rePerformFunction} closePopUpFunction={closePopup} />)}
                isClient={isClient}
            />

        </SimpleContainer>
    );
}

