import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Separator from "../../../../components/styledComponents/separators/Separator";
import { Text12, TextBold14 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import {
    attentionMetaLine,
    memberAttentionLabel,
    priorityClassName,
    signalTypeClassName,
} from "./commandCenterUtils";
import { openAttentionMember } from "./openAttentionMember";

export default function AttentionItem({
    item,
    onEventChanged,
    modalHandlers: modalHandlersProp = {},
}) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [membersInteractive, setMembersInteractive] = useState(true);
    const suppressMembersUntilRef = useRef(0);

    const modalHandlers = useMemo(() => modalHandlersProp, [modalHandlersProp]);

    const isGroup = item.kind === "group" && item.count > 1;
    const title = t(item.titleKey, item.reasonParams || {});
    const reason = t(item.reasonKey, item.reasonParams || {});
    const meta = attentionMetaLine(item, t);
    const dotClass = [
        "lw-commandCenter__attentionDot",
        priorityClassName(item.priority),
        signalTypeClassName(item.signalType),
    ].filter(Boolean).join(" ");

    const openAttentionTarget = useCallback((target) => {
        void openAttentionMember(target, modalHandlers);
    }, [modalHandlers]);

    const handleMemberPress = useCallback((member, e) => {
        if (Date.now() < suppressMembersUntilRef.current) {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            return;
        }
        e?.preventDefault?.();
        e?.stopPropagation?.();
        openAttentionTarget(member);
    }, [openAttentionTarget]);

    const handlePress = () => {
        if (isGroup) {
            const nextExpanded = !expanded;
            setExpanded(nextExpanded);
            if (nextExpanded) {
                suppressMembersUntilRef.current = Date.now() + 350;
                setMembersInteractive(false);
            } else {
                suppressMembersUntilRef.current = 0;
                setMembersInteractive(true);
            }
            return;
        }
        openAttentionTarget(item);
    };

    useEffect(() => {
        if (membersInteractive) return undefined;

        const enableMembers = () => {
            suppressMembersUntilRef.current = 0;
            setMembersInteractive(true);
        };

        window.addEventListener("pointerup", enableMembers, { once: true });
        const timer = window.setTimeout(enableMembers, 350);

        return () => {
            window.removeEventListener("pointerup", enableMembers);
            window.clearTimeout(timer);
        };
    }, [membersInteractive]);

    return (
        <SimpleContainer className="lw-commandCenter__attentionBlock">
            <SimpleContainer
                className={[
                    "lw-commandCenter__attentionItem",
                    priorityClassName(item.priority),
                    signalTypeClassName(item.signalType),
                    isGroup ? "is-group" : "",
                    expanded ? "is-expanded" : "",
                ].filter(Boolean).join(" ")}
                onPress={handlePress}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handlePress();
                    }
                }}
            >
                <SimpleContainer className={dotClass} aria-hidden />

                <SimpleContainer className="lw-commandCenter__attentionContent">
                    <SimpleContainer className="lw-commandCenter__attentionItemTop">
                        <TextBold14
                            color={colors.primary}
                            numberOfLines={2}
                            className="lw-commandCenter__attentionTitle"
                        >
                            {title}
                        </TextBold14>
                        {isGroup && (
                            <SimpleContainer className="lw-commandCenter__attentionBadge">
                                <Text12 color={colors.primary}>{item.count}</Text12>
                            </SimpleContainer>
                        )}
                        <Text12 color={colors.winter} className="lw-commandCenter__attentionChevron" aria-hidden>
                            {isGroup ? (expanded ? "▾" : "◂") : "←"}
                        </Text12>
                    </SimpleContainer>

                    {!expanded && meta && (
                        <Text12 color={colors.winter} numberOfLines={2} className="lw-commandCenter__attentionMeta">
                            {meta}
                        </Text12>
                    )}

                    {!expanded && (
                        <Text12 color={colors.text} numberOfLines={2} className="lw-commandCenter__attentionReason">
                            {isGroup && item.signalType !== "no_activity"
                                ? t("managerHome.attention.tapToExpand")
                                : reason}
                        </Text12>
                    )}
                </SimpleContainer>
            </SimpleContainer>

            {isGroup && expanded && (
                <SimpleContainer
                    className={[
                        "lw-commandCenter__attentionMembers",
                        membersInteractive ? null : "lw-commandCenter__attentionMembers--inactive",
                    ].filter(Boolean).join(" ")}
                >
                    {(item.members || []).map((member, idx) => (
                        <Fragment key={`${member.entityId ?? member.caseId ?? member.signingFileId ?? idx}-${idx}`}>
                            {idx > 0 && (
                                <Separator className="lw-commandCenter__attentionSeparator lw-commandCenter__attentionSeparator--nested" />
                            )}
                            <SimpleContainer
                                className={`lw-commandCenter__attentionMember ${signalTypeClassName(item.signalType)}`}
                                onPress={(e) => handleMemberPress(member, e)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleMemberPress(member, e);
                                    }
                                }}
                            >
                                <SimpleContainer
                                    className={`lw-commandCenter__attentionDot lw-commandCenter__attentionDot--sm ${signalTypeClassName(item.signalType)} ${priorityClassName(member.priority || item.priority)}`}
                                    aria-hidden
                                />
                                <SimpleContainer className="lw-commandCenter__attentionContent">
                                    <TextBold14 color={colors.primary} numberOfLines={1}>
                                        {memberAttentionLabel(member, t)}
                                    </TextBold14>
                                    <Text12 color={colors.winter} numberOfLines={2}>
                                        {t(member.reasonKey || item.reasonKey, member.reasonParams || item.reasonParams || {})}
                                    </Text12>
                                </SimpleContainer>
                            </SimpleContainer>
                        </Fragment>
                    ))}
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}
