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
import SimpleInput from "../../../simpleComponents/SimpleInput";
import { DateDDMMYY } from "../../../../functions/date/DateDDMMYY";
import "./CaseMenuItemOpen.scss";

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
            className={"lw-caseMenuItemOpen" + (isOpen ? " is-open" : "")}
        >
            <div className="lw-caseMenuItemOpen__progressWrap">
                <ProgressBar IsClosed={fullCase.IsClosed} currentStage={fullCase.CurrentStage} totalStages={fullCase?.Descriptions?.length} />
            </div>

            {!isClient &&
                <>
                    <SimpleContainer className="lw-caseMenuItemOpen__row">
                        <TextBold12 className="lw-caseMenuItemOpen__cell">שם לקוח</TextBold12>
                        <Text12 className="lw-caseMenuItemOpen__cell">{fullCase.CustomerName}</Text12>
                    </SimpleContainer>
                    <Separator />

                    <SimpleContainer className="lw-caseMenuItemOpen__row">
                        <TextBold12 className="lw-caseMenuItemOpen__cell">אימייל לקוח</TextBold12>
                        <Text12 className="lw-caseMenuItemOpen__cell">{fullCase.CustomerMail}</Text12>
                    </SimpleContainer>

                    <Separator />

                    <SimpleContainer className="lw-caseMenuItemOpen__row">
                        <TextBold12 className="lw-caseMenuItemOpen__cell">מספר פלאפון</TextBold12>
                        <SimpleButton className="lw-caseMenuItemOpen__cell" onPress={() => { window.location.href = `tel:${fullCase.PhoneNumber}` }}>
                            <Text12 className="lw-caseMenuItemOpen__linkText">{fullCase.PhoneNumber}</Text12>
                        </SimpleButton>
                    </SimpleContainer>
                </>
            }

            <Separator />

            <SimpleContainer className="lw-caseMenuItemOpen__row">
                <TextBold12 className="lw-caseMenuItemOpen__cell">תאריך סיום משוער</TextBold12>
                <Text12 className="lw-caseMenuItemOpen__cell">{fullCase.EstimatedCompletionDate ? DateDDMMYY(fullCase.EstimatedCompletionDate) : 'לא צויין'}</Text12>
            </SimpleContainer>

            <Separator />


            <SimpleContainer className="lw-caseMenuItemOpen__row">
                <TextBold12 className="lw-caseMenuItemOpen__cell">תוקף רישיון</TextBold12>
                <Text12 className="lw-caseMenuItemOpen__cell">{fullCase.LicenseExpiryDate ? DateDDMMYY(fullCase.LicenseExpiryDate) : 'לא צויין'}</Text12>
            </SimpleContainer>

            <Separator />

            <SimpleContainer className="lw-caseMenuItemOpen__row is-centered">
                <TextBold12 className="lw-caseMenuItemOpen__cell">קבוצת וואטספ</TextBold12>
                {isPerformingLinkCase ?
                    <SimpleLoader />
                    :
                    IsPressedLink && !isClient ?
                        <SimpleContainer className="lw-caseMenuItemOpen__linkInputRow">
                            <SimpleInput
                                className="lw-caseMenuItemOpen__whatsAppInput"
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
                        <SimpleButton className="lw-caseMenuItemOpen__cell" onPress={WhatsappLink ? () => { window.location.href = `${WhatsappLink}` } : () => { !isClient ? setIsPressedLink(true) : window.location.href = `https://wa.me/972522595097?text=יוצר קשר בנוגע לתיק מספר ${fullCase.CaseId}` }}>
                            <Text12 className="lw-caseMenuItemOpen__positiveText" >{WhatsappLink ? 'למעבר לקבוצה' : !isClient ? 'לחץ לשיוך' : 'צור קשר'}</Text12>
                        </SimpleButton>

                }
            </SimpleContainer>

            <Separator />

            {!isClient &&
                <>
                    <SimpleContainer className="lw-caseMenuItemOpen__row">
                        <TextBold12 className="lw-caseMenuItemOpen__cell">נעוץ</TextBold12>
                        {isPerformingTagCase ? <SimpleLoader /> : <Text12 className="lw-caseMenuItemOpen__cell">{IsTagged ? "כן" : "לא"}</Text12>}
                    </SimpleContainer>

                    <Separator />
                </>
            }

            <SimpleContainer className="lw-caseMenuItemOpen__row">
                <TextBold12 className="lw-caseMenuItemOpen__cell">מנהל תיק</TextBold12>
                <Text12 className="lw-caseMenuItemOpen__cell">{fullCase.CaseManager ? fullCase.CaseManager : "לא משוייך"}</Text12>
            </SimpleContainer>

            <Separator />


            <SimpleContainer className="lw-caseMenuItemOpen__stagesHeader" onPress={() => setIsStagesOpen(!isStagesOpen)}>
                <ImageButton
                    src={icons.Button.DownArrow}
                    className={"lw-caseMenuItemOpen__dropDownBtn" + (isStagesOpen ? " is-open" : "")}
                />

                <TextBold12 className="lw-caseMenuItemOpen__cell">שלבים</TextBold12>
            </SimpleContainer>

            {isStagesOpen && <CaseTimeline stages={fullCase.Descriptions} currentStage={fullCase.CurrentStage} />}

            {!isClient &&
                <SimpleContainer className="lw-caseMenuItemOpen__actionsRow">
                    <TertiaryButton size={buttonSizes.SMALL} onPress={unTag}>{IsTagged ? "ביטול נעיצה" : "נעץ"}</TertiaryButton>
                    <SecondaryButton size={buttonSizes.SMALL} onPress={editCase} className="lw-caseMenuItemOpen__action">עריכה</SecondaryButton>
                    {!fullCase.IsClosed &&
                        <PrimaryButton size={buttonSizes.SMALL} onPress={updateStage} className="lw-caseMenuItemOpen__action">קדם שלב</PrimaryButton>
                    }
                </SimpleContainer>
            }
        </SimpleContainer>
    )
}
