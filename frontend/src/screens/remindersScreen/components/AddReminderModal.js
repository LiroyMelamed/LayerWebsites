import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import remindersApi from "../../../api/remindersApi";
import { formatDateTimeForInput, parseDateTimeInput, formatDateForInput, parseDateInput } from "../../../functions/date/formatDateForInput";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleTextArea from "../../../components/simpleComponents/SimpleTextArea";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import Skeleton from "../../../components/simpleComponents/Skeleton";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import ChooseButton from "../../../components/styledComponents/buttons/ChooseButton";
import { Text24, Text14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../../hooks/useHttpRequest";
import "./AddReminderModal.scss";

// Placeholders auto-filled by the system — no user input needed
const AUTO_FILLED = new Set(["client_name", "firm_name", "subject"]);

// Hebrew labels for each placeholder variable
const VAR_LABELS = {
    date: "תאריך",
    body: "תוכן ההודעה",
    case_title: "שם התיק",
    document_name: "שם המסמך",
    amount: "סכום",
    content_1: "תוכן 1",
    content_2: "תוכן 2",
    content_3: "תוכן 3",
};

/** Extract [[placeholder]] names from template subject+body */
function extractPlaceholders(template) {
    if (!template) return [];
    const raw = `${template.subject || ""} ${template.bodyHtml || template.body || ""}`;
    const matches = raw.match(/\[\[([^\]]+)\]\]/g) || [];
    const keys = [...new Set(matches.map((m) => m.slice(2, -2)))];
    return keys.filter((k) => !AUTO_FILLED.has(k));
}

export default function AddReminderModal({ closePopUpFunction, rePerformRequest }) {
    const { t } = useTranslation();

    const [clientName, setClientName] = useState("");
    const [email, setEmail] = useState("");
    const [subject, setSubject] = useState("");
    const [selectedTemplate, setSelectedTemplate] = useState("GENERAL");
    const [scheduledFor, setScheduledFor] = useState("");
    const [templateData, setTemplateData] = useState({});
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const { result: templatesResult, isPerforming: loadingTemplates } = useAutoHttpRequest(
        remindersApi.getTemplates,
        { onSuccess: () => { } },
    );

    const templates = useMemo(() => templatesResult?.templates || [], [templatesResult]);
    const templateItems = useMemo(
        () => templates.map((tpl) => ({ value: tpl.key, label: tpl.label })),
        [templates],
    );

    // Get the extra placeholders for the currently selected template
    const currentTemplate = useMemo(
        () => templates.find((tpl) => tpl.key === selectedTemplate),
        [templates, selectedTemplate],
    );
    const extraVars = useMemo(() => extractPlaceholders(currentTemplate), [currentTemplate]);

    const handleTemplateChange = (value) => {
        if (!value) return;
        setSelectedTemplate(value);
        setTemplateData({});
    };

    const handleVarChange = (key, value) => {
        setTemplateData((prev) => ({ ...prev, [key]: value }));
    };

    const { isPerforming: submitting, performRequest: doSubmit } = useHttpRequest(
        () =>
            remindersApi.createReminder({
                client_name: clientName,
                to_email: email,
                subject: subject || undefined,
                templateKey: selectedTemplate,
                scheduled_for: parseDateTimeInput(scheduledFor) ? new Date(parseDateTimeInput(scheduledFor)).toISOString() : scheduledFor,
                template_data: Object.keys(templateData).length > 0
                    ? Object.fromEntries(Object.entries(templateData).map(([k, v]) => [k, k === 'date' ? (parseDateInput(v) || v) : v]))
                    : undefined,
            }),
        () => {
            setSuccess(true);
            if (rePerformRequest) rePerformRequest();
        },
    );

    const handleSubmit = () => {
        setError("");
        if (!clientName.trim() || !email.trim() || !scheduledFor) {
            setError(t("reminders.add.error"));
            return;
        }
        doSubmit();
    };

    // Split extra vars into pairs for two-column rows (except "body" which gets full width)
    const varRows = useMemo(() => {
        const rows = [];
        const inlineVars = extraVars.filter((v) => v !== "body");
        for (let i = 0; i < inlineVars.length; i += 2) {
            rows.push(inlineVars.slice(i, i + 2));
        }
        return rows;
    }, [extraVars]);
    const hasBody = extraVars.includes("body");

    if (success) {
        return (
            <SimpleContainer className="lw-addReminder lw-addReminder--success">
                <SimpleContainer className="lw-addReminder__successIcon">✔</SimpleContainer>
                <Text24 className="lw-addReminder__title">{t("reminders.add.success")}</Text24>
                <SimpleContainer className="lw-addReminder__buttonsRow">
                    <PrimaryButton onPress={closePopUpFunction}>{t("common.close")}</PrimaryButton>
                </SimpleContainer>
            </SimpleContainer>
        );
    }

    return (
        <SimpleContainer className="lw-addReminder">
            <SimpleScrollView>
                <Text24 className="lw-addReminder__title">{t("reminders.add.title")}</Text24>

                {/* Row 1: Client name + Email */}
                <SimpleContainer className="lw-addReminder__row">
                    <SimpleInput
                        className="lw-addReminder__field"
                        title={t("reminders.add.clientName")}
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        timeToWaitInMilli={0}
                    />
                    <SimpleInput
                        className="lw-addReminder__field"
                        title={t("reminders.add.email")}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        timeToWaitInMilli={0}
                    />
                </SimpleContainer>

                {/* Row 2: Template selector */}
                <SimpleContainer className="lw-addReminder__row">
                    <SimpleContainer className="lw-addReminder__field">
                        {loadingTemplates ? (
                            <Skeleton width="100%" height={36} borderRadius={6} />
                        ) : (
                            <ChooseButton
                                buttonText={t("reminders.add.template")}
                                items={templateItems}
                                OnPressChoiceFunction={handleTemplateChange}
                                showAll={false}
                            />
                        )}
                    </SimpleContainer>
                </SimpleContainer>

                {/* Template description + body preview */}
                {(currentTemplate?.description || currentTemplate?.bodyPreview) && (
                    <SimpleContainer className="lw-addReminder__templateInfo">
                        {currentTemplate?.description && (
                            <Text14 className="lw-addReminder__templateDesc">{currentTemplate.description}</Text14>
                        )}
                        {currentTemplate?.bodyPreview && (
                            <SimpleContainer className="lw-addReminder__bodyPreview">
                                <Text14 className="lw-addReminder__bodyPreviewLabel">{t("reminders.import.bodyPreviewLabel")}</Text14>
                                <Text14 className="lw-addReminder__bodyPreviewText">{currentTemplate.bodyPreview}</Text14>
                            </SimpleContainer>
                        )}
                    </SimpleContainer>
                )}

                {/* Subject (only for GENERAL template) */}
                {selectedTemplate === "GENERAL" && (
                    <SimpleContainer className="lw-addReminder__row">
                        <SimpleInput
                            className="lw-addReminder__field"
                            title={t("reminders.add.subject")}
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            timeToWaitInMilli={0}
                        />
                    </SimpleContainer>
                )}

                {/* Template variables in two-column rows */}
                {varRows.map((pair, i) => (
                    <SimpleContainer key={`var-row-${i}`} className="lw-addReminder__row">
                        {pair.map((varKey) => (
                            <SimpleInput
                                key={varKey}
                                className="lw-addReminder__field"
                                title={VAR_LABELS[varKey] || varKey}
                                placeholder={varKey === "date" ? "dd/mm/yyyy" : undefined}
                                value={varKey === "date" ? (templateData[varKey] || "") : (templateData[varKey] || "")}
                                onChange={(e) => handleVarChange(varKey, e.target.value)}
                                timeToWaitInMilli={0}
                            />
                        ))}
                    </SimpleContainer>
                ))}

                {/* Body textarea (full width) */}
                {hasBody && (
                    <SimpleContainer className="lw-addReminder__row">
                        <SimpleTextArea
                            className="lw-addReminder__field"
                            title={VAR_LABELS.body}
                            value={templateData.body || ""}
                            onChange={(val) => handleVarChange("body", val)}
                            rows={3}
                        />
                    </SimpleContainer>
                )}

                {/* Scheduled date/time */}
                <SimpleContainer className="lw-addReminder__row">
                    <SimpleInput
                        className="lw-addReminder__field"
                        title={t("reminders.add.scheduledFor")}
                        placeholder="dd/mm/yyyy, HH:mm"
                        value={scheduledFor}
                        onChange={(e) => setScheduledFor(e.target.value)}
                        timeToWaitInMilli={0}
                    />
                </SimpleContainer>

                {error && <Text14 className="lw-addReminder__error">{error}</Text14>}

                <SimpleContainer className="lw-addReminder__buttonsRow">
                    <PrimaryButton onPress={handleSubmit} disabled={submitting}>
                        {submitting ? t("reminders.add.submitting") : t("reminders.add.submit")}
                    </PrimaryButton>
                    <SecondaryButton onPress={closePopUpFunction}>
                        {t("common.close")}
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
