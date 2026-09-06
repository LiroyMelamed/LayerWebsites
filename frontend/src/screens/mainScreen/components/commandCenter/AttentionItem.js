import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import { Text12, TextBold14 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { attentionMetaLine, priorityClassName, signalTypeClassName } from "./commandCenterUtils";

export default function AttentionItem({ item, onPress }) {
    const { t } = useTranslation();
    const isGroup = item.kind === "group";
    const title = t(item.titleKey, item.reasonParams || {});
    const reason = t(item.reasonKey, item.reasonParams || {});
    const meta = attentionMetaLine(item, t);
    const tagKey = `managerHome.signalTags.${item.signalType}`;
    const tagLabel = t(tagKey, { defaultValue: title });

    return (
        <SimpleContainer
            className={[
                "lw-commandCenter__attentionItem",
                priorityClassName(item.priority),
                signalTypeClassName(item.signalType),
                isGroup ? "is-group" : "",
            ].filter(Boolean).join(" ")}
            onPress={onPress}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPress?.();
                }
            }}
        >
            <SimpleContainer className="lw-commandCenter__attentionItemTop">
                <SimpleContainer className={`lw-commandCenter__signalTag ${signalTypeClassName(item.signalType)}`}>
                    <Text12>{tagLabel}</Text12>
                </SimpleContainer>
                <TextBold14 color={colors.primary} numberOfLines={1} className="lw-commandCenter__attentionTitle">
                    {title}
                </TextBold14>
                {isGroup && item.count > 1 && (
                    <SimpleContainer className="lw-commandCenter__attentionBadge">
                        <Text12 color={colors.primary}>{item.count}</Text12>
                    </SimpleContainer>
                )}
                <Text12 color={colors.winter} className="lw-commandCenter__attentionChevron" aria-hidden>
                    ←
                </Text12>
            </SimpleContainer>

            {meta && (
                <Text12 color={colors.winter} numberOfLines={1} className="lw-commandCenter__attentionMeta">
                    {meta}
                </Text12>
            )}

            <Text12 color={colors.text} numberOfLines={2} className="lw-commandCenter__attentionReason">
                {reason}
            </Text12>
        </SimpleContainer>
    );
}
