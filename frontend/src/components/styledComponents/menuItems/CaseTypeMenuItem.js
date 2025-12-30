import { useState } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { icons } from "../../../assets/icons/icons";
import ImageButton from "../../specializedComponents/buttons/ImageButton";
import { Text12, TextBold12, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";
import useHttpRequest from "../../../hooks/useHttpRequest";
import SimpleLoader from "../../simpleComponents/SimpleLoader";
import { usePopup } from "../../../providers/PopUpProvider";
import CaseTypeMenuItemOpen from "./components/CaseTypeMenuItemOpen";
import CaseTypeFullView from "../cases/CaseTypeFullView";
import SecondaryButton from "../buttons/SecondaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import casesApi from "../../../api/casesApi";

import "./CaseTypeMenuItem.scss";

export default function CaseTypeMenuItem({
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
    style
}) {
    const { isPerforming: isPerformingSetCase } = useHttpRequest(casesApi.updateCaseById, () => { setCurrentStage(currentStage + 1) });
    const { openPopup, closePopup } = usePopup();
    const [isOpen, setIsOpen] = useState(false);
    const [currentStage, setCurrentStage] = useState(Number(rightValueSecondLine));

    return (
        <SimpleContainer className="lw-caseTypeMenuItem">
            <SimpleContainer className="lw-caseTypeMenuItem__header" onPress={() => setIsOpen(!isOpen)}>
                <SimpleContainer className="lw-caseTypeMenuItem__content">
                    <SimpleContainer className="lw-caseTypeMenuItem__row lw-caseTypeMenuItem__row--top">
                        <div className="lw-caseTypeMenuItem__title">
                            <TextBold14>{rightTitle}</TextBold14>
                        </div>

                        <SimpleContainer className="lw-caseTypeMenuItem__pair">
                            <TextBold12>{leftPreFirstLine}</TextBold12>
                            <Text12>{leftValueFirstLine}</Text12>
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer className="lw-caseTypeMenuItem__row lw-caseTypeMenuItem__row--bottom">
                        <SimpleContainer className="lw-caseTypeMenuItem__pair lw-caseTypeMenuItem__pair--grow">
                            <TextBold12>{rightPreSecondLine}</TextBold12>
                            {isPerformingSetCase ? (
                                <SimpleLoader />
                            ) : (
                                <Text12>{currentStage}</Text12>
                            )}
                        </SimpleContainer>

                        <SimpleContainer className="lw-caseTypeMenuItem__pair">
                            <TextBold12>
                                {leftPreSecondLine || (
                                    <SecondaryButton
                                        size={buttonSizes.SMALL}
                                        onPress={() =>
                                            openPopup(
                                                <CaseTypeFullView
                                                    caseTypeDetails={fullCase}
                                                    rePerformRequest={rePerformFunction}
                                                    closePopUpFunction={closePopup}
                                                />
                                            )
                                        }
                                        className="lw-caseTypeMenuItem__editButton"
                                    >
                                        עריכה
                                    </SecondaryButton>
                                )}
                            </TextBold12>
                            <Text12>{leftValueSecondLine}</Text12>
                        </SimpleContainer>
                    </SimpleContainer>
                </SimpleContainer>

                <ImageButton
                    src={icons.Button.DownArrow}
                    className="lw-caseTypeMenuItem__toggle"
                    style={styles.dropDownIcon(isOpen)}
                />
            </SimpleContainer>

            <CaseTypeMenuItemOpen
                isOpen={isOpen}
                caseType={fullCase}
                editCaseType={() => openPopup(<CaseTypeFullView caseTypeName={fullCase.CaseTypeName} rePerformRequest={rePerformFunction} closePopUpFunction={closePopup} />)}
            />

        </SimpleContainer>
    );
}

const styles = {
    dropDownIcon: (isOpen) => ({
        width: 12,
        height: 12,
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', // Rotate based on isOpen
        transition: 'transform 0.3s ease', // Smooth rotation transition
    }),
    openDataContainer: {
        overflow: 'hidden', // Hide content when not open
        transition: 'max-height 0.5s ease, opacity 0.5s ease', // Smooth transition for both maxHeight and opacity
        maxHeight: '0', // Start with 0 height
        opacity: 0, // Start with 0 opacity
        marginTop: 16,
        marginRight: 28,
    },
};
