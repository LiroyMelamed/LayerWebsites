import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { AdminStackName, SigningManagerScreenName } from "../../../../navigation/screenPaths";

export default function SigningOperationsPanel({ signing, isPerforming }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const summary = signing?.summary || {};
    const queue = signing?.queue || [];

    const stats = [
        { label: t("managerHome.signing.pending"), value: summary.pending ?? 0 },
        { label: t("managerHome.signing.expiring"), value: summary.expiring ?? 0 },
        { label: t("managerHome.signing.expired"), value: summary.expired ?? 0, warn: true },
        { label: t("managerHome.signing.rejected"), value: summary.rejected ?? 0 },
    ];

    return (
        <SimpleCard className="lw-commandCenter__section" id="manager-home-signing">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.signing.title")}</TextBold18>
                <Text12
                    color={colors.primary}
                    onClick={() => navigate(`${AdminStackName}${SigningManagerScreenName}`)}
                    className="lw-commandCenter__link"
                >
                    {t("managerHome.actions.viewAll")}
                </Text12>
            </SimpleContainer>

            {isPerforming ? (
                <Skeleton width="100%" height={140} borderRadius={8} />
            ) : (
                <SimpleContainer className="lw-commandCenter__panelBody">
                    <SimpleContainer className="lw-commandCenter__signingStats">
                        {stats.map((s) => (
                            <SimpleContainer key={s.label} className="lw-commandCenter__signingStat">
                                <TextBold14 color={s.warn && s.value > 0 ? colors.negative : colors.primary}>
                                    {s.value}
                                </TextBold14>
                                <Text12 color={colors.winter}>{s.label}</Text12>
                            </SimpleContainer>
                        ))}
                    </SimpleContainer>

                    {queue.length === 0 ? (
                        <Text14 color={colors.winter}>{t("managerHome.signing.empty")}</Text14>
                    ) : (
                        <SimpleContainer className="lw-commandCenter__signingQueue">
                            {queue.slice(0, 5).map((row) => (
                                <SimpleContainer
                                    key={row.signingFileId}
                                    className="lw-commandCenter__signingRow"
                                    onClick={() => navigate(`${AdminStackName}${SigningManagerScreenName}`)}
                                >
                                    <TextBold14 numberOfLines={1}>{row.filename}</TextBold14>
                                    <Text12 color={colors.winter} numberOfLines={1}>
                                        {[row.caseName, row.clientName].filter(Boolean).join(" · ")}
                                    </Text12>
                                    <Text12 color={row.status === "rejected" ? colors.negative : colors.winter}>
                                        {t(`signing.status.${row.status}`, row.status)}
                                    </Text12>
                                </SimpleContainer>
                            ))}
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
