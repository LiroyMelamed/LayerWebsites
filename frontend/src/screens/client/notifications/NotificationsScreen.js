import { useState } from "react";

import { images } from "../../../assets/images/images";
import { notificationApi } from "../../../api/notificationApi";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import ProgressBar from "../../../components/specializedComponents/containers/ProgressBar";
import { Text12, TextBold12, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import TopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { ClientStackName } from "../../../navigation/ClientStack";
import { ClientMainScreenName } from "../clientMainScreen/ClientMainScreen";
import { getClientNavBarData } from "../../../components/navBars/data/ClientNavBarData";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../../hooks/useHttpRequest";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { useTranslation } from 'react-i18next';

import "./NotificationsScreen.scss";

export const NotificationsScreenName = "/Notifications";

function formatNotificationDate(createdAt) {
    if (!createdAt) return "";
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("he-IL", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function extractFirstUrl(text) {
    const raw = String(text ?? "");
    // Match a URL until whitespace; trim common trailing punctuation.
    const match = raw.match(/https?:\/\/[^\s]+/i);
    if (!match) return { message: raw, url: null };

    const url = match[0].replace(/[)\].,;]+$/g, "");
    const message = raw.replace(match[0], "").replace(/\s{2,}/g, " ").trim();
    return { message, url };
}

export default function NotificationsScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();

    const [notifications, setNotifications] = useState([]);
    const [error, setError] = useState(null);
    const [markingId, setMarkingId] = useState("");

    const onSuccessFetchNotifications = (data) => {
        const list = Array.isArray(data) ? data : [];
        const sorted = list.sort((a, b) => new Date(b.createdat) - new Date(a.createdat));
        setNotifications(sorted);
        setError(null);
    };

    const onFailureFetchNotifications = () => {
        setError(t('notifications.loadError'));
        setNotifications([]);
    };

    const {
        isPerforming: isFetching,
        performRequest: refetchNotifications,
    } = useAutoHttpRequest(notificationApi.getNotifications, {
        onSuccess: onSuccessFetchNotifications,
        onFailure: onFailureFetchNotifications,
    });

    const onSuccessMarkAsRead = (data) => {
        const updatedId = data?.NotificationId;
        if (!updatedId) {
            setMarkingId("");
            return;
        }

        setNotifications((prev) =>
            prev.map((notif) =>
                notif.notificationid === updatedId
                    ? { ...notif, isread: true }
                    : notif
            )
        );
        setMarkingId("");
    };

    const onFailureMarkAsRead = () => {
        setMarkingId("");
    };

    const { isPerforming: isMarkingAsRead, performRequest: markAsRead } = useHttpRequest(
        notificationApi.markNotificationAsRead,
        onSuccessMarkAsRead,
        onFailureMarkAsRead
    );

    const hasNotifications = notifications?.length > 0;

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground} className="lw-notificationsScreen">
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={ClientStackName + ClientMainScreenName}
                    GetNavBarData={getClientNavBarData}
                    isClient
                    chosenIndex={0}
                />
            )}

            <SimpleScrollView className="lw-notificationsScreen__scroll">

                <SimpleContainer className="lw-notificationsScreen__content">
                    {isFetching && !hasNotifications && !error && (
                        <SimpleContainer className="lw-notificationsScreen__loading">
                            <ProgressBar
                                IsClosed
                                currentStage={1}
                                totalStages={1}
                                labelKey="notifications.loading"
                                showPercent={false}
                            />
                            <Text12 className="lw-notificationsScreen__loadingText">{t('notifications.loading')}</Text12>
                        </SimpleContainer>
                    )}

                    {error && (
                        <SimpleContainer className="lw-notificationsScreen__error">
                            <Text12 className="lw-notificationsScreen__errorText">{error}</Text12>
                            <PrimaryButton
                                size={buttonSizes.MEDIUM}
                                onPress={refetchNotifications}
                                className="lw-notificationsScreen__retryButton"
                            >
                                {t('common.retry')}
                            </PrimaryButton>
                        </SimpleContainer>
                    )}

                    {!error && !isFetching && !hasNotifications && (
                        <SimpleContainer className="lw-notificationsScreen__empty">
                            <TextBold14 className="lw-notificationsScreen__emptyText">{t('notifications.empty')}</TextBold14>
                        </SimpleContainer>
                    )}

                    {!error && hasNotifications && (
                        <SimpleContainer className="lw-notificationsScreen__list">
                            {notifications.map((item) => {
                                const isRead = Boolean(item?.isread);
                                const isMarkingThis = isMarkingAsRead && markingId === item?.notificationid;
                                const { message: displayMessage, url: signingUrl } = extractFirstUrl(item?.message);

                                return (
                                    <SimpleCard
                                        key={item.notificationid}
                                        className={
                                            "lw-notificationsScreen__item" + (isRead ? " is-read" : "")
                                        }
                                    >
                                        <SimpleContainer className="lw-notificationsScreen__itemContent">
                                            {!isRead && <SimpleContainer className="lw-notificationsScreen__unreadDot" />}

                                            <SimpleContainer className="lw-notificationsScreen__text">
                                                <TextBold14
                                                    className="lw-notificationsScreen__title lw-textEllipsis"
                                                    shouldApplyClamping
                                                    numberOfLines={1}
                                                >
                                                    {item?.title || t('notifications.fallbackTitle')}
                                                </TextBold14>

                                                <Text12
                                                    className="lw-notificationsScreen__message"
                                                    shouldApplyClamping
                                                    numberOfLines={3}
                                                >
                                                    {displayMessage}
                                                </Text12>

                                                {Boolean(signingUrl) && (
                                                    <PrimaryButton
                                                        size={buttonSizes.SMALL}
                                                        className="lw-notificationsScreen__signLinkButton"
                                                        disabled={isRead}
                                                        onPress={() => {
                                                            if (isRead) return;
                                                            try {
                                                                window.location.assign(signingUrl);
                                                            } catch {
                                                                window.open(signingUrl, "_blank", "noopener,noreferrer");
                                                            }
                                                        }}
                                                    >
                                                        {t('notifications.goToSigning')}
                                                    </PrimaryButton>
                                                )}
                                            </SimpleContainer>
                                        </SimpleContainer>

                                        <SimpleContainer className="lw-notificationsScreen__footerRow">
                                            <TextBold12 className="lw-notificationsScreen__timestamp">
                                                {formatNotificationDate(item?.createdat)}
                                            </TextBold12>

                                            {!isRead && (
                                                <PrimaryButton
                                                    size={buttonSizes.SMALL}
                                                    onPress={() => {
                                                        setMarkingId(item.notificationid);
                                                        markAsRead(item.notificationid);
                                                    }}
                                                    isPerforming={isMarkingThis}
                                                    className="lw-notificationsScreen__markAsRead"
                                                >
                                                    {t('notifications.markAsRead')}
                                                </PrimaryButton>
                                            )}
                                        </SimpleContainer>
                                    </SimpleCard>
                                );
                            })}
                        </SimpleContainer>
                    )}

                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
