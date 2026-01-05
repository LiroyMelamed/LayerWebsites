import { useState } from "react";
import { buttonSizes } from "../../../../styles/buttons/buttonSizes";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import { Text12, TextBold12 } from "../../../specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../buttons/PrimaryButton";
import SecondaryButton from "../../buttons/SecondaryButton";
import TertiaryButton from "../../buttons/TertiaryButton";
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
import { usePopup } from "../../../../providers/PopUpProvider";
import { openExternalUrl } from "../../../../utils/externalNavigation";
import "./CaseMenuItemOpen.scss";

function WhatsappGroupLinkModal({
    caseId,
    initialValue,
    onClose,
    onSaved,
}) {
    const [value, setValue] = useState(initialValue || "");

    const { isPerforming: isPerformingLinkCase, performRequest: LinkCase } = useHttpRequest(
        casesApi.linkWhatsappGroup,
        () => {
            onSaved?.(value);
            onClose?.();
        }
    );

    const handleSave = () => {
        LinkCase(caseId, { WhatsappGroupLink: value });
    };

    return (
        <SimpleContainer className="lw-caseMenuItemOpen__whatsAppModal">
            <TextBold12 className="lw-caseMenuItemOpen__modalTitle">שיוך קבוצת וואטספ</TextBold12>

            <SimpleInput
                className="lw-caseMenuItemOpen__modalInput"
                title={"לינק לקבוצת הוואטספ"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputSize="Medium"
            />

            <SimpleContainer className="lw-caseMenuItemOpen__modalButtons">
                <SecondaryButton
                    size={buttonSizes.SMALL}
                    onPress={onClose}
                >
                    ביטול
                </SecondaryButton>

                <PrimaryButton
                    size={buttonSizes.SMALL}
                    onPress={handleSave}
                    isPerforming={isPerformingLinkCase}
                >
                    {isPerformingLinkCase ? "שומר..." : "שמור"}
                </PrimaryButton>
            </SimpleContainer>

            {isPerformingLinkCase && (
                <SimpleContainer className="lw-caseMenuItemOpen__modalLoader">
                    <SimpleLoader />
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}

export default function CaseMenuItemOpen({ fullCase, isOpen, updateStage, editCase, isClient }) {
    const { isPerforming: isPerformingTagCase, performRequest: tagCase } = useHttpRequest(casesApi.tagCaseById);
    const { openPopup, closePopup } = usePopup();

    const [isStagesOpen, setIsStagesOpen] = useState(false);
    const [IsTagged, setIsTagged] = useState(fullCase.IsTagged);
    const [WhatsappLink, setWhatsappLink] = useState(fullCase.WhatsappGroupLink);

    function unTag() {
        setIsTagged(!IsTagged)
        tagCase(fullCase.CaseId, { IsTagged: !IsTagged })
    }

    const totalStages = fullCase?.Descriptions?.length || 0;

    function openWhatsappGroupModal() {
        openPopup(
            <WhatsappGroupLinkModal
                caseId={fullCase.CaseId}
                initialValue={WhatsappLink}
                onSaved={(newValue) => setWhatsappLink(newValue)}
                onClose={closePopup}
            />
        );
    }

    function openWhatsappGroupLink() {
        if (!WhatsappLink) return;
        openExternalUrl(String(WhatsappLink), { newTab: true });
    }

    function contactOnWhatsapp() {
        openExternalUrl(`https://wa.me/972522595097?text=יוצר קשר בנוגע לתיק מספר ${fullCase.CaseId}`, { newTab: true });
    }

    return (
        <SimpleContainer
            className={"lw-caseMenuItemOpen" + (isOpen ? " is-open" : "")}
        >
            <SimpleContainer className="lw-caseMenuItemOpen__card">
                <SimpleContainer className="lw-caseMenuItemOpen__progressWrap">
                    <ProgressBar IsClosed={fullCase.IsClosed} currentStage={fullCase.CurrentStage} totalStages={totalStages} />
                </SimpleContainer>

                {/* Sections (mobile-first: stack) */}
                <SimpleContainer className="lw-caseMenuItemOpen__sections">
                    {!isClient && (
                        <SimpleContainer className="lw-caseMenuItemOpen__section">
                            <TextBold12 className="lw-caseMenuItemOpen__sectionTitle">פרטי לקוח</TextBold12>

                            <SimpleContainer className="lw-caseMenuItemOpen__items">
                                <SimpleContainer className="lw-caseMenuItemOpen__item">
                                    <TextBold12 className="lw-caseMenuItemOpen__itemLabel">שם לקוח:</TextBold12>
                                    <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.CustomerName}</Text12>
                                </SimpleContainer>

                                <SimpleContainer className="lw-caseMenuItemOpen__item">
                                    <TextBold12 className="lw-caseMenuItemOpen__itemLabel">אימייל:</TextBold12>
                                    <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.CustomerMail}</Text12>
                                </SimpleContainer>

                                <SimpleContainer className="lw-caseMenuItemOpen__item">
                                    <TextBold12 className="lw-caseMenuItemOpen__itemLabel">טלפון:</TextBold12>
                                    <SimpleContainer className="lw-caseMenuItemOpen__itemValue">
                                        <SimpleButton
                                            className="lw-caseMenuItemOpen__linkButton"
                                            onPress={() => {
                                                openExternalUrl(`tel:${fullCase.PhoneNumber}`, { newTab: false });
                                            }}
                                        >
                                            <Text12 className="lw-caseMenuItemOpen__linkText">{fullCase.PhoneNumber}</Text12>
                                        </SimpleButton>
                                    </SimpleContainer>
                                </SimpleContainer>
                            </SimpleContainer>
                        </SimpleContainer>
                    )}

                    <SimpleContainer className="lw-caseMenuItemOpen__section">
                        <TextBold12 className="lw-caseMenuItemOpen__sectionTitle">תאריכים</TextBold12>

                        <SimpleContainer className="lw-caseMenuItemOpen__items">
                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">תאריך סיום משוער:</TextBold12>
                                <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.EstimatedCompletionDate ? DateDDMMYY(fullCase.EstimatedCompletionDate) : "לא צויין"}</Text12>
                            </SimpleContainer>

                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">תוקף רישיון:</TextBold12>
                                <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.LicenseExpiryDate ? DateDDMMYY(fullCase.LicenseExpiryDate) : "לא צויין"}</Text12>
                            </SimpleContainer>
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer className="lw-caseMenuItemOpen__section">
                        <TextBold12 className="lw-caseMenuItemOpen__sectionTitle">ניהול</TextBold12>

                        <SimpleContainer className="lw-caseMenuItemOpen__items">
                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">מנהל תיק:</TextBold12>
                                <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.CaseManager ? fullCase.CaseManager : "לא משוייך"}</Text12>
                            </SimpleContainer>

                            {!isClient && (
                                <SimpleContainer className="lw-caseMenuItemOpen__item">
                                    <TextBold12 className="lw-caseMenuItemOpen__itemLabel">נעוץ:</TextBold12>
                                    <SimpleContainer className="lw-caseMenuItemOpen__itemValue">
                                        {isPerformingTagCase ? <SimpleLoader /> : <Text12>{IsTagged ? "כן" : "לא"}</Text12>}
                                    </SimpleContainer>
                                </SimpleContainer>
                            )}

                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">קבוצת וואטספ</TextBold12>
                                <SimpleContainer className="lw-caseMenuItemOpen__itemValue">
                                    {WhatsappLink ? (
                                        <SimpleContainer className="lw-caseMenuItemOpen__whatsAppActions">
                                            <PrimaryButton size={buttonSizes.SMALL} onPress={openWhatsappGroupLink}>
                                                למעבר לקבוצה
                                            </PrimaryButton>
                                            {!isClient && (
                                                <SecondaryButton size={buttonSizes.SMALL} onPress={openWhatsappGroupModal}>
                                                    עריכת לינק
                                                </SecondaryButton>
                                            )}
                                        </SimpleContainer>
                                    ) : !isClient ? (
                                        <SecondaryButton size={buttonSizes.SMALL} onPress={openWhatsappGroupModal}>
                                            שיוך קבוצת וואטספ
                                        </SecondaryButton>
                                    ) : (
                                        <SimpleButton className="lw-caseMenuItemOpen__linkButton" onPress={contactOnWhatsapp}>
                                            <Text12 className="lw-caseMenuItemOpen__positiveText">צור קשר</Text12>
                                        </SimpleButton>
                                    )}
                                </SimpleContainer>
                            </SimpleContainer>
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer className="lw-caseMenuItemOpen__section">
                        <SimpleContainer className="lw-caseMenuItemOpen__accordionHeader" onPress={() => setIsStagesOpen(!isStagesOpen)}>
                            <ImageButton
                                src={icons.Button.DownArrow}
                                className={"lw-caseMenuItemOpen__dropDownBtn" + (isStagesOpen ? " is-open" : "")}
                            />
                            <TextBold12 className="lw-caseMenuItemOpen__sectionTitle">שלבים</TextBold12>
                        </SimpleContainer>

                        {isStagesOpen && (
                            <SimpleContainer className="lw-caseMenuItemOpen__timelineWrap">
                                <CaseTimeline stages={fullCase.Descriptions} currentStage={fullCase.CurrentStage} />
                            </SimpleContainer>
                        )}
                    </SimpleContainer>
                </SimpleContainer>

                {/* Footer actions */}
                {!isClient && (
                    <SimpleContainer className="lw-caseMenuItemOpen__footer">
                        <TertiaryButton size={buttonSizes.SMALL} onPress={unTag}>
                            {IsTagged ? "ביטול נעיצה" : "נעץ"}
                        </TertiaryButton>
                        <SecondaryButton size={buttonSizes.SMALL} onPress={editCase} className="lw-caseMenuItemOpen__action">
                            עריכה
                        </SecondaryButton>
                        {!fullCase.IsClosed && (
                            <PrimaryButton size={buttonSizes.SMALL} onPress={updateStage} className="lw-caseMenuItemOpen__action">
                                קדם שלב
                            </PrimaryButton>
                        )}
                    </SimpleContainer>
                )}
            </SimpleContainer>
        </SimpleContainer>
    )
}
