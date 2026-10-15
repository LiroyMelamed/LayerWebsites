import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Separator from "../../../../components/styledComponents/separators/Separator";
import { Text12, Text14, TextBold14, TextBold16, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { createPopupModalHandlers } from "../../../../utils/popupStackUtils";
import AttentionItem from "./AttentionItem";
import { organizeAttentionByManager } from "./attentionDisplayUtils";

export default function AttentionDetailsModal({
    items = [],
    openPopup,
    pushPopup,
    popPopup,
    closePopup,
    onEventChanged,
}) {
    const { t } = useTranslation();
    const sections = useMemo(
        () => organizeAttentionByManager(items, {
            unassignedLabel: t("managerHome.summary.unassigned"),
            signingLabel: t("managerHome.attention.signingSection"),
        }),
        [items, t],
    );

    const modalHandlers = useMemo(
        () => createPopupModalHandlers({
            openPopup,
            pushPopup,
            popPopup,
            closePopup,
            onDataChanged: onEventChanged,
        }),
        [openPopup, pushPopup, popPopup, closePopup, onEventChanged],
    );

    return (
        <SimpleContainer className="lw-commandCenter__attentionModal">
            <SimpleContainer className="lw-commandCenter__attentionModalHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.attention.title")}</TextBold18>
            </SimpleContainer>
            <SimpleContainer className="lw-commandCenter__attentionModalBody">
                {sections.length === 0 ? (
                    <SimpleContainer className="lw-commandCenter__emptyState lw-commandCenter__emptyState--compact">
                        <TextBold16 color={colors.positive}>{t("managerHome.attention.allClearTitle")}</TextBold16>
                        <Text14 color={colors.winter}>{t("managerHome.attention.allClearBody")}</Text14>
                    </SimpleContainer>
                ) : (
                    sections.map((section, sectionIdx) => (
                        <SimpleContainer
                            key={section.managerName}
                            className="lw-commandCenter__attentionManagerSection"
                        >
                            {sectionIdx > 0 && (
                                <Separator className="lw-commandCenter__attentionSeparator lw-commandCenter__attentionSeparator--section" />
                            )}
                            <SimpleContainer className="lw-commandCenter__attentionManagerHeader">
                                <TextBold14 color={colors.primary}>{section.managerName}</TextBold14>
                                <Text12 color={colors.winter}>
                                    {t("managerHome.attention.managerCount", { count: section.count })}
                                </Text12>
                            </SimpleContainer>
                            <SimpleContainer className="lw-commandCenter__attentionList">
                                {section.items.map((item, idx) => (
                                    <Fragment key={`${section.managerName}-${item.kind}-${item.signalType}-${item.entityId ?? idx}`}>
                                        {idx > 0 && (
                                            <Separator className="lw-commandCenter__attentionSeparator" />
                                        )}
                                        <AttentionItem
                                            item={item}
                                            onEventChanged={onEventChanged}
                                            modalHandlers={modalHandlers}
                                        />
                                    </Fragment>
                                ))}
                            </SimpleContainer>
                        </SimpleContainer>
                    ))
                )}
            </SimpleContainer>
        </SimpleContainer>
    );
}
