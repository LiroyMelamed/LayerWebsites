import TopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getClientNavBarData } from "../../../components/navBars/data/ClientNavBarData";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import { ClientStackName } from "../../../navigation/ClientStack";
import casesApi, { casesTypeApi } from "../../../api/casesApi";
import ClosedCasesCard from "./components/ClosedCasesCard";
import { images } from "../../../assets/images/images";
import OpenCasesCard from "./components/OpenCasesCard";

import "./ClientMainScreen.scss";

export const ClientMainScreenName = "/ClientMainScreen";

export default function ClientMainScreen() {
    const { isSmallScreen } = useScreenSize();
    const { result: allCases, isPerforming: isPerformingAllCases } = useAutoHttpRequest(casesApi.getAllCases);
    const { isPerforming: isPerformingAllCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);

    if (isPerformingAllCases || isPerformingAllCasesTypes) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData} isClient={true} />}

            <SimpleScrollView>

                <OpenCasesCard
                    openCases={allCases.filter(caseItem => caseItem.IsClosed === false)}
                />

                <ClosedCasesCard
                    closedCases={allCases.filter(caseItem => caseItem.IsClosed === true)}
                    className="lw-clientMainScreen__closedCard"
                />
            </SimpleScrollView>

        </SimpleScreen >
    );
}
