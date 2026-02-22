import { useState } from "react";
import { useTranslation } from "react-i18next";
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
    const { t } = useTranslation();
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
            <TextBold12 className="lw-caseMenuItemOpen__modalTitle">{t("common.whatsapp.linkTitle")}</TextBold12>

            <SimpleInput
                className="lw-caseMenuItemOpen__modalInput"
                title={t("common.whatsapp.groupLink")}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputSize="Medium"
            />

            <SimpleContainer className="lw-caseMenuItemOpen__modalButtons">
                <SecondaryButton
                    size={buttonSizes.SMALL}
                    onPress={onClose}
                >
                    {t("common.cancel")}
                </SecondaryButton>

                <PrimaryButton
                    size={buttonSizes.SMALL}
                    onPress={handleSave}
                    isPerforming={isPerformingLinkCase}
                >
                    {isPerformingLinkCase ? t("common.saving") : t("common.save")}
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
    const { t } = useTranslation();
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
        // Use case manager's phone if available, fall back to office number
        const phone = fullCase.CaseManagerPhone
            ? String(fullCase.CaseManagerPhone).replace(/[^0-9]/g, '')
            : '97236565004';
        // Ensure phone has country code
        const e164Phone = phone.startsWith('972') ? phone : (phone.startsWith('0') ? '972' + phone.slice(1) : '972' + phone);
        openExternalUrl(
            `https://wa.me/${e164Phone}?text=${encodeURIComponent(t("common.whatsapp.contactText", { caseId: fullCase.CaseId }))}`,
            { newTab: true }
        );
    }

    return (
        <SimpleContainer
            className={"lw-caseMenuItemOpen" + (isOpen ? " is-open" : "")}
        >
            <SimpleContainer className="lw-caseMenuItemOpen__card">
                <SimpleContainer className="lw-caseMenuItemOpen__progressWrap">
                    <ProgressBar IsClosed={fullCase.IsClosed} currentStage={fullCase.CurrentStage} totalStages={totalStages} />
                </SimpleContainer>

                <SimpleContainer className="lw-caseMenuItemOpen__section">
                    <SimpleContainer className="lw-caseMenuItemOpen__accordionHeader" onPress={() => setIsStagesOpen(!isStagesOpen)}>
                        <ImageButton
                            src={icons.Button.DownArrow}
                            className={"lw-caseMenuItemOpen__dropDownBtn" + (isStagesOpen ? " is-open" : "")}
                        />
                        <TextBold12 className="lw-caseMenuItemOpen__sectionTitle">{t("common.stages")}</TextBold12>
                    </SimpleContainer>

                    {isStagesOpen && (
                        <SimpleContainer className="lw-caseMenuItemOpen__timelineWrap">
                            <CaseTimeline
                                stages={fullCase.Descriptions}
                                currentStage={fullCase.CurrentStage}
                                isClosed={fullCase.IsClosed}
                                createdAt={fullCase.CreatedAt}
                            />
                        </SimpleContainer>
                    )}
                </SimpleContainer>

                {/* Sections (mobile-first: stack) */}
                <SimpleContainer className="lw-caseMenuItemOpen__sections">

                    {/* <SimpleContainer className="lw-caseMenuItemOpen__section">
                        <TextBold12 className="lw-caseMenuItemOpen__sectionTitle">{t("common.customerDetails")}</TextBold12>

                        <SimpleContainer className="lw-caseMenuItemOpen__items">
                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">{t("cases.customerName") + ":"}</TextBold12>
                                <Text12 className="lw-caseMenuItemOpen__itemValue">
                                    {Array.isArray(fullCase.Users) && fullCase.Users.length > 0
                                        ? fullCase.Users.map(u => u.Name).filter(Boolean).join(', ')
                                        : fullCase.CustomerName}
                                </Text12>
                            </SimpleContainer>

                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">{t("common.email") + ":"}</TextBold12>
                                <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.CustomerMail}</Text12>
                            </SimpleContainer>

                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">{t("cases.phoneNumber") + ":"}</TextBold12>
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
                    </SimpleContainer> */}

                    <SimpleContainer className="lw-caseMenuItemOpen__section">
                        <TextBold12 className="lw-caseMenuItemOpen__sectionTitle">{t("common.management")}</TextBold12>

                        <SimpleContainer className="lw-caseMenuItemOpen__items">
                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">{t("cases.caseManager") + ":"}</TextBold12>
                                <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.CaseManager ? fullCase.CaseManager : t("common.unassigned")}</Text12>
                            </SimpleContainer>

                            {!isClient && (
                                <SimpleContainer className="lw-caseMenuItemOpen__item">
                                    <TextBold12 className="lw-caseMenuItemOpen__itemLabel">{t("taggedCases.pinned") + ":"}</TextBold12>
                                    <SimpleContainer className="lw-caseMenuItemOpen__itemValue">
                                        {isPerformingTagCase ? <SimpleLoader /> : <Text12>{IsTagged ? t("common.yes") : t("common.no")}</Text12>}
                                    </SimpleContainer>
                                </SimpleContainer>
                            )}

                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">{t("common.whatsapp.group")}</TextBold12>
                                <SimpleContainer className="lw-caseMenuItemOpen__itemValue">
                                    {WhatsappLink ? (
                                        <SimpleContainer className="lw-caseMenuItemOpen__whatsAppActions">
                                            <PrimaryButton size={buttonSizes.SMALL} onPress={openWhatsappGroupLink}>
                                                {t("common.whatsapp.goToGroup")}
                                            </PrimaryButton>
                                            {!isClient && (
                                                <SecondaryButton size={buttonSizes.SMALL} onPress={openWhatsappGroupModal}>
                                                    {t("common.whatsapp.editLink")}
                                                </SecondaryButton>
                                            )}
                                        </SimpleContainer>
                                    ) : !isClient ? (
                                        <SecondaryButton size={buttonSizes.SMALL} onPress={openWhatsappGroupModal}>
                                            {t("common.whatsapp.linkTitle")}
                                        </SecondaryButton>
                                    ) : (
                                        <SimpleButton className="lw-caseMenuItemOpen__linkButton" onPress={contactOnWhatsapp}>
                                            <Text12 className="lw-caseMenuItemOpen__positiveText">{t("common.whatsapp.contact")}</Text12>
                                        </SimpleButton>
                                    )}
                                </SimpleContainer>
                            </SimpleContainer>
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer className="lw-caseMenuItemOpen__section">
                        <TextBold12 className="lw-caseMenuItemOpen__sectionTitle">{t("common.dates")}</TextBold12>

                        <SimpleContainer className="lw-caseMenuItemOpen__items">
                            <SimpleContainer className="lw-caseMenuItemOpen__item">
                                <TextBold12 className="lw-caseMenuItemOpen__itemLabel">{t("cases.createdAt") + ":"}</TextBold12>
                                <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.CreatedAt ? DateDDMMYY(fullCase.CreatedAt) : t("common.notSpecified")}</Text12>
                            </SimpleContainer>

                            {(!isClient || fullCase.EstimatedCompletionDate) && (
                                <SimpleContainer className="lw-caseMenuItemOpen__item">
                                    <TextBold12 className="lw-caseMenuItemOpen__itemLabel">{t("cases.estimatedCompletionDate") + ":"}</TextBold12>
                                    <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.EstimatedCompletionDate ? DateDDMMYY(fullCase.EstimatedCompletionDate) : t("common.notSpecified")}</Text12>
                                </SimpleContainer>
                            )}

                            {(!isClient || fullCase.LicenseExpiryDate) && (
                                <SimpleContainer className="lw-caseMenuItemOpen__item">
                                    <TextBold12 className="lw-caseMenuItemOpen__itemLabel">{t("cases.licenseExpiryDate") + ":"}</TextBold12>
                                    <Text12 className="lw-caseMenuItemOpen__itemValue">{fullCase.LicenseExpiryDate ? DateDDMMYY(fullCase.LicenseExpiryDate) : t("common.notSpecified")}</Text12>
                                </SimpleContainer>
                            )}
                        </SimpleContainer>
                    </SimpleContainer>

                </SimpleContainer>

                {/* Footer actions */}
                {!isClient && (
                    <SimpleContainer className="lw-caseMenuItemOpen__footer">
                        <TertiaryButton size={buttonSizes.SMALL} onPress={unTag}>
                            {IsTagged ? t("taggedCases.unpin") : t("taggedCases.pin")}
                        </TertiaryButton>
                        <SecondaryButton size={buttonSizes.SMALL} onPress={editCase} className="lw-caseMenuItemOpen__action">
                            {t("common.edit")}
                        </SecondaryButton>
                        {!fullCase.IsClosed && (
                            <PrimaryButton size={buttonSizes.SMALL} onPress={updateStage} className="lw-caseMenuItemOpen__action">
                                {t("cases.advanceStage")}
                            </PrimaryButton>
                        )}
                    </SimpleContainer>
                )}
            </SimpleContainer>
        </SimpleContainer>
    )
}
