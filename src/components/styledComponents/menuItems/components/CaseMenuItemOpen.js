import { useState } from "react";
import { buttonSizes } from "../../../../styles/buttons/buttonSizes";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../../../specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../buttons/PrimaryButton";
import SecondaryButton from "../../buttons/SecondaryButton";
import TertiaryButton from "../../buttons/TertiaryButton";
import Separator from "../../separators/Separator";
import useHttpRequest from "../../../../hooks/useHttpRequest";
import { casesApi } from "../../../../api/casesApi";
import SimpleLoader from "../../../simpleComponents/SimpleLoader";
import ProgressBar from "../../../specializedComponents/containers/ProgressBar";
import ImageButton from "../../../specializedComponents/buttons/ImageButton";
import { icons } from "../../../../assets/icons/icons";
import CaseTimeline from "../../cases/CaseTimeline";

export default function CaseMenuItemOpen({ fullCase, isOpen, updateStage, editCase }) {
    const { isPerforming: isPerformingSetCase, performRequest: setCase } = useHttpRequest(casesApi.updateCaseById);

    const [isStagesOpen, setIsStagesOpen] = useState(false)
    const [IsTagged, setIsTagged] = useState(fullCase.IsTagged)

    function unTag() {
        const temp = { ...fullCase, IsTagged: !IsTagged }
        setIsTagged(!IsTagged)
        setCase(fullCase.CaseName, temp)
    }

    return (
        <SimpleContainer
            style={{
                ...styles.openDataContainer,
                maxHeight: isOpen ? '700px' : '0', // Adjust maxHeight dynamically
                opacity: isOpen ? 1 : 0, // Fade effect
            }}
        >
            <ProgressBar currentStage={fullCase.CurrentStage} totalStages={fullCase.Stages} style={{ marginBottom: 20 }} />
            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                <TextBold12 style={{ flex: 1 }}>שם לקוח</TextBold12>
                <Text12 style={{ flex: 1 }}>{fullCase.CustomerName}</Text12>
            </SimpleContainer>

            <Separator />

            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                <TextBold12 style={{ flex: 1 }}>אימייל לקוח</TextBold12>
                <Text12 style={{ flex: 1 }}>{fullCase.CustomerMail}</Text12>
            </SimpleContainer>

            <Separator />

            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                <TextBold12 style={{ flex: 1 }}>מספר פלאפון</TextBold12>
                <Text12 style={{ flex: 1 }}>{fullCase.PhoneNumber}</Text12>
            </SimpleContainer>

            <Separator />

            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>

                <TextBold12 style={{ flex: 1 }}>נעוץ</TextBold12>
                {isPerformingSetCase ? <SimpleLoader /> : <Text12 style={{ flex: 1 }}>{IsTagged ? "כן" : "לא"}</Text12>}

            </SimpleContainer>

            <Separator />

            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                <ImageButton
                    src={icons.Button.DownArrow}
                    style={styles.dropDownIcon(isStagesOpen)}
                    onPress={() => setIsStagesOpen(!isStagesOpen)}
                />

                <TextBold12 style={{ flex: 1, }}>שלבים</TextBold12>
            </SimpleContainer>

            {isStagesOpen && <CaseTimeline stages={fullCase.Descriptions} />}


            <SimpleContainer style={{ display: 'flex', flexDirection: 'row', marginTop: 16 }}>
                <PrimaryButton size={buttonSizes.SMALL} onPress={updateStage} style={{ marginRight: 8 }}>עדכן שלב</PrimaryButton>
                <SecondaryButton size={buttonSizes.SMALL} onPress={editCase} style={{ marginRight: 8 }}>עריכה</SecondaryButton>
                <TertiaryButton size={buttonSizes.SMALL} onPress={unTag}>{IsTagged ? "ביטול נעיצה" : "נעץ"}</TertiaryButton>
            </SimpleContainer>
        </SimpleContainer>
    )
}

const styles = {
    dropDownIcon: (isOpen) => ({
        marginLeft: 8,
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