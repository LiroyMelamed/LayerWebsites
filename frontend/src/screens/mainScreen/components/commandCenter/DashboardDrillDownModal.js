import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Separator from "../../../../components/styledComponents/separators/Separator";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";

function formatWhen(iso) {
    if (!iso) return "";
    try {
        return new Intl.DateTimeFormat("he-IL", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Jerusalem",
        }).format(new Date(iso));
    } catch {
        return "";
    }
}

function CaseRow({ item, onPress }) {
    const subtitle = [item.managerName, item.clientName].filter(Boolean).join(" · ");
    return (
        <SimpleContainer
            className="lw-commandCenter__drillDownRow"
            onPress={() => onPress?.(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPress?.(item);
                }
            }}
        >
            <TextBold14 color={colors.primary} numberOfLines={2}>{item.caseName || "—"}</TextBold14>
            {subtitle && (
                <Text12 color={colors.winter} numberOfLines={2}>{subtitle}</Text12>
            )}
            {item.currentStage != null && (
                <Text12 color={colors.winter} numberOfLines={1}>
                    {`שלב ${item.currentStage}`}
                </Text12>
            )}
        </SimpleContainer>
    );
}

function ActivityRow({ item, onPress, t }) {
    const subtitle = [item.caseName, item.managerName].filter(Boolean).join(" · ");
    const typeKey = `managerHome.activity.types.${item.activityType}`;
    const label = t(typeKey, item.meta || {});

    return (
        <SimpleContainer
            className="lw-commandCenter__drillDownRow lw-commandCenter__drillDownRow--activity"
            onPress={() => onPress?.(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPress?.(item);
                }
            }}
        >
            <SimpleContainer className="lw-commandCenter__drillDownRowTop">
                <TextBold14 color={colors.primary} numberOfLines={2}>{label}</TextBold14>
                <Text12 color={colors.winter}>{formatWhen(item.occurredAt)}</Text12>
            </SimpleContainer>
            {subtitle && (
                <Text12 color={colors.winter} numberOfLines={2}>{subtitle}</Text12>
            )}
        </SimpleContainer>
    );
}

function SigningRow({ item, onPress, t, queueState }) {
    return (
        <SimpleContainer
            className={`lw-commandCenter__drillDownRow lw-commandCenter__signingRow ${queueState ? `is-signal-signing-${queueState}` : ""}`}
            onPress={() => onPress?.(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPress?.(item);
                }
            }}
        >
            <TextBold14 color={colors.primary} numberOfLines={2}>{item.filename || "—"}</TextBold14>
            <Text12 color={colors.winter} numberOfLines={2}>
                {[item.caseName, item.clientName].filter(Boolean).join(" · ")}
            </Text12>
            {queueState && (
                <Text12 color={colors.winter}>
                    {t(`managerHome.signing.queueStatus.${queueState}`)}
                </Text12>
            )}
        </SimpleContainer>
    );
}

export default function DashboardDrillDownModal({
    title,
    subtitle,
    emptyText,
    variant = "case",
    items = [],
    onItemPress,
    resolveSigningState,
}) {
    const { t } = useTranslation();

    return (
        <SimpleContainer className="lw-commandCenter__drillDownModal">
            <SimpleContainer className="lw-commandCenter__drillDownModalHeader">
                <TextBold18 color={colors.primary}>{title}</TextBold18>
                {subtitle && (
                    <Text12 color={colors.winter}>{subtitle}</Text12>
                )}
            </SimpleContainer>
            <SimpleContainer className="lw-commandCenter__drillDownModalBody">
                {items.length === 0 ? (
                    <SimpleContainer className="lw-commandCenter__emptyState lw-commandCenter__emptyState--compact">
                        <Text14 color={colors.winter}>{emptyText}</Text14>
                    </SimpleContainer>
                ) : (
                    items.map((item, idx) => (
                        <Fragment key={item.key ?? item.caseId ?? item.signingFileId ?? item.activityType + idx}>
                            {idx > 0 && (
                                <Separator className="lw-commandCenter__attentionSeparator" />
                            )}
                            {variant === "activity" && (
                                <ActivityRow item={item} onPress={onItemPress} t={t} />
                            )}
                            {variant === "signing" && (
                                <SigningRow
                                    item={item}
                                    onPress={onItemPress}
                                    t={t}
                                    queueState={resolveSigningState?.(item)}
                                />
                            )}
                            {variant === "case" && (
                                <CaseRow item={item} onPress={onItemPress} />
                            )}
                        </Fragment>
                    ))
                )}
            </SimpleContainer>
        </SimpleContainer>
    );
}
