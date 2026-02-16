import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleTable from "../../components/simpleComponents/SimpleTable";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import { Text24, Text14 } from "../../components/specializedComponents/text/AllTextKindFile";
import ReminderMenuItem from "../../components/specializedComponents/menuItems/ReminderMenuItem";
import { images } from "../../assets/images/images";

import remindersApi from "../../api/remindersApi";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import ImportRemindersModal from "./components/ImportRemindersModal";
import ReminderDetailPopup from "./components/ReminderDetailPopup";
import { AdminStackName } from "../../navigation/AdminStack";
import { MainScreenName } from "../mainScreen/MainScreen";
import "./RemindersScreen.scss";

export const RemindersScreenName = "/RemindersScreen";

const STATUS_FILTERS = [
    { value: "PENDING", label: "pending" },
    { value: "SENT", label: "sent" },
    { value: "FAILED", label: "failed" },
    { value: "CANCELLED", label: "cancelled" },
];

function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function RemindersScreen() {
    const { t } = useTranslation();
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();

    const [statusFilter, setStatusFilter] = useState("ALL");
    const [page, setPage] = useState(1);
    const limit = 25;

    const fetchReminders = useCallback(async () => {
        return await remindersApi.listReminders({
            status: statusFilter === "ALL" ? undefined : statusFilter,
            page,
            limit,
        });
    }, [statusFilter, page]);

    const { result, isPerforming, performRequest } = useAutoHttpRequest(fetchReminders, {
        onSuccess: () => { },
    });

    // Re-fetch when filter or page changes
    useEffect(() => {
        performRequest();
    }, [statusFilter, page]);

    const reminders = useMemo(() => result?.reminders || [], [result]);
    const total = result?.total || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const { performRequest: cancelRequest } = useHttpRequest(
        remindersApi.cancelReminder,
        () => performRequest(),
    );

    const { performRequest: deleteRequest } = useHttpRequest(
        remindersApi.deleteReminder,
        () => performRequest(),
    );

    const handleFilterChange = useCallback((value) => {
        setStatusFilter(value || "ALL");
        setPage(1);
    }, []);

    const handleImport = useCallback(() => {
        openPopup(
            <ImportRemindersModal
                closePopUpFunction={closePopup}
                rePerformRequest={performRequest}
            />
        );
    }, [openPopup, closePopup, performRequest]);

    const handleRowClick = useCallback((_item, rowIndex) => {
        const reminder = reminders[rowIndex];
        if (!reminder) return;
        openPopup(
            <ReminderDetailPopup
                reminder={reminder}
                closePopUpFunction={closePopup}
                onCancel={(id) => { cancelRequest(id); }}
                onDelete={(id) => { deleteRequest(id); }}
                onUpdated={() => performRequest()}
            />
        );
    }, [reminders, openPopup, closePopup, cancelRequest]);

    // Responsive: fewer columns on small screens
    const tableTitles = useMemo(() => {
        if (isSmallScreen) {
            return [
                t("reminders.col.clientName"),
                t("reminders.col.scheduledFor"),
                t("reminders.col.status"),
            ];
        }
        return [
            t("reminders.col.clientName"),
            t("reminders.col.email"),
            t("reminders.col.template"),
            t("reminders.col.scheduledFor"),
            t("reminders.col.status"),
            t("reminders.col.sentAt"),
            t("reminders.col.actions"),
        ];
    }, [t, isSmallScreen]);

    const tableData = useMemo(() => {
        if (isSmallScreen) {
            return reminders.map((r) => ({
                Column0: r.client_name || "—",
                Column1: formatDate(r.scheduled_for),
                Column2: (
                    <SimpleContainer className={`lw-reminders__badge lw-reminders__badge--${(r.status || "").toLowerCase()}`}>
                        <Text14>{t(`reminders.status.${(r.status || "").toLowerCase()}`)}</Text14>
                    </SimpleContainer>
                ),
            }));
        }
        return reminders.map((r) => ({
            Column0: r.client_name || "—",
            Column1: r.to_email || "—",
            Column2: t(`reminders.col.templateKeys.${r.template_key}`, { defaultValue: r.template_key }) || "—",
            Column3: formatDate(r.scheduled_for),
            Column4: (
                <SimpleContainer className={`lw-reminders__badge lw-reminders__badge--${(r.status || "").toLowerCase()}`}>
                    <Text14>{t(`reminders.status.${(r.status || "").toLowerCase()}`)}</Text14>
                </SimpleContainer>
            ),
            Column5: r.sent_at ? formatDate(r.sent_at) : "—",
            Column6: r.status === "PENDING" ? (
                <SecondaryButton onPress={() => cancelRequest(r.id)}>
                    {t("reminders.cancel")}
                </SecondaryButton>
            ) : null,
        }));
    }, [reminders, t, cancelRequest, isSmallScreen]);

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName + MainScreenName}
                    GetNavBarData={getNavBarData}
                    chosenNavKey="reminders"
                />
            )}

            <SimpleScrollView>
                <SimpleContainer className="lw-reminders">
                    <SimpleCard className="lw-reminders__header">
                        <SimpleContainer className="lw-reminders__titleRow">
                            <Text24>{t("reminders.title")}</Text24>
                            <PrimaryButton onPress={handleImport}>
                                {t("reminders.importButton")}
                            </PrimaryButton>
                        </SimpleContainer>
                        <Text14 className="lw-reminders__subtitle">{t("reminders.subtitle")}</Text14>
                    </SimpleCard>

                    <ChooseButton
                        buttonText={t("reminders.statusFilter")}
                        items={STATUS_FILTERS.map((f) => ({
                            value: f.value,
                            label: t(`reminders.filter.${f.label}`),
                        }))}
                        OnPressChoiceFunction={handleFilterChange}
                    />

                    <SimpleCard className="lw-reminders__list">
                        <SimpleTable
                            titles={tableTitles}
                            data={tableData}
                            isLoading={isPerforming}
                            noDataMessage={t("reminders.empty")}
                            rePerformRequest={performRequest}
                            onRowClick={handleRowClick}
                            RowComponent={ReminderMenuItem}
                            CellTextComponent={Text14}
                        />

                        {!isPerforming && totalPages > 1 && (
                            <SimpleContainer className="lw-reminders__pagination">
                                <SecondaryButton
                                    disabled={page <= 1}
                                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    {t("reminders.prev")}
                                </SecondaryButton>
                                <Text14>
                                    {t("reminders.pageInfo", { page, totalPages })}
                                </Text14>
                                <SecondaryButton
                                    disabled={page >= totalPages}
                                    onPress={() => setPage((p) => p + 1)}
                                >
                                    {t("reminders.next")}
                                </SecondaryButton>
                            </SimpleContainer>
                        )}
                    </SimpleCard>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
