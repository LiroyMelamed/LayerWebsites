import { useState } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { icons } from "../../../assets/icons/icons";
import ImageButton from "../../specializedComponents/buttons/ImageButton";
import { Text12, TextBold12, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";
import Separator from "../separators/Separator";
import TertiaryButton from "../buttons/TertiaryButton";
import SecondaryButton from "../buttons/SecondaryButton";
import PrimaryButton from "../buttons/PrimaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { casesApi } from "../../../api/casesApi";
import useHttpRequest from "../../../hooks/useHttpRequest";
import CaseMenuItemOpen from "./components/CaseMenuItemOpen";
import SimpleLoader from "../../simpleComponents/SimpleLoader";
import { usePopup } from "../../../providers/PopUpProvider";
import CaseFullView from "../cases/CaseFullView";

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
    style
}) {
    const { isPerforming: isPerformingSetCase, performRequest: setCase } = useHttpRequest(casesApi.updateCaseById, () => { setCurrentStage(currentStage + 1) });
    const { openPopup } = usePopup();
    const [fullCaseListener, setFullCaseListener] = useState(fullCase);
    const [isOpen, setIsOpen] = useState(false);
    const [currentStage, setCurrentStage] = useState(Number(rightValueSecondLine));

    console.log("fullCase", fullCase);

    function updateStage() {
        if (currentStage + 1 <= Number(fullCaseListener.Stages)) {
            const tempDescription = fullCaseListener.Descriptions;
            tempDescription[currentStage].Timestamp = new Date()
            setCase(fullCaseListener.CaseName, { ...fullCaseListener, CurrentStage: Number(currentStage + 1) })
            setFullCaseListener(oldCase => ({ ...oldCase, CurrentStage: Number(currentStage + 1), Descriptions: tempDescription }));
        }
    }

    return (
        <SimpleContainer style={{ overflow: null }}>
            <SimpleContainer style={styles.container}>
                <ImageButton
                    src={icons.Button.DownArrow}
                    style={styles.dropDownIcon(isOpen)}
                    onPress={() => setIsOpen(!isOpen)}
                />

                <SimpleContainer style={styles.innerContainer}>
                    <SimpleContainer style={styles.firstRow}>
                        <TextBold14 style={{ flex: 1 }}>{rightTitle}</TextBold14>
                        <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                            <TextBold12>{leftPreFirstLine}</TextBold12>
                            <Text12 style={{ marginRight: 4 }}>{leftValueFirstLine}</Text12>
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer style={styles.secondRow}>
                        <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                            <TextBold12>{rightPreSecondLine}</TextBold12>
                            {isPerformingSetCase ? <SimpleLoader style={{ marginRight: 4, width: null }} /> : <Text12 style={{ marginRight: 4 }}>{currentStage}</Text12>}
                        </SimpleContainer>
                        <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                            <TextBold12>{leftPreSecondLine}</TextBold12>
                            <Text12 style={{ marginRight: 4 }}>{leftValueSecondLine}</Text12>
                        </SimpleContainer>
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleContainer>

            <CaseMenuItemOpen
                isOpen={isOpen}
                fullCase={fullCaseListener}
                updateStage={updateStage}
                editCase={() => openPopup(<CaseFullView caseName={fullCaseListener.CaseName} rePerformRequest={rePerformFunction} />)}
            />

        </SimpleContainer>
    );
}

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
    },
    innerContainer: {
        marginRight: 16,
        flex: 1,
    },
    dropDownIcon: (isOpen) => ({
        width: 12,
        height: 12,
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', // Rotate based on isOpen
        transition: 'transform 0.3s ease', // Smooth rotation transition
    }),
    firstRow: {
        display: 'flex',
        flexDirection: 'row-reverse',
    },
    secondRow: {
        display: 'flex',
        flexDirection: 'row-reverse',
        marginTop: 8,
    },
    openDataContainer: {
        overflow: 'hidden', // Hide content when not open
        transition: 'max-height 0.5s ease, opacity 0.5s ease', // Smooth transition for both maxHeight and opacity
        maxHeight: '0', // Start with 0 height
        opacity: 0, // Start with 0 opacity
        marginTop: 16,
        marginRight: 28,
    },
};
