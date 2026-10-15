import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import useHttpRequest from '../../hooks/useHttpRequest';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, LayoutDashboard } from 'lucide-react';
import SimpleButton from '../../components/simpleComponents/SimpleButton';
import { useFirmPermissions } from '../../providers/FirmPermissionsProvider';
import { images } from '../../assets/images/images';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import casesApi from '../../api/casesApi';
import calendarApi from '../../api/calendarApi';
import { AdminStackName } from '../../navigation/AdminStack';
import { SigningManagerScreenName } from '../signingScreen/SigningManagerScreen';
import { AllCasesScreenName } from '../allCasesScreen/AllCasesScreen';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import { useNavigate } from 'react-router-dom';
import AiBriefSection from './components/commandCenter/AiBriefSection';
import CalendarWidget from './components/CalendarWidget';
import FirmStatsPanel from './components/commandCenter/FirmStatsPanel';
import TeamActivityPanel from './components/commandCenter/TeamActivityPanel';
import { openAttentionModal } from './components/commandCenter/openAttentionModal';
import CaseOperationsPanel from './components/commandCenter/CaseOperationsPanel';
import SigningOperationsPanel from './components/commandCenter/SigningOperationsPanel';
import PotentialClientsPanel from './components/commandCenter/PotentialClientsPanel';
import { countJerusalemTodayEvents, navigateCalendar, navigateCaseRow, navigateOpenCases } from './components/commandCenter/commandCenterUtils';
import SummaryStrip from './components/commandCenter/SummaryStrip';
import { openCalendarEventModal } from './components/commandCenter/openCalendarEventModal';
import { openCaseMenuModal } from './components/commandCenter/openCaseMenuModal';
import { useFirmSettingsLoaded, useManagerHomeAiInsightsEnabled } from '../../services/firmSettings';
import { usePopup } from '../../providers/PopUpProvider';
import { toastFromApiError } from '../../components/ui/showAppToast';
import { Text14 } from '../../components/specializedComponents/text/AllTextKindFile';
import { useOfficeLogoNavigate } from '../../navigation/useOfficeLogoNavigate';

import "./MainScreen.scss";
import "./components/commandCenter/CommandCenter.scss";
import "./BusinessHome.scss";

export const MainScreenName = "/MainScreen";

function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function MainScreen() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { isSmallScreen } = useScreenSize();
    const { openPopup, closePopup, pushPopup, popPopup } = usePopup();
    const settingsLoaded = useFirmSettingsLoaded();
    const aiInsightsSettingEnabled = useManagerHomeAiInsightsEnabled();
    const aiInsightsEnabled = aiInsightsSettingEnabled;
    const firmPerms = useFirmPermissions();
    const logoNavigate = useOfficeLogoNavigate();
    const roleMode = firmPerms?.permissionMode === 'role';
    const mainEnabled = useMemo(() => {
        if (!firmPerms?.loaded) return false;
        if (!roleMode) return true;
        return firmPerms.canPage('main');
    }, [firmPerms, roleMode]);
    const casesDashboardEnabled = useMemo(() => {
        if (!firmPerms?.loaded) return false;
        if (!roleMode) return true;
        return firmPerms.canAction('cases', 'view');
    }, [firmPerms, roleMode]);
    const dashboardEnabled = mainEnabled && casesDashboardEnabled;
    const calendarEnabled = useMemo(() => {
        if (!firmPerms?.loaded) return false;
        if (!roleMode) return true;
        return firmPerms.canPage('calendar') && firmPerms.canAction('calendar', 'view');
    }, [firmPerms, roleMode]);
    const signingDashboardEnabled = useMemo(() => {
        if (!firmPerms?.loaded) return false;
        if (!roleMode) return true;
        return firmPerms.canAction('signing', 'view');
    }, [firmPerms, roleMode]);
    const clientsDashboardEnabled = useMemo(() => {
        if (!firmPerms?.loaded) return false;
        if (!roleMode) return true;
        return firmPerms.canAction('clients', 'view');
    }, [firmPerms, roleMode]);

    const {
        result: managerHome,
        isPerforming: isLoadingHome,
        performRequest: refreshManagerHome,
    } = useHttpRequest(casesApi.getManagerHomeData, null, (error) => {
        if (error?.status === 404 || error?.status === 403) return;
        toastFromApiError(error, 'שגיאה בקבלת נתוני לוח הבקרה');
    });

    const {
        result: calendarResponse,
        isPerforming: isLoadingCalendar,
        performRequest: refreshCalendar,
    } = useHttpRequest(calendarApi.getTodayAndTomorrow, null, () => {});

    const {
        result: aiBriefResponse,
        isPerforming: isLoadingAiBrief,
        performRequest: fetchAiBrief,
    } = useHttpRequest(casesApi.getManagerHomeAiBrief, null, () => {});

    const handleSummaryNavigate = (key) => {
        if (key === "totalCases") {
            navigateOpenCases(navigate, "");
            return;
        }
        if (key === "activeCases") {
            navigateOpenCases(navigate, "?status=open");
            return;
        }
        if (key === "closedCases") {
            navigateOpenCases(navigate, "?status=closed");
            return;
        }
        if (key === "signing") {
            navigate(AdminStackName + SigningManagerScreenName);
            return;
        }
        if (key === "unassigned") {
            navigate(AdminStackName + AllCasesScreenName + "?status=open");
            return;
        }
        if (key === "today") {
            scrollToSection("manager-home-today");
            return;
        }
        openAttentionModal({ attentionItems: managerHome?.attentionItems || [], openPopup, pushPopup, popPopup, closePopup, onDataChanged: handleRefresh });
    };

    useEffect(() => {
        if (dashboardEnabled) {
            refreshManagerHome();
        }
    }, [dashboardEnabled, refreshManagerHome]);

    useEffect(() => {
        if (calendarEnabled) {
            refreshCalendar();
        }
    }, [calendarEnabled, refreshCalendar]);

    useEffect(() => {
        if (dashboardEnabled && aiInsightsEnabled) {
            fetchAiBrief();
        }
    }, [dashboardEnabled, aiInsightsEnabled, fetchAiBrief]);

    const aiBrief = aiInsightsEnabled
        && aiBriefResponse?.enabled
        && ['ai', 'analysis'].includes(aiBriefResponse?.source)
        && Array.isArray(aiBriefResponse?.lines)
        && aiBriefResponse.lines.length > 0
        ? aiBriefResponse
        : null;

    const calendarEvents = useMemo(
        () => calendarResponse?.events || calendarResponse?.data?.events || [],
        [calendarResponse],
    );
    const todayEventCount = useMemo(
        () => countJerusalemTodayEvents(calendarEvents),
        [calendarEvents],
    );

    const handleRefresh = useCallback(() => {
        if (dashboardEnabled) refreshManagerHome();
        if (calendarEnabled) refreshCalendar();
        if (dashboardEnabled && aiInsightsEnabled) {
            fetchAiBrief();
        }
    }, [dashboardEnabled, refreshManagerHome, calendarEnabled, refreshCalendar, aiInsightsEnabled, fetchAiBrief]);

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
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={logoNavigate} chosenNavKey="main" />}

            <SimpleScrollView>
                <SimpleContainer className="lw-commandCenter lw-commandCenter--business">
                    <header className="lw-businessHome__header">
                        <div><p className="lw-businessHome__eyebrow"><LayoutDashboard size={16} aria-hidden="true" />{t('managerHome.business.eyebrow')}</p>
                            <h1>{t('managerHome.business.title')}</h1>
                            <p>{new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p></div>
                        <SimpleButton className="lw-businessHome__refresh" onPress={handleRefresh} disabled={isLoadingHome || isLoadingCalendar || isLoadingAiBrief}>
                            <RefreshCw size={16} aria-hidden="true" />{t('managerHome.business.refresh')}
                        </SimpleButton>
                    </header>

                    {calendarEnabled ? <section id="manager-home-today" className="lw-businessHome__calendar">
                        <CalendarWidget events={calendarEvents} isPerforming={isLoadingCalendar} onEventPress={handleCalendarEventPress} />
                    </section> : null}

                    {dashboardEnabled ? (
                        <>
                            <SummaryStrip
                                summary={managerHome?.summary}
                                firmStats={managerHome?.firmStats}
                                todayCount={todayEventCount}
                                showSigning={signingDashboardEnabled}
                                isPerforming={isLoadingHome || isLoadingCalendar}
                                onNavigate={handleSummaryNavigate}
                            />

                            <div className={`lw-businessHome__focus${aiInsightsEnabled ? '' : ' lw-businessHome__focus--single'}`}>
                                <AiBriefSection
                                    aiBrief={aiBrief}
                                    aiBriefEnabled={aiInsightsEnabled}
                                    aiBriefLoading={aiInsightsEnabled && isLoadingAiBrief}
                                    settingsLoaded={settingsLoaded}
                                    isPerforming={isLoadingHome}
                                />
                                <TeamActivityPanel activity={managerHome?.teamActivity} isPerforming={isLoadingHome} />
                            </div>

                            <FirmStatsPanel
                                showActivityLeader={false}
                                showSigning={signingDashboardEnabled}
                                firmStats={managerHome?.firmStats}
                                drillDown={managerHome?.drillDown}
                                signing={signingDashboardEnabled ? managerHome?.signing : null}
                                attentionItems={managerHome?.attentionItems || []}
                                todayEvents={calendarEnabled ? managerHome?.today || [] : []}
                                onTodayEventPress={handleCalendarEventPress}
                                isPerforming={isLoadingHome}
                                onDataChanged={handleRefresh}
                            />

                            <SimpleContainer className={`lw-commandCenter__grid${signingDashboardEnabled ? '' : ' lw-commandCenter__grid--single'}`}>
                                <CaseOperationsPanel
                                    managerWorkload={managerHome?.managerWorkload || []}
                                    unassignedCases={managerHome?.unassignedCases}
                                    drillDown={managerHome?.drillDown}
                                    isPerforming={isLoadingHome}
                                    onDataChanged={handleRefresh}
                                />

                                {signingDashboardEnabled ? (
                                    <SigningOperationsPanel
                                        signing={managerHome?.signing}
                                        isPerforming={isLoadingHome}
                                        onDataChanged={handleRefresh}
                                    />
                                ) : null}
                            </SimpleContainer>

                            {clientsDashboardEnabled && (managerHome?.potentialClients?.length > 0) ? (
                                <PotentialClientsPanel
                                    items={managerHome.potentialClients}
                                    isPerforming={isLoadingHome}
                                    openPopup={openPopup}
                                    onEventPress={handleCalendarEventPress}
                                />
                            ) : null}
                        </>
                    ) : mainEnabled ? (
                        <SimpleContainer className="lw-commandCenter__state">
                            <Text14>לוח הבקרה זמין — אין הרשאת צפייה בתיקים לתצוגת נתונים מלאה.</Text14>
                        </SimpleContainer>
                    ) : null}
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
