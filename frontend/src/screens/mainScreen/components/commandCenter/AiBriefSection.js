import { useTranslation } from "react-i18next";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold24 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { getIsraelGreetingKey } from "./commandCenterUtils";

function AiBriefIcon() {
    return (
        <svg
            className="lw-commandCenter__aiBriefIconSvg"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
        >
            <path
                d="M12 2l1.2 3.6L17 6.8l-3.6 1.2L12 12l-1.2-3.6L7 6.8l3.6-1.2L12 2zM5 14l.8 2.4L8.2 17l-2.4.8L5 20l-.8-2.2L1.8 17l2.4-.8L5 14zm14 0l.8 2.4 2.4.8-2.4.8-.8 2.2-.8-2.2-2.4-.8 2.4-.8.8-2.4z"
                fill="currentColor"
            />
        </svg>
    );
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function stripGreetingLine(line) {
    const trimmed = String(line || "").trim();
    if (/^(?:בוקר טוב|צהריים טובים|ערב טוב|לילה טוב|שלום)/i.test(trimmed)) {
        return "";
    }
    return trimmed;
}

function AiBriefBadge({ t }) {
    return (
        <SimpleContainer className="lw-commandCenter__aiBriefBadge" aria-label={t("managerHome.aiBriefLabel")}>
            <AiBriefIcon />
            <Text12 className="lw-commandCenter__aiBriefBadgeText">{t("managerHome.aiBriefLabel")}</Text12>
        </SimpleContainer>
    );
}

function renderAiBriefContent(t, lines, recommendations = []) {
    const contentLines = lines.map(stripGreetingLine).filter(Boolean);
    const displayLines = contentLines.length ? contentLines : lines;

    return (
        <>
            <SimpleContainer className="lw-commandCenter__aiBriefContent">
                {displayLines.map((line, idx) => (
                    <Text14
                        key={`ai-brief-${idx}`}
                        color={colors.SideBarSelected || colors.primary}
                    >
                        {line}
                    </Text14>
                ))}
            </SimpleContainer>
            {recommendations.length > 0 && (
                <SimpleContainer className="lw-commandCenter__aiRecommendations">
                    <Text12 color={colors.winter}>{t("managerHome.aiRecommendations")}</Text12>
                    <SimpleContainer className="lw-commandCenter__aiRecommendationsList">
                        {recommendations.map((rec, idx) => (
                            <Text14
                                key={`ai-rec-${idx}`}
                                color={colors.SideBarSelected || colors.primary}
                                className="lw-commandCenter__aiRecommendationItem"
                            >
                                {rec}
                            </Text14>
                        ))}
                    </SimpleContainer>
                </SimpleContainer>
            )}
        </>
    );
}

function renderBriefLines(t, brief) {
    if (!brief) {
        return (
            <Text14 color={colors.SideBarSelected || colors.primary}>
                {t("managerHome.subtitle")}
            </Text14>
        );
    }

    if (brief.key) {
        return (
            <Text14 color={colors.SideBarSelected || colors.primary}>
                {t(brief.key, brief.params || {})}
            </Text14>
        );
    }

    const lines = [];
    if (Array.isArray(brief.sentences)) {
        brief.sentences.forEach((s, idx) => {
            lines.push(
                <Text14
                    key={`brief-s-${idx}`}
                    color={colors.SideBarSelected || colors.primary}
                >
                    {t(s.key, s.params || {})}
                </Text14>
            );
        });
    }
    if (brief.todayNote) {
        lines.push(
            <Text14
                key="brief-today"
                color={colors.SideBarSelected || colors.primary}
            >
                {t(brief.todayNote.key, brief.todayNote.params || {})}
            </Text14>
        );
    }

    if (lines.length === 0) {
        return (
            <Text14 color={colors.SideBarSelected || colors.primary}>
                {t("managerHome.subtitle")}
            </Text14>
        );
    }

    return lines;
}

export function ManagerHomeGreeting({ managerName, isPerforming }) {
    const { t } = useTranslation();
    const greetingKey = getIsraelGreetingKey();

    if (isPerforming) {
        return (
            <SimpleContainer className="lw-commandCenter__greeting">
                <Skeleton width={220} height={28} borderRadius={6} />
            </SimpleContainer>
        );
    }

    return (
        <SimpleContainer className="lw-commandCenter__greeting">
            <TextBold24 color={colors.primary}>
                {managerName
                    ? t(`managerHome.greeting${capitalize(greetingKey)}Named`, { name: managerName })
                    : t(`managerHome.greeting${capitalize(greetingKey)}`)}
            </TextBold24>
        </SimpleContainer>
    );
}

export default function AiBriefSection({
    morningBrief,
    aiBrief,
    aiBriefEnabled = false,
    aiBriefLoading = false,
    settingsLoaded = true,
    isPerforming,
}) {
    const { t } = useTranslation();
    const isAiBrief = Boolean(aiBrief?.lines?.length);
    const showSkeleton = !settingsLoaded
        || isPerforming
        || (aiBriefEnabled && aiBriefLoading && !isAiBrief);

    if (aiBriefEnabled) {
        if (!showSkeleton && !isAiBrief) {
            return null;
        }

        const content = showSkeleton
            ? (
                <SimpleContainer className="lw-commandCenter__aiBriefSkeleton">
                    <Skeleton width="100%" height={16} borderRadius={4} />
                    <Skeleton width="92%" height={16} borderRadius={4} />
                    <Skeleton width="84%" height={16} borderRadius={4} />
                    <Skeleton width="76%" height={16} borderRadius={4} />
                </SimpleContainer>
            )
            : renderAiBriefContent(t, aiBrief.lines, aiBrief.recommendations || []);

        return (
            <SimpleContainer className="lw-commandCenter__aiBriefSparkle">
                <AiBriefBadge t={t} />
                <SimpleContainer className="lw-commandCenter__aiBriefSparkleRing">
                    <SimpleCard className="lw-commandCenter__aiBriefCard">
                        {content}
                    </SimpleCard>
                </SimpleContainer>
            </SimpleContainer>
        );
    }

    return null;
}
