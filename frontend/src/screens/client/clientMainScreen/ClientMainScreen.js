import TopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getClientNavBarData } from "../../../components/navBars/data/ClientNavBarData";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import { ClientStackName } from "../../../navigation/ClientStack";
import casesApi from "../../../api/casesApi";
import { images } from "../../../assets/images/images";
import ShowDataCard from "../../mainScreen/components/ShowDataCard";
import ComparisonDataCard from "../../mainScreen/components/ComprasionDataCard";
import { colors } from "../../../constant/colors";
import { NotificationsScreenName } from "../notifications/NotificationsScreen";
import { ClientCasesScreenName } from "../clientCasesScreen/ClientCasesScreen";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import "./ClientMainScreen.scss";

export const ClientMainScreenName = "/ClientMainScreen";

export default function ClientMainScreen() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isSmallScreen } = useScreenSize();
    const { result: dashboardData, isPerforming: isPerformingDashboard } = useAutoHttpRequest(casesApi.getClientDashboardData);

    if (isPerformingDashboard) {
        return <SimpleLoader />;
    }

    const totalCases = dashboardData?.totalCases ?? 0;
    const openCases = dashboardData?.openCases ?? 0;
    const closedCases = dashboardData?.closedCases ?? 0;
    const unreadNotifications = dashboardData?.unreadNotifications ?? 0;

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData} isClient={true} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-clientMainScreen__chartWrap">
                    <ComparisonDataCard
                        colors={colors.doughnutChartColorScale}
                        labels={[t("cases.openCases"), t("cases.closedCases")]}
                        data={[openCases, closedCases]}
                        title={t("mainScreen.caseSummary")}
                        centerText={`${totalCases}`}
                        subText={t("mainScreen.totalCases")}
                        className="lw-clientMainScreen__comparisonCard"
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-clientMainScreen__cards">
                    <SimpleContainer className="lw-clientMainScreen__row">
                        <ShowDataCard
                            numberText={totalCases}
                            title={t("mainScreen.totalCases")}
                            optionalOnClick={() => { navigate(ClientStackName + ClientCasesScreenName) }}
                        />
                        <ShowDataCard
                            numberText={closedCases}
                            title={t("cases.closedCases")}
                            optionalOnClick={() => { navigate(ClientStackName + ClientCasesScreenName) }}
                        />
                    </SimpleContainer>

                    <SimpleContainer className="lw-clientMainScreen__row">
                        <ShowDataCard
                            numberText={openCases}
                            title={t("cases.openCases")}
                            optionalOnClick={() => { navigate(ClientStackName + ClientCasesScreenName) }}
                        />
                        <ShowDataCard
                            numberText={unreadNotifications}
                            title={t("mainScreen.unreadNotifications")}
                            optionalOnClick={() => { navigate(ClientStackName + NotificationsScreenName) }}
                        />
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleScrollView>

        </SimpleScreen >
    );
}
