import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';
import useHttpRequest from '../../hooks/useHttpRequest';
import { useCallback, useEffect } from 'react';
import { images } from '../../assets/images/images';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import casesApi from '../../api/casesApi';
import calendarApi from '../../api/calendarApi';
import { AdminStackName } from '../../navigation/AdminStack';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import { useNavigate } from 'react-router-dom';
import AiBriefSection from './components/commandCenter/AiBriefSection';
import CalendarWidget from './components/CalendarWidget';
import FirmStatsPanel from './components/commandCenter/FirmStatsPanel';
import CaseOperationsPanel from './components/commandCenter/CaseOperationsPanel';
import SigningOperationsPanel from './components/commandCenter/SigningOperationsPanel';
import PotentialClientsPanel from './components/commandCenter/PotentialClientsPanel';
import { navigateCalendar, navigateCaseRow } from './components/commandCenter/commandCenterUtils';
import { openCalendarEventModal } from './components/commandCenter/openCalendarEventModal';
import { openCaseMenuModal } from './components/commandCenter/openCaseMenuModal';
import { useManagerHomeAiInsightsEnabled } from '../../services/firmSettings';
import { usePopup } from '../../providers/PopUpProvider';

import "./MainScreen.scss";
import "./components/commandCenter/CommandCenter.scss";

export const MainScreenName = "/MainScreen";

export default function MainScreen() {
    const navigate = useNavigate();
    const { isSmallScreen } = useScreenSize();
    const { openPopup, closePopup, pushPopup, popPopup } = usePopup();
    const isPlatformAdmin = typeof window !== "undefined"
        && localStorage.getItem("isPlatformAdmin") === "true";
    const aiInsightsSettingEnabled = useManagerHomeAiInsightsEnabled();
    const aiInsightsEnabled = aiInsightsSettingEnabled && isPlatformAdmin;

    const {
        result: managerHome,
        isPerforming: isLoadingHome,
        performRequest: refreshManagerHome,
    } = useAutoHttpRequest(casesApi.getManagerHomeData);

    const {
        result: calendarResponse,
        isPerforming: isLoadingCalendar,
        performRequest: refreshCalendar,
    } = useAutoHttpRequest(calendarApi.getTodayAndTomorrow);

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

    const calendarEvents = calendarResponse?.events || calendarResponse?.data?.events || [];

    const handleRefresh = useCallback(() => {
        refreshManagerHome();
        refreshCalendar();
        if (aiInsightsEnabled) {
            fetchAiBrief();
        }
    }, [refreshManagerHome, refreshCalendar, aiInsightsEnabled, fetchAiBrief]);

    const handleCalendarEventPress = useCallback(async (ev, { usePush = false } = {}) => {
        if (ev?.caseId) {
            if (usePush && pushPopup) {
                openCaseMenuModal({
                    caseId: ev.caseId,
                    pushPopup,
                    onSaved: handleRefresh,
                });
                return;
            }
            navigateCaseRow(navigate, ev.caseId, {
                openPopup,
                closePopup,
                onDataChanged: handleRefresh,
            });
            return;
        }
        if (ev?.id) {
            const opened = await openCalendarEventModal({
                eventId: ev.id,
                openPopup: usePush ? undefined : openPopup,
                pushPopup: usePush ? pushPopup : undefined,
                popPopup: usePush ? popPopup : undefined,
                closePopup,
                onSaved: handleRefresh,
                onDeleted: handleRefresh,
            });
            if (opened) return;
        }
        navigateCalendar(navigate);
    }, [navigate, openPopup, pushPopup, popPopup, closePopup, handleRefresh]);

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-commandCenter">
                    <CalendarWidget
                        events={calendarEvents}
                        isPerforming={isLoadingCalendar}
                        onEventPress={handleCalendarEventPress}
                    />

                    <AiBriefSection
                        morningBrief={managerHome?.morningBrief}
                        aiBrief={aiBrief}
                        aiBriefEnabled={aiInsightsEnabled}
                        aiBriefLoading={aiInsightsEnabled && isLoadingAiBrief}
                        isPerforming={isLoadingHome}
                    />

                    <FirmStatsPanel
                        firmStats={managerHome?.firmStats}
                        drillDown={managerHome?.drillDown}
                        signing={managerHome?.signing}
                        attentionItems={managerHome?.attentionItems || []}
                        todayEvents={managerHome?.today || []}
                        onTodayEventPress={handleCalendarEventPress}
                        isPerforming={isLoadingHome}
                        onDataChanged={handleRefresh}
                    />

                    <SimpleContainer className="lw-commandCenter__grid">
                        <CaseOperationsPanel
                            managerWorkload={managerHome?.managerWorkload || []}
                            unassignedCases={managerHome?.unassignedCases}
                            drillDown={managerHome?.drillDown}
                            isPerforming={isLoadingHome}
                            onDataChanged={handleRefresh}
                        />

                        <SigningOperationsPanel
                            signing={managerHome?.signing}
                            isPerforming={isLoadingHome}
                            onDataChanged={handleRefresh}
                        />
                    </SimpleContainer>

                    {(managerHome?.potentialClients?.length > 0) && (
                        <PotentialClientsPanel
                            items={managerHome.potentialClients}
                            isPerforming={isLoadingHome}
                            openPopup={openPopup}
                            onEventPress={handleCalendarEventPress}
                        />
                    )}
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
