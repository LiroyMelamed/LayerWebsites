import { useState } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SimpleInput from "../../../simpleComponents/SimpleInput";
import { TextBold12, TextBold14, Text12 } from "../../../specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../buttons/PrimaryButton";
import SecondaryButton from "../../buttons/SecondaryButton";
import { buttonSizes } from "../../../../styles/buttons/buttonSizes";
import SimpleLoader from "../../../simpleComponents/SimpleLoader";
import casesApi from "../../../../api/casesApi";
import { DateDDMMYY } from "../../../../functions/date/DateDDMMYY";

import "./LicenseExpiryUpdateModal.scss";

const INTERVALS = [
    { key: "4m", labelKey: "cases.licenseRenewal.months4" },
    { key: "3m", labelKey: "cases.licenseRenewal.months3" },
    { key: "2m", labelKey: "cases.licenseRenewal.months2" },
    { key: "1m", labelKey: "cases.licenseRenewal.months1" },
    { key: "2w", labelKey: "cases.licenseRenewal.weeks2" },
];

export default function LicenseExpiryUpdateModal({ fullCase, onDone, onClose }) {
    const { t } = useTranslation();
    const [step, setStep] = useState(1); // 1 = update expiry, 2 = reminder intervals
    const [newExpiry, setNewExpiry] = useState(
        fullCase.LicenseExpiryDate
            ? new Date(fullCase.LicenseExpiryDate).toISOString().slice(0, 10)
            : ""
    );
    const [selectedIntervals, setSelectedIntervals] = useState(["2w"]);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isCreatingReminders, setIsCreatingReminders] = useState(false);

    function toggleInterval(key) {
        setSelectedIntervals((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    }

    async function handleUpdateExpiry() {
        if (!newExpiry) return;
        setIsUpdating(true);
        try {
            await casesApi.updateCaseById(fullCase.CaseId, {
                ...fullCase,
                LicenseExpiryDate: newExpiry,
            });
            setStep(2);
        } catch (e) {
            console.error("Failed to update license expiry", e);
        } finally {
            setIsUpdating(false);
        }
    }

    function handleSkipExpiry() {
        setStep(2);
    }

    async function handleCreateReminders() {
        if (selectedIntervals.length === 0) {
            onDone?.();
            onClose?.();
            return;
        }
        setIsCreatingReminders(true);
        try {
            const expiryDate = newExpiry || (fullCase.LicenseExpiryDate ? new Date(fullCase.LicenseExpiryDate).toISOString().slice(0, 10) : null);
            if (expiryDate) {
                await casesApi.createLicenseReminders({
                    caseId: fullCase.CaseId,
                    licenseExpiryDate: expiryDate,
                    intervals: selectedIntervals,
                });
            }
            onDone?.();
            onClose?.();
        } catch (e) {
            console.error("Failed to create license reminders", e);
        } finally {
            setIsCreatingReminders(false);
        }
    }

    function handleNoReminders() {
        onDone?.();
        onClose?.();
    }

    if (step === 1) {
        return (
            <SimpleContainer className="lw-licenseExpiryModal">
                <TextBold14 className="lw-licenseExpiryModal__title">
                    {t("cases.licenseRenewal.title")}
                </TextBold14>

                <Text12 className="lw-licenseExpiryModal__question">
                    {t("cases.licenseRenewal.updateExpiryQuestion")}
                </Text12>

                {fullCase.LicenseExpiryDate && (
                    <SimpleContainer className="lw-licenseExpiryModal__current">
                        <TextBold12>{t("cases.licenseRenewal.currentExpiry")}:</TextBold12>
                        <Text12>{DateDDMMYY(fullCase.LicenseExpiryDate)}</Text12>
                    </SimpleContainer>
                )}

                <SimpleInput
                    className="lw-licenseExpiryModal__dateInput"
                    title={t("cases.licenseRenewal.newExpiry")}
                    type="date"
                    value={newExpiry}
                    onChange={(e) => setNewExpiry(e.target.value)}
                    inputSize="Medium"
                />

                <SimpleContainer className="lw-licenseExpiryModal__buttons">
                    {fullCase.LicenseExpiryDate && (
                        <SecondaryButton size={buttonSizes.SMALL} onPress={handleSkipExpiry}>
                            {t("cases.licenseRenewal.skip")}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        size={buttonSizes.SMALL}
                        onPress={handleUpdateExpiry}
                        isPerforming={isUpdating}
                        disabled={!newExpiry}
                    >
                        {isUpdating ? <SimpleLoader /> : t("cases.licenseRenewal.update")}
                    </PrimaryButton>
                </SimpleContainer>
            </SimpleContainer>
        );
    }

    // Step 2: reminder intervals
    return (
        <SimpleContainer className="lw-licenseExpiryModal">
            <TextBold14 className="lw-licenseExpiryModal__title">
                {t("cases.licenseRenewal.reminderTitle")}
            </TextBold14>

            <Text12 className="lw-licenseExpiryModal__question">
                {t("cases.licenseRenewal.reminderQuestion")}
            </Text12>

            <SimpleContainer className="lw-licenseExpiryModal__intervals">
                {INTERVALS.map(({ key, labelKey }) => (
                    <label key={key} className="lw-licenseExpiryModal__intervalOption">
                        <input
                            type="checkbox"
                            checked={selectedIntervals.includes(key)}
                            onChange={() => toggleInterval(key)}
                        />
                        <Text12>{t(labelKey)}</Text12>
                    </label>
                ))}
            </SimpleContainer>

            <SimpleContainer className="lw-licenseExpiryModal__buttons">
                <SecondaryButton size={buttonSizes.SMALL} onPress={handleNoReminders}>
                    {t("cases.licenseRenewal.noReminders")}
                </SecondaryButton>
                <PrimaryButton
                    size={buttonSizes.SMALL}
                    onPress={handleCreateReminders}
                    isPerforming={isCreatingReminders}
                    disabled={selectedIntervals.length === 0}
                >
                    {isCreatingReminders ? <SimpleLoader /> : t("cases.licenseRenewal.createReminders")}
                </PrimaryButton>
            </SimpleContainer>
        </SimpleContainer>
    );
}
