import React, { useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import remindersApi from "../../../api/remindersApi";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import ChooseButton from "../../../components/styledComponents/buttons/ChooseButton";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { Text24, Text14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../../hooks/useHttpRequest";
import "./ImportRemindersModal.scss";

export default function ImportRemindersModal({ closePopUpFunction, rePerformRequest }) {
    const { t } = useTranslation();

    const [file, setFile] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState("GENERAL");
    const [sendHour, setSendHour] = useState("09");
    const [sendMinute, setSendMinute] = useState("00");
    const fileInputRef = useRef(null);

    // Fetch templates on mount
    const { result: templatesResult, isPerforming: loadingTemplates } = useAutoHttpRequest(
        remindersApi.getTemplates,
        { onSuccess: () => { } },
    );

    const templates = useMemo(() => templatesResult?.templates || [], [templatesResult]);

    const templateItems = useMemo(
        () => templates.map((tpl) => ({ value: tpl.key, label: tpl.label, description: tpl.description, bodyPreview: tpl.bodyPreview })),
        [templates],
    );

    const selectedTpl = useMemo(() => {
        return templateItems.find((i) => i.value === selectedTemplate);
    }, [templateItems, selectedTemplate]);

    const selectedTemplateDescription = selectedTpl?.description || '';
    const selectedBodyPreview = selectedTpl?.bodyPreview || '';

    // Upload handler
    const { result: uploadResult, isPerforming: uploading, performRequest: doUpload } = useHttpRequest(
        () => remindersApi.importReminders(file, selectedTemplate, Number(sendHour), Number(sendMinute)),
        (data) => { if (rePerformRequest) rePerformRequest(); },
    );

    const hasUploadResult = uploadResult?.created != null;

    const handleFileChange = useCallback((e) => {
        setFile(e.target.files?.[0] || null);
    }, []);

    const maxDetails = 20;

    return (
        <SimpleContainer className="lw-importReminders">
            <Text24>{t("reminders.import.title")}</Text24>
            <Text14 className="lw-importReminders__instructions">
                {t("reminders.import.instructions")}
            </Text14>

            {/* Template selector */}
            <SimpleContainer className="lw-importReminders__field">
                {loadingTemplates ? (
                    <SimpleLoader />
                ) : (
                    <ChooseButton
                        buttonText={t("reminders.import.templateLabel")}
                        items={templateItems}
                        OnPressChoiceFunction={(value) => value && setSelectedTemplate(value)}
                        showAll={false}
                    />
                )}
                {selectedTemplateDescription && (
                    <Text14 className="lw-importReminders__templateDesc">{selectedTemplateDescription}</Text14>
                )}
                {selectedBodyPreview && (
                    <SimpleContainer className="lw-importReminders__bodyPreview">
                        <Text14 className="lw-importReminders__bodyPreviewLabel">{t("reminders.import.bodyPreviewLabel")}</Text14>
                        <Text14 className="lw-importReminders__bodyPreviewText">{selectedBodyPreview}</Text14>
                    </SimpleContainer>
                )}
            </SimpleContainer>

            {/* Send time HH:MM */}
            <SimpleContainer className="lw-importReminders__field lw-importReminders__field--row">
                <Text14>{t("reminders.import.sendTimeLabel")}</Text14>
                <SimpleContainer className="lw-importReminders__timeRow">
                    <input
                        type="number"
                        min="0"
                        max="23"
                        value={sendHour}
                        onChange={(e) => setSendHour(e.target.value.padStart(2, "0").slice(-2))}
                        className="lw-importReminders__timeInput"
                        placeholder="HH"
                    />
                    <Text14 className="lw-importReminders__timeSep">:</Text14>
                    <input
                        type="number"
                        min="0"
                        max="59"
                        value={sendMinute}
                        onChange={(e) => setSendMinute(e.target.value.padStart(2, "0").slice(-2))}
                        className="lw-importReminders__timeInput"
                        placeholder="MM"
                    />
                </SimpleContainer>
            </SimpleContainer>

            {/* File picker + demo download */}
            <SimpleContainer className="lw-importReminders__field">
                <Text14>{t("reminders.import.fileLabel")}</Text14>
                <SimpleContainer className="lw-importReminders__fileRow">
                    <SimpleContainer className="lw-importReminders__filePicker">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileChange}
                            className="lw-importReminders__fileInputHidden"
                        />
                        <SecondaryButton onPress={() => fileInputRef.current?.click()}>
                            {t("reminders.import.chooseFile")}
                        </SecondaryButton>
                        {file && (
                            <Text14 className="lw-importReminders__fileName">{file.name}</Text14>
                        )}
                    </SimpleContainer>
                    <a
                        href={`${process.env.PUBLIC_URL}/templates/reminders-demo.xlsx`}
                        download="reminders-demo.xlsx"
                        className="lw-importReminders__demoLink"
                    >
                        <SecondaryButton onPress={() => { }}>
                            {t("reminders.import.downloadDemo")}
                        </SecondaryButton>
                    </a>
                </SimpleContainer>
            </SimpleContainer>

            {/* Result summary — only after a real upload response */}
            {hasUploadResult && (
                <SimpleContainer className="lw-importReminders__result">
                    <Text14>{t("reminders.import.resultTitle")}</Text14>
                    <Text14>
                        {t("reminders.import.created")}: {uploadResult.created}
                        {" | "}
                        {t("reminders.import.skipped")}: {uploadResult.skipped}
                        {" | "}
                        {t("reminders.import.failed")}: {uploadResult.failed}
                    </Text14>

                    {uploadResult.details?.length > 0 && (
                        <SimpleContainer className="lw-importReminders__details">
                            <Text14>{t("reminders.import.detailsTitle")}</Text14>
                            {uploadResult.details.slice(0, maxDetails).map((d, i) => (
                                <Text14 key={i} className={`lw-importReminders__detail lw-importReminders__detail--${d.status}`}>
                                    {t("reminders.import.row")} {d.row}: {d.clientName}
                                    {d.email ? ` (${d.email})` : ""}
                                    {d.date ? ` → ${new Date(d.date).toLocaleDateString("he-IL")}` : ""}
                                    {" — "}
                                    {t(`reminders.import.status${d.status.charAt(0).toUpperCase() + d.status.slice(1)}`)}
                                    {d.reason ? ` (${d.reason})` : ""}
                                </Text14>
                            ))}
                            {uploadResult.details.length > maxDetails && (
                                <Text14>{t("reminders.import.andMore", { count: uploadResult.details.length - maxDetails })}</Text14>
                            )}
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            )}

            {uploading && <SimpleLoader />}

            <SimpleContainer className="lw-importReminders__actions">
                <PrimaryButton onPress={doUpload} disabled={!file || uploading}>
                    {uploading ? t("reminders.import.uploading") : t("reminders.import.uploadButton")}
                </PrimaryButton>
                <SecondaryButton onPress={closePopUpFunction}>
                    {t("common.close")}
                </SecondaryButton>
            </SimpleContainer>
        </SimpleContainer>
    );
}
