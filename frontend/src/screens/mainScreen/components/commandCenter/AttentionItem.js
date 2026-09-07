import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import { Text12, Text14, TextBold14 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { priorityClassName } from "./commandCenterUtils";

function SampleRow({ sample, t, onPress }) {
    return (
        <SimpleContainer
            className="lw-commandCenter__attentionSample"
            onClick={(e) => {
                e.stopPropagation();
                onPress?.(sample);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onPress?.(sample);
                }
            }}
        >
            {sample.caseName && (
                <Text14 numberOfLines={1}>
                    {t("managerHome.labels.case")}: {sample.caseName}
                </Text14>
            )}
            {sample.managerName && (
                <Text12 color={colors.winter} numberOfLines={1}>
                    {t("managerHome.labels.manager")}: {sample.managerName}
                </Text12>
            )}
            {sample.reasonParams && sample.reasonKey && (
                <Text12 color={colors.text} numberOfLines={2}>
                    {t(sample.reasonKey, sample.reasonParams)}
                </Text12>
            )}
        </SimpleContainer>
    );
}

export default function AttentionItem({
    item,
    onPress,
    onSamplePress,
    expanded = false,
    onToggleExpand,
}) {
    const { t } = useTranslation();
    const isGroup = item.kind === "group";

    const title = t(item.titleKey, item.reasonParams || {});
    const reason = t(item.reasonKey, item.reasonParams || {});

    const handlePress = () => {
        if (isGroup) {
            onToggleExpand?.();
            return;
        }
        onPress?.();
    };

    return (
        <SimpleContainer
            className={`lw-commandCenter__attentionItem ${priorityClassName(item.priority)}${isGroup ? " is-group" : ""}${expanded ? " is-expanded" : ""}`}
            onClick={handlePress}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlePress();
                }
            }}
        >
            <SimpleContainer className="lw-commandCenter__attentionItemMain">
                <SimpleContainer className="lw-commandCenter__attentionItemTitleRow">
                    <TextBold14 color={colors.primary}>{title}</TextBold14>
                    {isGroup && item.count > 1 && (
                        <Text12 color={colors.winter} className="lw-commandCenter__attentionCount">
                            {item.count}
                        </Text12>
                    )}
                </SimpleContainer>

                {!isGroup && item.caseName && (
                    <Text14 numberOfLines={1}>
                        {t("managerHome.labels.case")}: {item.caseName}
                    </Text14>
                )}
                {!isGroup && item.clientName && (
                    <Text12 color={colors.winter} numberOfLines={1}>
                        {t("managerHome.labels.client")}: {item.clientName}
                    </Text12>
                )}
                {!isGroup && item.managerName && (
                    <Text12 color={colors.winter} numberOfLines={1}>
                        {t("managerHome.labels.manager")}: {item.managerName}
                    </Text12>
                )}
                <Text14 color={colors.text}>{reason}</Text14>

                {isGroup && expanded && (item.members?.length > 0 || item.samples?.length > 0) && (
                    <SimpleContainer className="lw-commandCenter__attentionSamples">
                        {(item.members || item.samples).slice(0, 3).map((member, idx) => (
                            <SampleRow
                                key={`${member.caseId || member.entityId}-${idx}`}
                                sample={member}
                                t={t}
                                onPress={onSamplePress}
                            />
                        ))}
                        {item.count > 3 && (
                            <Text12 color={colors.winter}>
                                {t("managerHome.attention.moreInGroup", {
                                    count: item.count - 3,
                                })}
                            </Text12>
                        )}
                    </SimpleContainer>
                )}
            </SimpleContainer>
            <SimpleContainer className="lw-commandCenter__attentionItemAction">
                <Text12 color={colors.primary}>
                    {isGroup
                        ? (expanded ? t("managerHome.actions.collapse") : t("managerHome.actions.expand"))
                        : t("managerHome.actions.open")}
                </Text12>
            </SimpleContainer>
        </SimpleContainer>
    );
}
