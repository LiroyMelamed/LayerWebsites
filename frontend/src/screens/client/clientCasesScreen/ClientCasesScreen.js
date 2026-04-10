import TopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getClientNavBarData } from "../../../components/navBars/data/ClientNavBarData";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import { ClientStackName } from "../../../navigation/ClientStack";
import { ClientMainScreenName } from "../clientMainScreen/ClientMainScreen";
import casesApi from "../../../api/casesApi";
import ClosedCasesCard from "../clientMainScreen/components/ClosedCasesCard";
import OpenCasesCard from "../clientMainScreen/components/OpenCasesCard";
import { images } from "../../../assets/images/images";
import { useDemoMode, DEMO_CLIENT_CASES } from "../../../hooks/useDemoMode";

import "./ClientCasesScreen.scss";

export const ClientCasesScreenName = "/ClientCasesScreen";

export default function ClientCasesScreen() {
    const { isSmallScreen } = useScreenSize();
    const isDemo = useDemoMode();
    const { result: allCases, isPerforming: isPerformingAllCases } = useAutoHttpRequest(isDemo ? async () => ({ status: 200, data: DEMO_CLIENT_CASES }) : casesApi.getAllCases);

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData} isClient={true} />}

            <SimpleScrollView>
                <OpenCasesCard
                    openCases={(allCases || []).filter(caseItem => caseItem.IsClosed === false)}
                    isPerforming={isPerformingAllCases}
                />

                <ClosedCasesCard
                    closedCases={(allCases || []).filter(caseItem => caseItem.IsClosed === true)}
                    className="lw-clientCasesScreen__closedCard"
                    isPerforming={isPerformingAllCases}
                />
            </SimpleScrollView>
        </SimpleScreen>
    );
}
