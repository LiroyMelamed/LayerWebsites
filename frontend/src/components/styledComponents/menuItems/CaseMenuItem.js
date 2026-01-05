import { useState } from "react";
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
    const { isPerforming: isPerformingSetCase, performRequest: setCase } = useHttpRequest(casesApi.updateStageById);
    const { openPopup, closePopup } = usePopup();
    const [fullCaseListener, setFullCaseListener] = useState(fullCase);
    const [isOpen, setIsOpen] = useState(false);

    function updateStage() {
        if (fullCaseListener.CurrentStage <= fullCaseListener.Descriptions.length) {
            const tempDescription = fullCaseListener.Descriptions;
            tempDescription[fullCaseListener.CurrentStage - 1].Timestamp = new Date();
            tempDescription[fullCaseListener.CurrentStage - 1].IsNew = false;

            if (fullCaseListener.CurrentStage + 1 <= fullCaseListener.Descriptions.length) {
                tempDescription[fullCaseListener.CurrentStage].IsNew = true
                setFullCaseListener(oldCase => ({ ...oldCase, CurrentStage: fullCaseListener.CurrentStage + 1, Descriptions: tempDescription }));
            }

            if (fullCaseListener.CurrentStage === fullCaseListener.Descriptions.length) {
                if (!fullCaseListener.IsClosed) {
                    setFullCaseListener(oldCase => ({ ...oldCase, CurrentStage: fullCaseListener.CurrentStage, IsClosed: true, Descriptions: tempDescription }));
                    setCase(fullCaseListener.CaseId, { ...fullCaseListener, CurrentStage: fullCaseListener.CurrentStage, IsClosed: true, Descriptions: tempDescription })
                }
            } else {
                setCase(fullCaseListener.CaseId, { ...fullCaseListener, CurrentStage: fullCaseListener.CurrentStage + 1, Descriptions: tempDescription })
            }
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
                            <TextBold14 className="lw-textEllipsis" shouldApplyClamping numberOfLines={1}>
                                {rightTitle}
                            </TextBold14>
                        </SimpleContainer>

                        <SimpleContainer className="lw-caseMenuItem__pair">
                            <TextBold12>{leftPreFirstLine}</TextBold12>
                            <Text12>{leftValueFirstLine}</Text12>
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer className="lw-caseMenuItem__row lw-caseMenuItem__row--bottom">
                        <SimpleContainer className="lw-caseMenuItem__pair lw-caseMenuItem__pair--grow">
                            <TextBold12>{rightPreSecondLine}</TextBold12>
                            {isPerformingSetCase ? (
                                <SimpleLoader />
                            ) : (
                                <Text12>{fullCaseListener.Descriptions[fullCaseListener.CurrentStage - 1].Text}</Text12>
                            )}
                        </SimpleContainer>

                        <SimpleContainer className="lw-caseMenuItem__pair">
                            <TextBold12>{leftPreSecondLine}</TextBold12>
                            <Text12>{leftValueSecondLine}</Text12>
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

