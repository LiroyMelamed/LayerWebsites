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

export default function CaseMenuItemOpen({fullCase, isOpen, updateStage, editCase}) {
    const { isPerforming: isPerformingSetCase, performRequest: setCase } = useHttpRequest(casesApi.updateCaseById);

    const [IsTagged, setIsTagged] = useState(fullCase.IsTagged)

    function unTag() {
        const temp = {...fullCase, IsTagged: !IsTagged}
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
                <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                    <TextBold12 style={{ flex: 1 }}>שם לקוח</TextBold12>
                    <Text12 style={{ flex: 1 }}>{fullCase.CustomerName}</Text12>
                </SimpleContainer>

                <Separator/>

                <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                    <TextBold12 style={{ flex: 1 }}>ת.ז לקוח</TextBold12>
                    <Text12 style={{ flex: 1 }}>{fullCase.CostumerTaz}</Text12>
                </SimpleContainer>

                <Separator/>

                <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                    <TextBold12 style={{ flex: 1 }}>מספר פלאפון</TextBold12>
                    <Text12 style={{ flex: 1 }}>{fullCase.PhoneNumber}</Text12>
                </SimpleContainer>

                <Separator/>

                <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>

                    <TextBold12 style={{ flex: 1 }}>נעוץ</TextBold12>
                    {isPerformingSetCase ? <SimpleLoader /> : <Text12 style={{ flex: 1 }}>{IsTagged ? "כן" : "לא"}</Text12>}
                
                </SimpleContainer>

                <Separator/>

        <SimpleContainer style={{display:'flex', flexDirection:'row', marginTop:16}}>
            <PrimaryButton size={buttonSizes.SMALL} onPress={updateStage} style={{marginRight:8}}>עדכן שלב</PrimaryButton>
            <SecondaryButton size={buttonSizes.SMALL} onPress={editCase} style={{marginRight:8}}>עריכה</SecondaryButton>
            <TertiaryButton size={buttonSizes.SMALL} onPress={unTag}>ביטול נעיצה</TertiaryButton>
        </SimpleContainer>
    </SimpleContainer>
    )
}

const styles = {
    openDataContainer: {
        overflow: 'hidden', // Hide content when not open
        transition: 'max-height 0.5s ease, opacity 0.5s ease', // Smooth transition for both maxHeight and opacity
        maxHeight: '0', // Start with 0 height
        opacity: 0, // Start with 0 opacity
        marginTop: 16,
        marginRight: 28,
    },
};