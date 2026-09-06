import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';
import useHttpRequest from '../../hooks/useHttpRequest';
import { useEffect } from 'react';
import { images } from '../../assets/images/images';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import casesApi from '../../api/casesApi';
import { AdminStackName } from '../../navigation/AdminStack';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import { useNavigate } from 'react-router-dom';
import CommandCenterHeader from './components/commandCenter/CommandCenterHeader';
import SummaryStrip from './components/commandCenter/SummaryStrip';
import AttentionQueue from './components/commandCenter/AttentionQueue';
import TodaySection from './components/commandCenter/TodaySection';
import CaseOperationsPanel from './components/commandCenter/CaseOperationsPanel';
import SigningOperationsPanel from './components/commandCenter/SigningOperationsPanel';
import PotentialClientsPanel from './components/commandCenter/PotentialClientsPanel';
import { navigateCalendar, navigateOpenCases, navigateSigningRow } from './components/commandCenter/commandCenterUtils';
import { useManagerHomeAiInsightsEnabled } from '../../services/firmSettings';

import "./MainScreen.scss";
import "./components/commandCenter/CommandCenter.scss";

export const MainScreenName = "/MainScreen";

function scrollToSection(id) {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function MainScreen() {
    const navigate = useNavigate();
    const { isSmallScreen } = useScreenSize();
    const aiInsightsEnabled = useManagerHomeAiInsightsEnabled();

    const {
        result: managerHome,
        isPerforming: isLoadingHome,
        performRequest: refreshManagerHome,
    } = useAutoHttpRequest(casesApi.getManagerHomeData);

    const {
        result: aiBriefResponse,
        isPerforming: isLoadingAiBrief,
        performRequest: fetchAiBrief,
    } = useHttpRequest(casesApi.getManagerHomeAiBrief);

    useEffect(() => {
        if (aiInsightsEnabled) {
            fetchAiBrief();
        }
    }, [aiInsightsEnabled, fetchAiBrief]);

    const aiBrief = aiInsightsEnabled
        && aiBriefResponse?.enabled
        && aiBriefResponse?.source === 'ai'
        && Array.isArray(aiBriefResponse?.lines)
        && aiBriefResponse.lines.length > 0
        ? aiBriefResponse
        : null;

    const handleManagerHomeRefresh = () => {
        refreshManagerHome();
        if (aiInsightsEnabled) {
            fetchAiBrief();
        }
    };

    const handleSummaryNavigate = (key) => {
        if (key === "signing") {
            navigateSigningRow(navigate);
            return;
        }
        if (key === "unassigned") {
            navigateOpenCases(navigate);
            return;
        }
        if (key === "today") {
            navigateCalendar(navigate);
            return;
        }
        scrollToSection("manager-home-attention");
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-commandCenter">
                    <CommandCenterHeader
                        managerName={managerHome?.greeting?.managerName}
                        morningBrief={managerHome?.morningBrief}
                        aiBrief={aiBrief}
                        aiBriefEnabled={aiInsightsEnabled}
                        aiBriefLoading={aiInsightsEnabled && isLoadingAiBrief}
                        isPerforming={isLoadingHome}
                    />

                    <SummaryStrip
                        summary={managerHome?.summary}
                        isPerforming={isLoadingHome}
                        onNavigate={handleSummaryNavigate}
                    />

                    <SimpleContainer className="lw-commandCenter__dashboardPrimary">
                        <SimpleContainer id="manager-home-attention" className="lw-commandCenter__dashboardCol">
                            <AttentionQueue
                                items={managerHome?.attentionItems || []}
                                isPerforming={isLoadingHome}
                                onEventChanged={handleManagerHomeRefresh}
                            />
                        </SimpleContainer>
                        <SimpleContainer className="lw-commandCenter__dashboardCol">
                            <TodaySection
                                events={managerHome?.today || []}
                                isPerforming={isLoadingHome}
                                onEventChanged={handleManagerHomeRefresh}
                            />
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer className="lw-commandCenter__grid">
                        <CaseOperationsPanel
                            managerWorkload={managerHome?.managerWorkload || []}
                            casesByStage={managerHome?.casesByStage || []}
                            unassignedCases={managerHome?.unassignedCases}
                            isPerforming={isLoadingHome}
                        />
                        <SigningOperationsPanel
                            signing={managerHome?.signing}
                            isPerforming={isLoadingHome}
                        />
                    </SimpleContainer>

                    <SimpleContainer className="lw-commandCenter__grid lw-commandCenter__grid--single">
                        <PotentialClientsPanel
                            items={managerHome?.potentialClients || []}
                            isPerforming={isLoadingHome}
                        />
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
