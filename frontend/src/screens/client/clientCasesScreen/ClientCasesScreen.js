import TopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getClientNavBarData } from "../../../components/navBars/data/ClientNavBarData";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import { ClientMainScreenName } from "../clientMainScreen/ClientMainScreen";
import casesApi from "../../../api/casesApi";
import ClosedCasesCard from "../clientMainScreen/components/ClosedCasesCard";
import OpenCasesCard from "../clientMainScreen/components/OpenCasesCard";
import { images } from "../../../assets/images/images";
import RequestLoadError from '../../../components/ui/RequestLoadError';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import { clientPortalPath } from '../../../utils/clientPortalNavigation';

import "./ClientCasesScreen.scss";

export const ClientCasesScreenName = "/ClientCasesScreen";

export default function ClientCasesScreen() {
    const { t } = useTranslation();
    const [params] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { isSmallScreen } = useScreenSize();
    const { result: allCases, isPerforming: isPerformingAllCases, error, performRequest } = useAutoHttpRequest(casesApi.getAllCases);
    const selectedId = params.get('caseId');
    const permittedCases = Array.isArray(allCases) ? allCases : [];
    const selected = selectedId ? permittedCases.find(item => String(item.CaseId) === selectedId) : null;
    const shownCases = selectedId ? (selected ? [selected] : []) : permittedCases;

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={clientPortalPath(location.pathname, ClientMainScreenName)} GetNavBarData={getClientNavBarData} isClient={true} />}

            <SimpleScrollView>
                {error ? <RequestLoadError onRetry={() => performRequest()} /> : <>
                {selectedId && <div className="lw-clientCasesScreen__selection">
                    <SecondaryButton onPress={() => navigate(clientPortalPath(location.pathname, ClientCasesScreenName))}>{t('clientPortal.allCases')}</SecondaryButton>
                    {!selected && !isPerformingAllCases && <p role="alert">{t('clientPortal.caseUnavailable')}</p>}
                </div>}
                {(!selectedId || selected?.IsClosed === false || isPerformingAllCases) && <OpenCasesCard
                    key={`open-${selectedId || 'all'}`}
                    openCases={shownCases.filter(caseItem => caseItem.IsClosed === false)}
                    isPerforming={isPerformingAllCases}
                    initialOpenCaseId={selectedId}
                />}

                {(!selectedId || selected?.IsClosed === true || isPerformingAllCases) && <ClosedCasesCard
                    key={`closed-${selectedId || 'all'}`}
                    closedCases={shownCases.filter(caseItem => caseItem.IsClosed === true)}
                    className="lw-clientCasesScreen__closedCard"
                    isPerforming={isPerformingAllCases}
                    initialOpenCaseId={selectedId}
                />}
                </>}
            </SimpleScrollView>
        </SimpleScreen>
    );
}
