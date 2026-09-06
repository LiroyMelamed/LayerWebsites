import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text14, TextBold24 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";

export default function CommandCenterHeader({ managerName, morningBrief, isPerforming }) {
    const { t } = useTranslation();

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
                            ? t("managerHome.greetingNamed", { name: managerName })
                            : t("managerHome.greeting")}
                    </TextBold24>
                    <Text14 color={colors.SideBarSelected || colors.primary}>
                        {renderBrief(t, morningBrief)}
                    </Text14>
                </>
            )}
        </SimpleContainer>
    );
}

function renderBrief(t, brief) {
    if (!brief) return t("managerHome.subtitle");
    if (brief.key) return t(brief.key, brief.params || {});

    const parts = [];
    if (Array.isArray(brief.sentences) && brief.sentences.length > 0) {
        parts.push(
            brief.sentences.map((s) => t(s.key, s.params || {})).join(" ")
        );
    }
    if (brief.todayNote) {
        parts.push(t(brief.todayNote.key, brief.todayNote.params || {}));
    }
    return parts.length > 0 ? parts.join(" ") : t("managerHome.subtitle");
}
