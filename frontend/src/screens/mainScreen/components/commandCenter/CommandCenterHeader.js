import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text14, TextBold24 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { getIsraelGreetingKey } from "./commandCenterUtils";

export default function CommandCenterHeader({
    managerName,
    morningBrief,
    aiBrief,
    aiBriefEnabled = false,
    aiBriefLoading = false,
    isPerforming,
}) {
    const { t } = useTranslation();
    const greetingKey = getIsraelGreetingKey();

    const showBriefSkeleton = isPerforming || (aiBriefEnabled && aiBriefLoading && !aiBrief);

    return (
        <SimpleContainer className="lw-commandCenter__header">
            {isPerforming ? (
                <>
                    <Skeleton width={220} height={28} borderRadius={6} />
                    <Skeleton width={320} height={16} borderRadius={4} />
                </>
            ) : (
                <>
                    <TextBold24 color={colors.primary}>
                        {managerName
                            ? t(`managerHome.greeting${capitalize(greetingKey)}Named`, { name: managerName })
                            : t(`managerHome.greeting${capitalize(greetingKey)}`)}
                    </TextBold24>
                    <SimpleContainer className="lw-commandCenter__briefLines">
                        {showBriefSkeleton ? (
                            <>
                                <Skeleton width="92%" height={16} borderRadius={4} />
                                <Skeleton width="78%" height={16} borderRadius={4} />
                            </>
                        ) : aiBrief?.lines?.length ? (
                            renderAiBriefLines(aiBrief.lines)
                        ) : (
                            renderBriefLines(t, morningBrief)
                        )}
                    </SimpleContainer>
                </>
            )}
        </SimpleContainer>
    );
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderAiBriefLines(lines) {
    return lines.map((line, idx) => (
        <Text14
            key={`ai-brief-${idx}`}
            color={colors.SideBarSelected || colors.primary}
        >
            {line}
        </Text14>
    ));
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
