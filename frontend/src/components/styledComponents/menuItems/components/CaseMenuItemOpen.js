import { useState } from "react";
import { buttonSizes } from "../../../../styles/buttons/buttonSizes";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../../../specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../buttons/PrimaryButton";
import SecondaryButton from "../../buttons/SecondaryButton";
import TertiaryButton from "../../buttons/TertiaryButton";
import Separator from "../../separators/Separator";
import useHttpRequest from "../../../../hooks/useHttpRequest";
import SimpleLoader from "../../../simpleComponents/SimpleLoader";
import ProgressBar from "../../../specializedComponents/containers/ProgressBar";
import ImageButton from "../../../specializedComponents/buttons/ImageButton";
import { icons } from "../../../../assets/icons/icons";
import CaseTimeline from "../../cases/CaseTimeline";
import casesApi from "../../../../api/casesApi";
import SimpleButton from "../../../simpleComponents/SimpleButton";
import { colors } from "../../../../constant/colors";
import SimpleInput, { inputStyles } from "../../../simpleComponents/SimpleInput";
import { DateDDMMYY } from "../../../../functions/date/DateDDMMYY";

export default function CaseMenuItemOpen({ fullCase, isOpen, updateStage, editCase, isClient }) {
    const { isPerforming: isPerformingTagCase, performRequest: tagCase } = useHttpRequest(casesApi.tagCaseById);
    const { isPerforming: isPerformingLinkCase, performRequest: LinkCase } = useHttpRequest(casesApi.linkWhatsappGroup, onSuccessLink);

    const [isStagesOpen, setIsStagesOpen] = useState(false);
    const [IsTagged, setIsTagged] = useState(fullCase.IsTagged);
    const [IsPressedLink, setIsPressedLink] = useState(false);
    const [WhatsappLink, setWhatsappLink] = useState(fullCase.WhatsappGroupLink);

    function unTag() {
        setIsTagged(!IsTagged)
        tagCase(fullCase.CaseId, { IsTagged: !IsTagged })
    }

    function onSuccessLink() {
        setIsPressedLink(false)
    }

    function linkWhatsappGroup() {
        LinkCase(fullCase.CaseId, { WhatsappGroupLink: WhatsappLink })
    }

    return (
        <SimpleContainer
            style={{
                ...styles.openDataContainer,
                maxHeight: isOpen ? '1200px' : '0', // Adjust maxHeight dynamically
                opacity: isOpen ? 1 : 0, // Fade effect
            }}
        >
            <ProgressBar IsClosed={fullCase.IsClosed} currentStage={fullCase.CurrentStage} totalStages={fullCase?.Descriptions?.length} style={{ marginBottom: 20 }} />
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
                <SimpleButton style={{ flex: 1 }} onPress={() => { window.location.href = `tel:${fullCase.PhoneNumber}` }}>
                    <Text12 style={{ color: colors.primary }}>{fullCase.PhoneNumber}</Text12>
                </SimpleButton>
            </SimpleContainer>

            <Separator />

            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                <TextBold12 style={{ flex: 1 }}>תאריך סיום משוער</TextBold12>
                <Text12 style={{ flex: 1 }}>{fullCase.EstimatedCompletionDate ? DateDDMMYY(fullCase.EstimatedCompletionDate) : 'לא צויין'}</Text12>
            </SimpleContainer>

            <Separator />


            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                <TextBold12 style={{ flex: 1 }}>תוקף רישיון</TextBold12>
                <Text12 style={{ flex: 1 }}>{fullCase.LicenseExpiryDate ? DateDDMMYY(fullCase.LicenseExpiryDate) : 'לא צויין'}</Text12>
            </SimpleContainer>

            <Separator />

            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1, alignItems: 'center' }}>
                <TextBold12 style={{ flex: 1 }}>קבוצת וואטספ</TextBold12>
                {isPerformingLinkCase ?
                    <SimpleLoader />
                    :
                    IsPressedLink && !isClient ?
                        <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1, alignItems: 'center' }}>
                            <SimpleInput
                                style={styles.inputStyle}
                                title={"לינק לקבוצת הוואטספ"}
                                value={WhatsappLink}
                                onChange={(e) => setWhatsappLink(e.target.value)}
                                inputSize="Small"
                            />
                            <PrimaryButton
                                size={buttonSizes.SMALL}
                                onPress={linkWhatsappGroup}
                            >
                                שליחה
                            </PrimaryButton>
                        </SimpleContainer>
                        :
                        <SimpleButton style={{ flex: 1 }} onPress={WhatsappLink ? () => { window.location.href = `${WhatsappLink}` } : () => { !isClient ? setIsPressedLink(true) : window.location.href = `https://wa.me/972522595097?text=יוצר קשר בנוגע לתיק מספר ${fullCase.CaseId}` }}>
                            <Text12 style={{ color: colors.positive }} >{WhatsappLink ? 'למעבר לקבוצה' : !isClient ? 'לחץ לשיוך' : 'צור קשר'}</Text12>
                        </SimpleButton>

                }
            </SimpleContainer>

            <Separator />

            {!isClient &&
                <>
                    <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                        <TextBold12 style={{ flex: 1 }}>נעוץ</TextBold12>
                        {isPerformingTagCase ? <SimpleLoader /> : <Text12 style={{ flex: 1 }}>{IsTagged ? "כן" : "לא"}</Text12>}
                    </SimpleContainer>

                    <Separator />
                </>
            }

            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                <TextBold12 style={{ flex: 1 }}>מנהל תיק</TextBold12>
                <Text12 style={{ flex: 1 }}>{fullCase.CaseManager ? fullCase.CaseManager : "לא משוייך"}</Text12>
            </SimpleContainer>

            <Separator />


            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }} onPress={() => setIsStagesOpen(!isStagesOpen)}>
                <ImageButton
                    src={icons.Button.DownArrow}
                    style={styles.dropDownIcon(isStagesOpen)}
                />

                <TextBold12 style={{ flex: 1, }}>שלבים</TextBold12>
            </SimpleContainer>

            {isStagesOpen && <CaseTimeline stages={fullCase.Descriptions} currentStage={fullCase.CurrentStage} />}

            {!isClient &&
                <SimpleContainer style={{ display: 'flex', flexDirection: 'row', marginTop: 16 }}>
                    {!fullCase.IsClosed &&
                        <PrimaryButton size={buttonSizes.SMALL} onPress={updateStage} style={{ marginRight: 8 }}>קדם שלב</PrimaryButton>
                    }
                    <SecondaryButton size={buttonSizes.SMALL} onPress={editCase} style={{ marginRight: 8 }}>עריכה</SecondaryButton>
                    <TertiaryButton size={buttonSizes.SMALL} onPress={unTag}>{IsTagged ? "ביטול נעיצה" : "נעץ"}</TertiaryButton>
                </SimpleContainer>
            }
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
        flexDirection: 'column'
    },
    inputStyle: {
        margin: 0,
        marginLeft: 8,
    }
};